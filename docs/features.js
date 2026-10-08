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
  function planSVG(f, ds) {
    const W = 240, H = 176, bladeY = 92, glassY = 140, sp = 34, d = sp * Math.min(2, Math.max(0.3, ds));
    const s = f.side || 1, a = (f.angle || 0) * Math.PI / 180;
    let g = `<rect x="0" y="0" width="${W}" height="${glassY}" fill="#FFFFFF"/><rect x="0" y="${glassY}" width="${W}" height="${H - glassY}" fill="#E8F3FF"/>`;
    g += `<line x1="0" y1="${glassY}" x2="${W}" y2="${glassY}" stroke="#0064E0" stroke-width="2" stroke-dasharray="5 5"/>`;
    // 햇빛 화살표 (입면 앞에 해가 있을 때)
    if (f.tr) {
      const th = f.tilt * Math.PI / 180, dx = -s * Math.sin(th), dy = Math.cos(th), L = 52;
      for (const x0 of [60, 120, 180]) {
        const ex = x0, ey = bladeY - d / 2 - 8, sx = ex - dx * L, sy = ey - dy * L;
        const hx = ex - dx * 10, hy = ey - dy * 10, px = -dy * 5, py = dx * 5;
        g += `<line x1="${r1(sx)}" y1="${r1(sy)}" x2="${r1(hx)}" y2="${r1(hy)}" stroke="#F7B928" stroke-width="3"/><polygon points="${r1(ex)},${r1(ey)} ${r1(hx + px)},${r1(hy + py)} ${r1(hx - px)},${r1(hy - py)}" fill="#F7B928"/>`;
      }
    }
    // 루버 날 (위 = 바깥)
    const ux = s * Math.sin(a), uy = Math.cos(a), h = d / 2;
    for (let x = sp / 2; x < W; x += sp) g += `<line x1="${r1(x - ux * h)}" y1="${r1(bladeY - uy * h)}" x2="${r1(x + ux * h)}" y2="${r1(bladeY + uy * h)}" stroke="#0064E0" stroke-width="5" stroke-linecap="round"/>`;
    const label = `${f.id} 입면 루버: ${STATE_TEXT[f.state]}${f.angle ? ', 날 ' + Math.round(f.angle) + '도' : ''}`;
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}" xmlns="${NS}">${g}</svg>`;
  }
  function renderPlans() {
    if (!last) return;
    const [y, m, d] = $('simDate').value.split('-').map(Number);
    const mins = Number($('simTime').value), hh = Math.floor(mins / 60), mm = mins % 60;
    $('simTimeOut').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    const st = E.stateAt(last.input, y || 2026, m || 6, d || 21, hh, mm);
    $('sunInfo').textContent = st.sun.alt > 0 ? `태양 고도 ${r1(st.sun.alt)}° · 방위 ${r1(st.sun.az)}°` : '해가 진 시각입니다';
    const spec = E.merge(E.DEFAULT_SPEC, last.input.louver_spec), ds = spec.blade_depth_mm / spec.blade_spacing_mm;
    const fs = st.facades.filter(f => f.louver);
    $('plans').innerHTML = fs.length ? fs.map(f => {
      let txt = STATE_TEXT[f.state];
      if (f.state === 'closed') txt += ` · 날 ${Math.round(f.angle)}°`;
      if (f.tr && f.state !== 'closed') txt += ` · 직달 ${Math.round(f.tr.external_reactive * 100)}% 통과`;
      return `<div class="plan">${planSVG(f, ds)}<div class="st">${esc(f.id)} · ${f.azimuth_deg}°</div><div class="muted">${txt}</div></div>`;
    }).join('') : '<p class="muted">루버를 단 입면이 없습니다.</p>';
  }
  let timer = null;
  $('simTime').addEventListener('input', renderPlans);
  $('simDate').addEventListener('change', renderPlans);
  document.querySelectorAll('[data-day]').forEach(b => b.onclick = () => { $('simDate').value = b.dataset.day; renderPlans(); });
  $('simPlay').onclick = () => {
    if (timer) { clearInterval(timer); timer = null; $('simPlay').textContent = '재생'; return; }
    $('simPlay').textContent = '멈춤';
    timer = setInterval(() => { const t = $('simTime'); t.value = (Number(t.value) + 10) % 1440; renderPlans(); }, 90);
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
  function renderHeatmap() {
    if (!last) return;
    const id = $('hmFacade').value;
    if (!id) { $('heatmap').innerHTML = '<p class="muted">루버를 단 입면이 없습니다.</p>'; return; }
    const cw = 13, ch = 20, L = 50, T = 26, cols = 48;
    let s = '';
    for (let h = 0; h <= 24; h += 3) s += `<text x="${L + h * 2 * cw}" y="17" text-anchor="middle" font-size="14" fill="#5D6C7B">${h}시</text>`;
    for (let m = 1; m <= 12; m++) {
      const y = T + (m - 1) * ch;
      s += `<text x="${L - 6}" y="${y + 13}" text-anchor="end" font-size="14" fill="#5D6C7B">${m}월</text>`;
      for (let c = 0; c < cols; c++) {
        const st = E.stateAt(last.input, 2026, m, 15, Math.floor(c / 2), (c % 2) * 30).facades.find(f => f.id === id);
        let fill = '#E6EAEE', op = 1;
        if (st.state === 'closed') { fill = '#0064E0'; op = 0.3 + 0.7 * Math.min(1, st.angle / 90); }
        else if (st.state === 'open') fill = '#FCE3A0';
        else if (st.state === 'winter') fill = '#FA9A2A';
        s += `<rect x="${L + c * cw}" y="${y}" width="${cw - 1}" height="${ch - 2}" fill="${fill}" fill-opacity="${r1(op)}"/>`;
      }
    }
    const W = L + cols * cw + 8, H = T + 12 * ch + 4;
    $('heatmap').innerHTML = `<div class="tablewrap"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(id)} 입면의 월별 · 시각별 루버 상태" xmlns="${NS}" style="width:100%;height:auto">${s}</svg></div>`;
  }
  $('hmFacade').addEventListener('change', renderHeatmap);

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
