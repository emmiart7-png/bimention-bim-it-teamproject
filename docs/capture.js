/*
 * 보고서용 루버 화면 자동 캡처 (보고서 3.4절 "같은 입면의 열림 대 닫힘")
 * 1) 루버를 단 입면 중 ㎡당 냉방 절감이 가장 큰 입면을 고른다
 * 2) LouverEngine.stateAt 로 하루를 10분 간격으로 계산해 시각을 고른다
 *    - 닫힘 컷: 하지 중 그 입면이 closed 이고 날 각도가 가장 큰 시각
 *    - 열림 컷: 하지 중 열림(open)인 낮 시각, 없으면 해가 입면 뒤(back)인 시각 (고도 10° 이상, 그중 해가 가장 높은 때)
 *    - 계절 컷: 하지 12:30, 동지 중 겨울 모드(winter)이고 날이 해와 나란한 (각도 > 0) 시각 (그중 해가 가장 높은 때)
 * 3) 시각을 보내고 화면이 바뀔 때까지 기다린 뒤 이미지로 저장 (1784 = Unity, 다른 건물 = 웹 3D)
 * 4) 두 컷을 나란히, 왼쪽 위에 "하지 15:30 · 닫힘" 라벨, 아래에 캡션
 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const E = window.LouverEngine;
  if (!E || !$('capBtn')) return;
  window.runCapture = null;
  const sleep = ms => new Promise(ok => setTimeout(ok, ms));
  const frame = () => new Promise(ok => requestAnimationFrame(() => ok()));
  const hm = t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  const SUMMER = '2026-06-21', WINTER = '2026-12-21';
  const DAY_NAME = { [SUMMER]: '하지', [WINTER]: '동지' };
  const STATE_NAME = { closed: '닫힘', open: '열림', back: '열림 (해가 입면 뒤)', shade: '열림 (그늘)', night: '밤' };
  const stateText = f => f.state === 'winter' ? (f.angle ? '겨울 모드 (해와 나란히)' : '겨울 모드') : (STATE_NAME[f.state] || f.state);
  const status = t => { $('capStatus').textContent = t; };

  // 1. 보여 줄 입면: 루버를 단 입면 중 ㎡당 냉방 절감이 가장 큰 입면
  function pickFacade(last) {
    const pf = (last.out.result.external_reactive || {}).per_facade || [];
    const lv = new Set(last.input.facades.filter(f => f.louver).map(f => f.id));
    let best = null;
    for (const p of pf) {
      if (!lv.has(p.id) || !(p.window_area_m2 > 0)) continue;
      const v = p.cooling_saved_mwh_yr / p.window_area_m2;
      if (!best || v > best.v) best = { id: p.id, v };
    }
    return best && { ...best, f: last.input.facades.find(f => f.id === best.id) };
  }
  // 2. 하루를 10분 간격으로: 그 입면 상태와 해
  function day(input, iso, id) {
    const [y, m, d] = iso.split('-').map(Number), out = [];
    for (let t = 0; t < 1440; t += 10) {
      const st = E.stateAt(input, y, m, d, Math.floor(t / 60), t % 60);
      out.push({ t, sun: st.sun, f: st.facades.find(x => x.id === id) });
    }
    return out;
  }
  const best = (list, key) => list.reduce((p, q) => (!p || key(q) > key(p) ? q : p), null);
  function pickTimes(input, id) {
    const su = day(input, SUMMER, id), wi = day(input, WINTER, id);
    const closed = best(su.filter(s => s.f.state === 'closed'), s => s.f.angle);
    // 열림: 해가 입면 앞에 있는데 열린 시각(open)을 먼저, 없으면 해가 뒤(back). 그중 해가 가장 높은 때
    const day10 = su.filter(s => s.sun.alt >= 10);
    const open = best(day10.filter(s => s.f.state === 'open'), s => s.sun.alt) || best(day10.filter(s => s.f.state === 'back'), s => s.sun.alt);
    const noon = su.find(s => s.t === 750);
    const winter = best(wi.filter(s => s.f.state === 'winter' && s.f.angle > 0), s => s.sun.alt);
    const cut = (iso, s) => s && { iso, t: s.t, label: `${DAY_NAME[iso]} ${hm(s.t)} · ${stateText(s.f)}` };
    return {
      pair1: [cut(SUMMER, closed), cut(SUMMER, open)],
      pair2: [cut(SUMMER, noon), cut(WINTER, winter)],
      why: { closed: !!closed, open: !!open, winter: !!winter }
    };
  }
  // 입면 방위 → Unity LookAtFacade 이름
  const sideOf = az => ['north', 'east', 'south', 'west'][Math.round((((az % 360) + 360) % 360) / 90) % 4];

  // 3. 시각을 보내고 (renderPlans 가 Unity · 웹 3D 둘 다 갱신) 기다렸다가 이미지로
  async function shoot(cut, useModel) {
    $('simDate').value = cut.iso;
    $('simTime').value = cut.t;
    $('simTime').dispatchEvent(new Event('input'));
    if (useModel) { await frame(); await frame(); return window.Model3D.snapshot(); }
    await sleep(2000); await frame(); await frame();   // Unity 가 날을 돌리고 그림자를 다시 그릴 시간
    const c = document.getElementById('unity-canvas');
    return c ? c.toDataURL('image/png') : null;
  }
  const loadImg = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });

  // 4 · 5. 나란히 놓고 라벨 · 캡션
  async function compose(shots, caption) {
    const imgs = await Promise.all(shots.map(s => loadImg(s.src)));
    // 각 컷은 2:1 (화면 가운데를 잘라 냄: 입면이 가운데 오도록 카메라를 맞춘 상태)
    const cw = 960, ch = cw / 2, gap = 16, capH = 56;
    const cv = document.createElement('canvas');
    cv.width = cw * 2 + gap; cv.height = ch + capH;
    const g = cv.getContext('2d'), font = getComputedStyle(document.body).fontFamily;
    g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, cv.width, cv.height);
    imgs.forEach((im, i) => {
      const x = i * (cw + gap);
      const sw = Math.min(im.width, im.height * 2), sh = sw / 2;
      g.drawImage(im, (im.width - sw) / 2, (im.height - sh) / 2, sw, sh, x, 0, cw, ch);
      g.font = `700 24px ${font}`;
      const w = g.measureText(shots[i].label).width + 28;
      g.fillStyle = '#0064E0';
      g.beginPath(); g.roundRect ? g.roundRect(x + 14, 14, w, 42, 8) : g.rect(x + 14, 14, w, 42); g.fill();
      g.fillStyle = '#FFFFFF'; g.textBaseline = 'middle'; g.fillText(shots[i].label, x + 28, 35);
    });
    g.font = `400 22px ${font}`; g.fillStyle = '#0A1317'; g.textBaseline = 'middle'; g.textAlign = 'center';
    g.fillText(caption, cv.width / 2, ch + capH / 2);
    return cv.toDataURL('image/png');
  }

  // 인쇄 / PDF: 지금 평면도와 시뮬레이션 화면(Unity 또는 웹 3D)을 인쇄용 칸에 담는다
  window.preparePrint = () => {
    const useModel = window.simMode === 'model';
    $('printSimTitle').textContent = `루버 시뮬레이션 · ${$('simDate').value} ${$('simTimeOut').textContent}`;
    $('printPlan').innerHTML = $('plans').innerHTML;
    // 화면 가운데를 2:1 로 잘라 담는다 (보고서용 캡처와 같은 비율)
    const crop21 = c => {
      const sw = Math.min(c.width, c.height * 2), sh = sw / 2, o = document.createElement('canvas');
      o.width = sw; o.height = sh;
      o.getContext('2d').drawImage(c, (c.width - sw) / 2, (c.height - sh) / 2, sw, sh, 0, 0, sw, sh);
      return o.toDataURL('image/png');
    };
    let src = null;
    try {
      if (useModel) { if (window.Model3D && window.Model3D.hasModel) { window.Model3D.snapshot(); const c = document.querySelector('#model3d canvas'); if (c) src = crop21(c); } }
      else { const c = document.getElementById('unity-canvas'); if (c && window.unityInstance) src = crop21(c); }
    } catch (e) { console.warn(e); }
    const img = $('printShot');
    img.hidden = !src; if (src) img.src = src;
    $('printShotCap').textContent = src ? (useModel ? '선택한 건물 · 웹 3D (추정값)' : '네이버 1784 · Unity 시연') : '';
    $('printSim').classList.toggle('has', !!(src || $('plans').innerHTML));
    return src && img.decode ? img.decode().catch(() => {}) : Promise.resolve();
  };
  // Ctrl + P 로 바로 인쇄할 때도 (이미지는 바로 그려지지 않을 수 있어 인쇄 버튼을 권장)
  window.addEventListener('beforeprint', () => { try { window.preparePrint(); } catch (e) { console.warn(e); } });

  let busy = false;
  // 인쇄 / PDF 를 누르면 features.js 가 부른다 (화면에는 캡처 칸이 없고 인쇄물에만 나옴)
  window.runCapture = async () => {
    if (busy) return;
    const last = window.UI && window.UI.getLast();
    if (!last || !last.out) { status('먼저 계산 결과가 있어야 합니다.'); return; }
    const useModel = window.simMode === 'model';
    if (useModel && !(window.Model3D && window.Model3D.hasModel)) { status('선택한 건물 3D 가 아직 없습니다.'); return; }
    if (!useModel && !window.unityInstance) { status('Unity 가 아직 뜨지 않았습니다. 다 뜬 뒤 다시 눌러 주세요.'); return; }
    // Unity 장면이 아직 로딩 중이면 (로고 화면) 다 뜰 때까지 최대 30초 기다린다
    if (!useModel && !(window.LouverBridge && window.LouverBridge.ready)) {
      status('Unity 장면이 다 뜨기를 기다리는 중…');
      for (let i = 0; i < 60 && !window.LouverBridge.ready; i++) await sleep(500);
      await sleep(1500);
    }
    const pick = pickFacade(last);
    if (!pick) { status('루버를 단 입면이 없습니다.'); return; }
    const times = pickTimes(last.input, pick.id);
    busy = true; $('capBtn').disabled = true;
    // 지금 화면 기억 (끝나면 되돌림)
    const keep = { date: $('simDate').value, time: $('simTime').value };
    if ($('simPlay').textContent === '멈춤') $('simPlay').click();
    try {
      // 외관 화면, 그 입면을 정면에서 가깝게
      const ext = document.querySelector('input[name=uview][value=exterior]');
      if (ext && !ext.checked) { ext.checked = true; ext.dispatchEvent(new Event('change')); }
      if (useModel) window.Model3D.lookAtFaceFront(pick.id);
      else window.unityInstance.SendMessage('LouverViewSetup', 'LookAtFacade', sideOf(pick.f.azimuth_deg));
      await sleep(useModel ? 100 : 1200);
      const name = `${pick.id} 입면 (${Math.round(pick.f.azimuth_deg)}°)`;
      const caption = (useModel ? '웹 3D (추정값)' : 'Unity 시연') + ` · ${name}`;
      const out = [];
      for (const [key, title] of [['pair1', '닫힘 대 열림 (하지)'], ['pair2', '여름 대 겨울 (하지 · 동지)']]) {
        const cuts = times[key];
        if (cuts.some(c => !c)) { out.push({ title, miss: true }); continue; }
        const shots = [];
        for (const c of cuts) { status(`캡처 중… ${c.label}`); shots.push({ label: c.label, src: await shoot(c, useModel) }); }
        if (shots.some(s => !s.src)) { out.push({ title, miss: true }); continue; }
        out.push({ title, key, src: await compose(shots, caption) });
      }
      const why = [!times.why.closed && '하지에 닫히는 시각이 없음', !times.why.open && '하지에 열린 낮 시각이 없음', !times.why.winter && '동지에 겨울 모드 (해와 나란히) 시각이 없음'].filter(Boolean);
      $('capOut').innerHTML = out.map(o => o.miss
        ? `<p class="muted">${o.title}: 고를 시각이 없어 건너뜀</p>`
        : `<figure style="margin:12px 0"><img src="${o.src}" alt="${o.title}" style="width:100%;border-radius:8px;border:1px solid var(--line,#DDE3EA)"><figcaption style="display:flex;justify-content:space-between;align-items:center;margin-top:6px"><span>${o.title} · ${caption}</span><a download="louver_${o.key}_${pick.id}.png" href="${o.src}" style="font-size:14px;padding:6px 14px;border:1px solid #C9D3DD;border-radius:8px;color:inherit;text-decoration:none;background:#fff">내려받기</a></figcaption></figure>`).join('');
      $('capPanel').classList.toggle('has', out.some(o => !o.miss));
      status(`${name} · ㎡당 냉방 절감 ${(pick.v * 1000).toFixed(1)} kWh 로 가장 큼${why.length ? ' · ' + why.join(', ') : ''}`);
    } catch (e) {
      console.warn(e); status('캡처하지 못했습니다: ' + e.message);
    } finally {
      $('simDate').value = keep.date; $('simTime').value = keep.time; $('simTime').dispatchEvent(new Event('input'));
      busy = false; $('capBtn').disabled = false;
    }
  };
  $('capBtn').onclick = () => window.runCapture();
})();
