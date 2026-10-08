/*
 * 추가 기능
 * 1. 날짜 · 시간 슬라이더 + 입면별 루버 평면도 애니메이션
 * 2. 누적 순이익 그래프 + 민감도 슬라이더
 * 3. 연간 운영 히트맵
 * 4. 인쇄 / PDF
 * 5. 링크로 공유
 */
(function () {
  'use strict';
  if (!window.LouverEngine || !window.UI) return;
  const $ = id => document.getElementById(id);
  const E = window.LouverEngine;
  const NS = 'http://www.w3.org/2000/svg';
  const r1 = v => Math.round(v * 10) / 10;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let last = null;

  // ---------------- 1. 하루 재생 ----------------
  const STATE_TEXT = { night: '해 없음', back: '해가 입면 뒤', open: '열림', closed: '닫힘', winter: '겨울 모드 · 햇빛과 나란히' };
  // 건물 평면 하나 (위 = 북) 에 동 · 남 · 서 루버와 오늘 해가 지나는 길을 함께 그린다
  const SIDES = [{ key: '동', az: 90 }, { key: '남', az: 180 }, { key: '서', az: 270 }];
  const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
  // 방위마다 대표 입면: 루버를 단 입면 중 방위가 ±45° 안에서 가장 가깝고, 같으면 창이 큰 것
  function pickSides(fs) {
    const area = id => { const f = last.input.facades.find(x => x.id === id); return f ? (f.window_area_m2 || 0) : 0; };
    return SIDES.map(sd => {
      const c = fs.filter(f => angDiff(f.azimuth_deg, sd.az) <= 45);
      c.sort((a, b) => angDiff(a.azimuth_deg, sd.az) - angDiff(b.azimuth_deg, sd.az) || area(b.id) - area(a.id));
      return { ...sd, f: c[0] || null, n: c.length };
    });
  }
  function sideText(f) {
    if (!f) return '루버 없음';
    if (f.state === 'night') return '해 없음 · 날 0°';
    if (f.state === 'back') return '해가 뒤 · 날 0°';
    if (f.state === 'winter') return `겨울 모드 · 날 ${Math.round(f.angle)}°`;
    return `${f.state === 'closed' ? '닫힘' : '열림'} · 날 ${Math.round(f.angle || 0)}°`;
  }
  function sitePlanSVG(st, path, ds) {
    const W = 880, H = 500, cx = 440, cy = 190, bw = 300, bh = 190;
    const L = cx - bw / 2, R = cx + bw / 2, T = cy - bh / 2, B = cy + bh / 2;
    const rx = 400, ry = 280; // 해 길 타원
    const P = az => [cx + rx * Math.sin(az * Math.PI / 180), cy - ry * Math.cos(az * Math.PI / 180)];
    let g = `<rect width="${W}" height="${H}" fill="#FFFFFF"/>`;
    // 오늘 해가 지나는 길 (해 뜬 동안의 방위)
    if (path.length > 1) g += `<polyline points="${path.map(az => P(az).map(r1).join(',')).join(' ')}" fill="none" stroke="#F2B544" stroke-width="5" stroke-linecap="round" stroke-dasharray="18 16"/>`;
    // 건물
    g += `<rect x="${L}" y="${T}" width="${bw}" height="${bh}" fill="#E8EDF3" stroke="#1E4E8C" stroke-width="2"/>`;
    g += `<text x="${cx}" y="${cy + 6}" text-anchor="middle" font-size="16" fill="#8595A4">건물 (위 = 북)</text>`;
    // 루버 날: 각 입면의 바깥 방향 n, 입면을 따라가는 방향 t
    const len = 22 * Math.min(1.6, Math.max(0.5, ds)), gap = 8;
    const sides = pickSides(st.facades.filter(f => f.louver));
    const geom = { 90: { n: [1, 0], t: [0, 1], x0: R + gap + len / 2, y0: T + 14, y1: B - 14, vertical: true },
      180: { n: [0, 1], t: [-1, 0], y0: B + gap + len / 2, x0: L + 16, x1: R - 16, vertical: false },
      270: { n: [-1, 0], t: [0, -1], x0: L - gap - len / 2, y0: T + 14, y1: B - 14, vertical: true } };
    for (const sd of sides) {
      if (!sd.f) continue;
      const G = geom[sd.az], f = sd.f, s = f.side || 1, a = (f.angle || 0) * Math.PI / 180;
      // 하루 재생 평면도와 같은 규칙: 날 0° = 유리에 수직, 각도만큼 해 쪽으로 돈다
      const ux = s * Math.sin(a), uy = Math.cos(a);
      const vx = ux * G.t[0] - uy * G.n[0], vy = ux * G.t[1] - uy * G.n[1], h = len / 2;
      const count = G.vertical ? 8 : 11;
      for (let i = 0; i < count; i++) {
        const k = i / (count - 1);
        const px = G.vertical ? G.x0 : G.x0 + (G.x1 - G.x0) * k, py = G.vertical ? G.y0 + (G.y1 - G.y0) * k : G.y0;
        g += `<line x1="${r1(px - vx * h)}" y1="${r1(py - vy * h)}" x2="${r1(px + vx * h)}" y2="${r1(py + vy * h)}" stroke="#1E4E8C" stroke-width="7" stroke-linecap="round"/>`;
      }
    }
    // 방위별 이름표
    const lab = { 90: [R + gap + len + 14, cy - 34, 'start'], 180: [cx, B + gap + len + 30, 'middle'], 270: [L - gap - len - 14, cy - 34, 'end'] };
    for (const sd of sides) {
      const [x, y, anc] = lab[sd.az], w = 140, bx = anc === 'start' ? x : anc === 'end' ? x - w : x - w / 2;
      const name = sd.f ? `${sd.key} · ${sd.f.azimuth_deg}°` : sd.key;
      const active = sd.f && (sd.f.state === 'closed' || sd.f.state === 'winter');
      g += `<rect x="${r1(bx)}" y="${y - 2}" width="${w}" height="64" rx="10" fill="${active ? '#E8F3FF' : '#F1F4F7'}"/>`;
      g += `<text x="${r1(bx + w / 2)}" y="${y + 24}" text-anchor="middle" font-size="19" font-weight="700" fill="#0A1317">${esc(name)}</text>`;
      g += `<text x="${r1(bx + w / 2)}" y="${y + 50}" text-anchor="middle" font-size="16" fill="${active ? '#0064E0' : '#5D6C7B'}">${esc(sideText(sd.f))}</text>`;
    }
    // 해
    if (st.sun.alt > 0) {
      const [sx, sy] = P(st.sun.az);
      g += `<circle cx="${r1(sx)}" cy="${r1(sy)}" r="26" fill="#FFF8EC" stroke="#F2B544" stroke-width="9"/>`;
    }
    g += `<text x="${W - 16}" y="28" text-anchor="end" font-size="15" fill="#8595A4">북 ↑</text>`;
    const desc = sides.map(sd => `${sd.key} ${sideText(sd.f)}`).join(', ');
    return { svg: `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="건물 평면과 동 · 남 · 서 루버: ${esc(desc)}" xmlns="${NS}" style="width:100%;height:auto">${g}</svg>`, sides };
  }
  function renderPlans() {
    if (!last) return;
    const [y, m, d] = $('simDate').value.split('-').map(Number);
    const mins = Number($('simTime').value), hh = Math.floor(mins / 60), mm = mins % 60;
    $('simTimeOut').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    if (window.LouverBridge && window.LouverBridge.sendDateTime) window.LouverBridge.sendDateTime(`${$('simDate').value}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+09:00`);
    const st = E.stateAt(last.input, y || 2026, m || 6, d || 21, hh, mm);
    $('sunInfo').textContent = st.sun.alt > 0 ? `태양 고도 ${r1(st.sun.alt)}° · 방위 ${r1(st.sun.az)}°` : '해가 진 시각입니다';
    // 오늘 해가 떠 있는 동안의 방위 (10분 간격)
    const path = [];
    for (let t = 0; t < 1440; t += 10) { const sp = E.sunPosition(last.input.site.lat_deg, last.input.site.lon_deg, y || 2026, m || 6, d || 21, Math.floor(t / 60), t % 60); if (sp.alt > 0) path.push(sp.az); }
    const spec = E.merge(E.DEFAULT_SPEC, last.input.louver_spec), ds = spec.blade_depth_mm / spec.blade_spacing_mm;
    const { svg, sides } = sitePlanSVG(st, path, ds);
    const many = sides.filter(sd => sd.n > 1).map(sd => `${sd.key} ${sd.n}개 면 중 ${sd.f.id}`);
    $('plans').innerHTML = `<div class="siteplan">${svg}</div>` + (many.length ? `<p class="muted">입면이 여러 개인 방위는 대표 입면으로 그렸습니다: ${esc(many.join(' · '))}</p>` : '');
  }
  let timer = null;
  $('simTime').addEventListener('input', renderPlans);
  $('simDate').addEventListener('change', renderPlans);
  document.querySelectorAll('[data-day]').forEach(b => b.onclick = () => { $('simDate').value = b.dataset.day; renderPlans(); });
  $('simPlay').onclick = () => {
    if (timer) { clearInterval(timer); timer = null; $('simPlay').textContent = '재생'; return; }
    $('simPlay').textContent = '멈춤';
    // 2분씩 18ms 마다 (예전과 같은 빠르기: 1시간 ≈ 0.5초). 10분씩 건너뛰면 한여름 정오 남면 날이 한 번에 20° 넘게 튄다
    timer = setInterval(() => { const t = $('simTime'); t.value = (Number(t.value) + 2) % 1440; renderPlans(); }, 18);
  };

  // ---------------- 2. 누적 순이익 + 민감도 ----------------
  const SL = [['sCost', 'costMul', 'oCost', v => '×' + Number(v).toFixed(2)], ['sPrice', 'price', 'oPrice', v => v + '원'], ['sEsc', 'esc', 'oEsc', v => v + '%'], ['sMaint', 'maint', 'oMaint', v => v + '%']];
  function syncSliders() { for (const [s, f, o, fmt] of SL) { $(s).value = $(f).value; $(o).textContent = fmt($(f).value); } }
  let pending = null;
  for (const [s, f, o, fmt] of SL) $(s).addEventListener('input', () => {
    $(f).value = $(s).value; $(o).textContent = fmt($(s).value);
    clearTimeout(pending); pending = setTimeout(() => window.UI.run(), 60);
  });
  const ALT_COLOR = { internal_reactive: '#A121CE', external_fixed: '#8595A4', external_reactive: '#0064E0' };
  function renderChart() {
    if (!last) return;
    const years = 60, g = last.input.assumptions.elec_escalation;
    const series = Object.entries(last.out.result).map(([k, r]) => ({ k, name: r.name, v: E.cumulativeNet(r, g, years).map(x => x / 1e8), be: r.money.breakeven_year }));
    const all = series.flatMap(s => s.v).concat([0]);
    let lo = Math.min(...all), hi = Math.max(...all); if (hi - lo < 1) hi = lo + 1;
    const step = niceStep((hi - lo) / 5); lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const W = 600, H = 320, L = 70, R = 118, T = 20, B = 40;
    const X = t => L + t / years * (W - L - R), Y = v => T + (hi - v) / (hi - lo) * (H - T - B);
    let s = '';
    for (let v = lo; v <= hi + 1e-9; v += step) s += `<line x1="${L}" x2="${W - R}" y1="${r1(Y(v))}" y2="${r1(Y(v))}" stroke="#DEE3E9"/><text x="${L - 8}" y="${r1(Y(v) + 4)}" text-anchor="end" font-size="15" fill="#5D6C7B">${fmtNum(v)}억</text>`;
    for (let t = 0; t <= years; t += 10) s += `<text x="${r1(X(t))}" y="${H - 12}" text-anchor="middle" font-size="15" fill="#5D6C7B">${t}년</text>`;
    s += `<line x1="${L}" x2="${W - R}" y1="${r1(Y(0))}" y2="${r1(Y(0))}" stroke="#0A1317" stroke-width="1.5"/>`;
    const ends = [{ y: Y(0), c: "#0A1317", t: "통유리 = 0" }];
    for (const se of series) {
      const c = ALT_COLOR[se.k] || '#0064E0';
      s += `<polyline fill="none" stroke="${c}" stroke-width="${se.k === 'external_reactive' ? 3 : 2}" points="${se.v.map((v, t) => r1(X(t)) + ',' + r1(Y(v))).join(' ')}"/>`;
      if (se.be !== null && se.be <= years) s += `<circle cx="${r1(X(se.be))}" cy="${r1(Y(se.v[se.be]))}" r="5" fill="${c}"/><text x="${r1(X(se.be))}" y="${r1(Y(se.v[se.be]) - 10)}" text-anchor="middle" font-size="15" font-weight="600" fill="${c}">${se.be}년</text>`;
      ends.push({ y: Y(se.v[years]), c, t: se.name });
    }
    ends.sort((a, b) => a.y - b.y); for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 19) ends[i].y = ends[i - 1].y + 19;
    for (const e of ends) s += `<text x="${W - R + 6}" y="${r1(e.y + 4)}" font-size="15" font-weight="600" fill="${e.c}">${esc(e.t)}</text>`;
    const beText = series.map(se => `${se.name} ${se.be === null ? '100년 초과' : se.be + '년'}`).join(', ');
    $('cumChart').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="통유리 대비 누적 순이익 그래프. 손익분기: ${esc(beText)}" xmlns="${NS}" style="width:100%;height:auto">${s}</svg>`;
  }
  function niceStep(x) { const p = Math.pow(10, Math.floor(Math.log10(Math.max(x, 1e-9)))), n = x / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
  function fmtNum(v) { return Math.abs(v) >= 10 ? Math.round(v).toLocaleString('ko-KR') : r1(v).toLocaleString('ko-KR'); }

  // ---------------- 3. 연간 운영 히트맵 ----------------
  function renderHeatmapOptions() {
    const sel = $('hmFacade'), prev = sel.value;
    const fs = last.input.facades.filter(f => f.louver);
    sel.innerHTML = fs.map(f => `<option value="${esc(f.id)}">${esc(f.id)} · ${f.azimuth_deg}°</option>`).join('');
    if (fs.some(f => f.id === prev)) sel.value = prev;
  }
  // 칸 색: 대안마다 의미가 다르다
  //  외부 반응형: 닫힘(파랑, 진할수록 많이 돎) · 열림 · 겨울 모드
  //  내부 반응형: 같은 규칙으로 닫지만 열은 이미 실내에 (보라). 겨울 모드 없음
  //  외부 고정 (날 0°): 움직이지 않음. 유리까지 들어오는 직달 비율 (노랑이 진할수록 많이 들어옴)
  const HM = {
    external_reactive: { name: '외부 반응형', legend: [['#0064E0', '닫힘 (진할수록 많이 돎)'], ['#FCE3A0', '열림 · 햇빛 들어옴'], ['#FA9A2A', '겨울 모드 · 햇빛과 나란히']] },
    internal_reactive: { name: '내부 반응형', legend: [['#A121CE', '닫힘 (열은 이미 실내에)'], ['#FCE3A0', '열림 · 햇빛 들어옴']] },
    external_fixed: { name: '외부 고정 (날 0°)', legend: [['#F7B928', '유리까지 들어오는 직달 (진할수록 많음)']] }
  };
  function cell(alt, st) {
    if (!st || st.state === 'night' || st.state === 'back' || !st.tr) return ['#E6EAEE', 1];
    if (alt === 'external_fixed') return ['#F7B928', 0.08 + 0.92 * st.tr.external_fixed];
    if (alt === 'internal_reactive') return st.rule ? ['#A121CE', 0.3 + 0.7 * Math.min(1, st.rule_angle / 90)] : ['#FCE3A0', 1];
    if (st.state === 'closed') return ['#0064E0', 0.3 + 0.7 * Math.min(1, st.angle / 90)];
    if (st.state === 'winter') return ['#FA9A2A', 1];
    return ['#FCE3A0', 1];
  }
  function heatSVG(id, alt, grid) {
    const cw = 13, ch = 20, L = 50, T = 26, cols = 48;
    let s = '';
    for (let h = 0; h <= 24; h += 3) s += `<text x="${L + h * 2 * cw}" y="17" text-anchor="middle" font-size="14" fill="#5D6C7B">${h}시</text>`;
    for (let m = 1; m <= 12; m++) {
      const y = T + (m - 1) * ch;
      s += `<text x="${L - 6}" y="${y + 13}" text-anchor="end" font-size="14" fill="#5D6C7B">${m}월</text>`;
      for (let c = 0; c < cols; c++) {
        const [fill, op] = cell(alt, grid[m - 1][c]);
        s += `<rect x="${L + c * cw}" y="${y}" width="${cw - 1}" height="${ch - 2}" fill="${fill}" fill-opacity="${r1(op)}"/>`;
      }
    }
    const W = L + cols * cw + 8, H = T + 12 * ch + 4;
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(id)} 입면 ${esc(HM[alt].name)}의 월별 · 시각별 상태" xmlns="${NS}" style="width:100%;height:auto">${s}</svg>`;
  }
  function renderHeatmap() {
    if (!last) return;
    const id = $('hmFacade').value, sel = $('hmAlt').value;
    if (!id) { $('heatmap').innerHTML = '<p class="muted">루버를 단 입면이 없습니다.</p>'; $('hmLegend').innerHTML = ''; return; }
    // 상태는 한 번만 계산해 세 대안이 같이 쓴다 (각 달 15일, 30분 간격)
    const grid = [];
    for (let m = 1; m <= 12; m++) { const row = []; for (let c = 0; c < 48; c++) row.push(E.stateAt(last.input, 2026, m, 15, Math.floor(c / 2), (c % 2) * 30).facades.find(f => f.id === id)); grid.push(row); }
    const alts = sel === 'all' ? ['external_reactive', 'internal_reactive', 'external_fixed'] : [sel];
    $('heatmap').innerHTML = alts.map(a => `${alts.length > 1 ? `<div class="hmcap">${esc(HM[a].name)}</div>` : ''}<div class="tablewrap">${heatSVG(id, a, grid)}</div>`).join('');
    const items = []; const seen = new Set();
    for (const a of alts) for (const [c, t] of HM[a].legend) { if (seen.has(c + t)) continue; seen.add(c + t); items.push(`<span><i style="background:${c}"></i>${esc(t)}</span>`); }
    items.push('<span><i style="background:#E6EAEE"></i>해 없음 · 입면 뒤</span>');
    $('hmLegend').innerHTML = items.join('');
  }
  $('hmFacade').addEventListener('change', renderHeatmap);
  $('hmAlt').addEventListener('change', renderHeatmap);

  // ---------------- 4. 인쇄 / PDF ----------------
  function renderPrintSummary() {
    if (!last) return;
    const i = last.input, src = { excel: '엑셀 검증 모드', unity: 'Unity 일사량', solar: '맑은 날 간이식' }[last.mode] || '';
    const fs = i.facades.map(f => `${esc(f.id)} ${f.azimuth_deg}° ${r1(f.window_area_m2)}㎡${f.louver ? '' : ' (루버 없음)'}`).join(' · ');
    $('printSite').innerHTML = `<p><b>${esc(i.site.address || '주소 미입력')}</b> · 위도 ${i.site.lat_deg} · 경도 ${i.site.lon_deg} · ${i.project_type === 'remodel' ? '리모델링' : '신축'} · 겨울 모드 ${i.winter_mode !== false ? '사용' : '안 함'}</p><p>입면: ${fs}</p><p class="muted">일사량: ${src} · 출력 ${new Date().toLocaleDateString('ko-KR')} · 반응형외피 검토 도구 v0.1 · 임시 단가 기준 개략 검토</p>`;
  }
  function note(html) { const m = $('hdrMsg'); m.innerHTML = html; m.hidden = false; }
  const framed = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
  if (framed) note('미리보기 창 안에서는 인쇄와 클립보드 복사가 막혀 있습니다. 크롬이나 엣지에서 직접 열어 주세요.');
  $('printBtn').onclick = () => { renderPrintSummary(); note('인쇄 창이 열리지 않으면 <b>Ctrl + P</b>를 누르세요. 대상에서 "PDF로 저장"을 고르면 PDF가 됩니다.'); try { window.print(); } catch (e) {} };

  // ---------------- 5. 링크로 공유 ----------------
  const b64e = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const b64d = s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
  $('shareBtn').onclick = async () => {
    const mode = document.querySelector('input[name=src]:checked').value;
    const code = b64e(JSON.stringify({ v: 1, m: mode === 'unity' ? 'solar' : mode, i: window.UI.readInput() }));
    const url = location.origin + location.pathname + '#s=' + code;
    history.replaceState(null, '', '#s=' + code);
    try { await navigator.clipboard.writeText(url); $('shareBtn').textContent = '복사됨'; setTimeout(() => $('shareBtn').textContent = '링크 복사', 2000); }
    catch (e) { /* 클립보드가 막힌 환경 */ }
    note('공유 링크 (복사되지 않았으면 아래 칸을 눌러 Ctrl + C):<br><input id="shareUrl" readonly style="margin-top:6px">'); const u = $('shareUrl'); u.value = url; u.onclick = () => u.select(); u.select();
  };
  function loadFromHash() {
    const m = location.hash.match(/^#s=([A-Za-z0-9_-]+)$/);
    if (!m) return false;
    try { const o = JSON.parse(b64d(m[1])); window.UI.fillInput(o.i, o.m); window.UI.run(); return true; }
    catch (e) { console.warn('공유 링크를 읽지 못함', e); return false; }
  }

  // ---------------- 결과가 나올 때마다 갱신 ----------------
  function onResult(r) {
    last = r; syncSliders(); renderPlans(); renderChart(); renderHeatmapOptions(); renderHeatmap(); renderPrintSummary();
  }
  window.addEventListener('louver:result', e => onResult(e.detail));
  if (!loadFromHash() && window.UI.getLast()) onResult(window.UI.getLast());
})();
