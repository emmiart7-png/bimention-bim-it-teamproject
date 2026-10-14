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
  const STATE_TEXT = { night: '해 없음', back: '해가 입면 뒤', open: '열림', closed: '닫힘', winter: '겨울 모드 · 해와 나란히', shade: '그늘 · 열림' };
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
    if (f.state === 'shade') return '그늘 · 날 0°';
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
    g += `<text x="${cx}" y="${cy + 6}" text-anchor="middle" font-size="16" fill="#8595A4">건물</text>`;
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
    const desc = sides.map(sd => `${sd.key} ${sideText(sd.f)}`).join(', ');
    return { svg: `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="건물 평면과 동 · 남 · 서 루버: ${esc(desc)}" xmlns="${NS}" style="width:100%;height:auto">${g}</svg>`, sides };
  }
  // 정사각형 평면도: 건물 외곽선 (지도에서 고른 건물, 없으면 1784 를 직사각형으로) 과 루버를 단 입면마다 날 · 이름표.
  // 이름표는 건물 둘레 원 위에 두고 서로 겹치지 않게 밀어낸 뒤, 입면 가운데와 가는 선으로 잇는다
  function defaultPlan(input) {
    // 1784 타워 대략 64 × 56 m (동서 × 남북), 입면 방위가 북 · 동 · 남 · 서에 가까운 것만
    const lat = input.site.lat_deg, lon = input.site.lon_deg, mx = 111320 * Math.cos(lat * Math.PI / 180), my = 110540;
    const ll = ([e, n]) => [lon + e / mx, lat + n / my], hw = 32, hh = 28;
    const ring = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh], [-hw, -hh]].map(ll);
    const edge = { 0: [[-hw, hh], [hw, hh]], 90: [[hw, hh], [hw, -hh]], 180: [[hw, -hh], [-hw, -hh]], 270: [[-hw, -hh], [-hw, hh]] };
    const fs = input.facades.map(f => { const k = [0, 90, 180, 270].find(d => angDiff(d, f.azimuth_deg) <= 45); return k === undefined ? null : { id: f.id, azimuth_deg: f.azimuth_deg, path: edge[k].map(ll) }; }).filter(Boolean);
    return { ring, fs };
  }
  function outlinePlanSVG(st, path, ds, plan) {
    const W = 640, H = 640, cx = 320, cy = 320, rs = 292;   // 해 길 원
    const P = az => [cx + rs * Math.sin(az * Math.PI / 180), cy - rs * Math.cos(az * Math.PI / 180)];
    const ring = plan.ring.slice(0, -1), lat0 = ring.reduce((t, p) => t + p[1], 0) / ring.length, lon0 = ring.reduce((t, p) => t + p[0], 0) / ring.length;
    const mx = 111320 * Math.cos(lat0 * Math.PI / 180), my = 110540, en = ([lon, lat]) => [(lon - lon0) * mx, (lat - lat0) * my];
    const pts = ring.map(en), xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const k = Math.min(253 / (Math.max(...xs) - Math.min(...xs) || 1), 253 / (Math.max(...ys) - Math.min(...ys) || 1));   // 건물 크기 (230 의 1.1배)
    const ox = (Math.max(...xs) + Math.min(...xs)) / 2, oy = (Math.max(...ys) + Math.min(...ys)) / 2;
    const S = ([e, n]) => [cx + (e - ox) * k, cy - (n - oy) * k];
    const sp = pts.map(S), rB = Math.max(...sp.map(p => Math.hypot(p[0] - cx, p[1] - cy)));   // 건물이 차지하는 반지름
    let g = `<rect width="${W}" height="${H}" fill="#FFFFFF"/>`;
    if (path.length > 1) g += `<polyline points="${path.map(az => P(az).map(r1).join(',')).join(' ')}" fill="none" stroke="#F2B544" stroke-width="5" stroke-linecap="round" stroke-dasharray="18 16"/>`;
    g += `<polygon points="${sp.map(p => p.map(r1).join(',')).join(' ')}" fill="#E8EDF3" stroke="#1E4E8C" stroke-width="2"/>`;
    const len = 16 * Math.min(1.6, Math.max(0.5, ds)), gap = 5, labels = [];
    let blades = '', edges = '';
    for (const f of plan.fs) {
      const s0 = st.facades.find(x => x.id === f.id); if (!s0) continue;
      const [a, b] = f.path.map(p => S(en(p))), az = f.azimuth_deg * Math.PI / 180;
      const n = [Math.sin(az), -Math.cos(az)], t = [Math.cos(az), Math.sin(az)];   // 화면: 바깥 법선 · 방위가 커지는 쪽
      if (!s0.louver) {
        edges += `<line x1="${r1(a[0])}" y1="${r1(a[1])}" x2="${r1(b[0])}" y2="${r1(b[1])}" stroke="#8595A4" stroke-width="3" stroke-dasharray="6 6"/>`;
        const m0 = [(a[0] + b[0]) / 2 + n[0] * 6, (a[1] + b[1]) / 2 + n[1] * 6];
        labels.push({ m: m0, phi: Math.atan2(m0[0] - cx, -(m0[1] - cy)), f: s0, w: Math.max(44, String(s0.id).length * 10 + 22) });
        continue;
      }
      const sgn = s0.side || 1, ang = (s0.angle || 0) * Math.PI / 180, ux = sgn * Math.sin(ang), uy = Math.cos(ang);
      const vx = ux * t[0] - uy * n[0], vy = ux * t[1] - uy * n[1], h = len / 2, off = gap + len / 2;
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), count = Math.max(2, Math.round(L / 18));
      for (let i = 0; i < count; i++) {
        const q = (i + 0.5) / count, px = a[0] + (b[0] - a[0]) * q + n[0] * off, py = a[1] + (b[1] - a[1]) * q + n[1] * off;
        blades += `<line x1="${r1(px - vx * h)}" y1="${r1(py - vy * h)}" x2="${r1(px + vx * h)}" y2="${r1(py + vy * h)}" stroke="#1E4E8C" stroke-width="4" stroke-linecap="round"/>`;
      }
      const m = [(a[0] + b[0]) / 2 + n[0] * (gap + len), (a[1] + b[1]) / 2 + n[1] * (gap + len)];
      labels.push({ m, phi: Math.atan2(m[0] - cx, -(m[1] - cy)), f: s0, w: Math.max(44, String(s0.id).length * 10 + 22) });
    }
    // 이름표: 해 궤도와 같은 중심의 원 위에 입면 순서대로 늘어놓는다 (순서를 지켜 이음선이 엉키지 않게, 겹치면 원을 따라 벌린다)
    const LH = 30, RL = rs - 38;
    labels.sort((p, q) => p.phi - q.phi);
    labels.forEach(l => { l.a = l.phi; });
    const ext = l => Math.abs(Math.cos(l.a)) * l.w + Math.abs(Math.sin(l.a)) * LH;   // 원을 따라가는 방향으로 차지하는 길이
    for (let it = 0; it < 300 && labels.length > 1; it++) {
      let moved = false;
      for (let i = 0; i < labels.length; i++) {
        const A = labels[i], B = labels[(i + 1) % labels.length];
        const gapA = (i + 1 === labels.length ? B.a + 2 * Math.PI : B.a) - A.a, need = ((ext(A) + ext(B)) / 2 + 8) / RL;
        if (gapA < need) { const d = (need - gapA) / 2; A.a -= d; B.a += d; moved = true; }
      }
      labels.forEach(l => { l.a += (l.phi - l.a) * 0.02; });
      if (!moved) break;
    }
    labels.forEach(l => { l.x = cx + RL * Math.sin(l.a); l.y = cy - RL * Math.cos(l.a); });
    // 그래도 이음선이 엇갈리면 (꺾인 모서리에 입면이 몰려 있을 때) 두 이름표 자리를 맞바꾼다
    const cross = (p, q) => {
      const o = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
      const P1 = p.m, P2 = [p.x, p.y], Q1 = q.m, Q2 = [q.x, q.y];
      return o(P1, P2, Q1) * o(P1, P2, Q2) < 0 && o(Q1, Q2, P1) * o(Q1, Q2, P2) < 0;
    };
    for (let it = 0; it < 20; it++) {
      let swapped = false;
      for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
        const A = labels[i], B = labels[j];
        if (!cross(A, B)) continue;
        [A.a, B.a] = [B.a, A.a]; [A.x, B.x] = [B.x, A.x]; [A.y, B.y] = [B.y, A.y];
        swapped = true;
      }
      if (!swapped) break;
    }
    let lab = '';
    // 이름표를 누르면 그 입면의 루버를 달거나 뗀다 (실선 테두리 = 루버 있음, 점선 = 없음, 하늘색 = 지금 닫힘)
    for (const l of labels) {
      const on = !!l.f.louver, active = on && (l.f.state === 'closed' || l.f.state === 'winter');
      lab += `<line x1="${r1(l.m[0])}" y1="${r1(l.m[1])}" x2="${r1(l.x)}" y2="${r1(l.y)}" stroke="#AEB8C2" stroke-width="1.5"${on ? '' : ' stroke-dasharray="4 4"'}/>`;
      lab += `<g class="facelab" data-fid="${esc(l.f.id)}" role="button" tabindex="0" aria-pressed="${on}" aria-label="${esc(l.f.id)} 입면 루버 ${on ? '있음 (누르면 뗌)' : '없음 (누르면 닮)'}" style="cursor:pointer">`;
      lab += `<title>${esc(l.f.id)} · ${l.f.azimuth_deg}° · 루버 ${on ? '있음' : '없음'} (누르면 바뀜)</title>`;
      lab += `<rect x="${r1(l.x - l.w / 2)}" y="${r1(l.y - LH / 2)}" width="${l.w}" height="${LH}" rx="8" fill="${on ? (active ? '#E8F3FF' : '#FFFFFF') : '#F7F8FA'}" stroke="${on ? '#1E4E8C' : '#AEB8C2'}" stroke-width="${on ? 2 : 1.5}"${on ? '' : ' stroke-dasharray="4 3"'}/>`;
      lab += `<text x="${r1(l.x)}" y="${r1(l.y + 5)}" text-anchor="middle" font-size="15" font-weight="700" fill="${on ? (active ? '#0064E0' : '#0A1317') : '#8595A4'}">${esc(l.f.id)}</text></g>`;
    }
    g += edges + blades + lab;
    if (st.sun.alt > 0) {
      const [sx, sy] = P(st.sun.az);
      let rays = '';
      for (let i = 0; i < 12; i++) { const t = i * Math.PI / 6, c = Math.cos(t), s2 = Math.sin(t); rays += `<line x1="${r1(sx + c * 18.9)}" y1="${r1(sy + s2 * 18.9)}" x2="${r1(sx + c * (i % 2 ? 25.2 : 28.8))}" y2="${r1(sy + s2 * (i % 2 ? 25.2 : 28.8))}"/>`; }
      g += `<g stroke="#F2A20C" stroke-width="1.75" stroke-linecap="round">${rays}</g><circle cx="${r1(sx)}" cy="${r1(sy)}" r="14.4" fill="#FFC93C" stroke="#F2A20C" stroke-width="2.7"/>`;
    }
    // 위쪽 빈 곳 (여름엔 북쪽 해 길이 비어 있음) 을 잘라 시뮬레이션과 간격을 줄인다
    const ysAll = [...sp.map(p => p[1]), ...labels.map(l => l.y - 15), ...path.map(az => P(az)[1])];
    if (st.sun.alt > 0) ysAll.push(P(st.sun.az)[1] - 36);
    const y0 = Math.max(0, Math.floor(Math.min(...ysAll) - 14), 0);
    ysAll.length = 0;
    // 방위표: 3D · 유니티 화면 나침반과 같은 모양 (위 = 북)
    const nx = W - 44, ny = y0 + 44, kq = 0.64;
    g += `<g aria-hidden="true" transform="translate(${nx} ${ny}) scale(${kq})"><circle r="46" fill="rgba(255,255,255,.9)" stroke="#283848" stroke-width="2.25"/>`
      + `<path d="M-5 0 L0 -30 L5 0 Z" fill="#DC2E29"/><path d="M-5 0 L0 30 L5 0 Z" fill="#8C99A8"/>`
      + [['N', 0, '#DC2E29'], ['E', 90, '#283848'], ['S', 180, '#283848'], ['W', 270, '#283848']].map(([t, d, c]) => `<text x="${Math.round(Math.sin(d * Math.PI / 180) * 34)}" y="${Math.round(-Math.cos(d * Math.PI / 180) * 34) + 6}" text-anchor="middle" font-size="17" font-weight="700" fill="${c}" font-family="sans-serif">${t}</text>`).join('')
      + '</g>';
    const desc = labels.map(l => `${l.f.id} ${sideText(l.f)}`).join(', ');
    return `<svg viewBox="0 ${y0} ${W} ${H - y0}" role="img" aria-label="건물 평면과 루버: ${esc(desc)}" xmlns="${NS}" style="width:100%;height:auto">${g}</svg>`;
  }
  // minsF: 재생 중에는 분 단위 소수 (해가 같은 빠르기로 움직이도록 시간 간격을 바꾼다), 아니면 슬라이더 값
  function renderPlans(minsF) {
    if (!last) return;
    const [y, m, d] = $('simDate').value.split('-').map(Number);
    const mins = typeof minsF === 'number' ? minsF : Number($('simTime').value), hh = Math.floor(mins / 60), mm = mins - hh * 60;
    const mi = Math.floor(mm), sec = Math.floor((mm - mi) * 60);
    $('simTimeOut').textContent = `${String(hh).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
        if (window.LouverBridge && window.LouverBridge.sendDateTime) window.LouverBridge.sendDateTime(`${$('simDate').value}T${String(hh).padStart(2, '0')}:${String(mi).padStart(2, '0')}:${String(sec).padStart(2, '0')}+09:00`);
    const st = E.stateAt(last.input, y || 2026, m || 6, d || 21, hh, mm);
    if (window.Model3D) window.Model3D.update(last.input, { y: y || 2026, m: m || 6, d: d || 21, hh, mm });
    $('sunInfo').textContent = st.sun.alt > 0 ? `태양 고도 ${r1(st.sun.alt)}° · 방위 ${r1(st.sun.az)}°` : '해가 진 시각입니다';
    // 오늘 해가 떠 있는 동안의 방위 (10분 간격)
    const path = [];
    for (let t = 0; t < 1440; t += 10) { const sp = E.sunPosition(last.input.site.lat_deg, last.input.site.lon_deg, y || 2026, m || 6, d || 21, Math.floor(t / 60), t % 60); if (sp.alt > 0) path.push(sp.az); }
    const spec = E.merge(E.DEFAULT_SPEC, last.input.louver_spec), ds = spec.blade_depth_mm / spec.blade_spacing_mm;
    // 평면도: 지도에서 고른 건물이면 그 외곽선, 아니면 1784 를 직사각형으로 (정사각형 그림)
    $('plans').innerHTML = `<div class="siteplan">${outlinePlanSVG(st, path, ds, window.SitePlan || defaultPlan(last.input))}</div>`; return;
    const { svg, sides } = sitePlanSVG(st, path, ds);
    const many = sides.filter(sd => sd.n > 1).map(sd => `${sd.key} ${sd.n}개 면 중 ${sd.f.id}`);
    $('plans').innerHTML = `<div class="siteplan">${svg}</div>` + (many.length ? `<p class="muted">입면이 여러 개인 방위는 대표 입면으로 그렸습니다: ${esc(many.join(' · '))}</p>` : '');
  }
  let timer = null;
  // 평면도 이름표를 누르면 그 입면의 루버를 달거나 뗀다 (숨긴 2. 입면 표의 체크와 연결)
  const toggleFace = fid => {
    const tr = [...document.querySelectorAll('#facades tbody tr')].find(r => r.querySelector('.f-id').value === fid); if (!tr) return;
    const cb = tr.querySelector('.f-lv'); cb.checked = !cb.checked; cb.dispatchEvent(new Event('change', { bubbles: true }));
  };
  $('plans').addEventListener('click', e => { const g = e.target.closest('[data-fid]'); if (g) toggleFace(g.dataset.fid); });
  $('plans').addEventListener('keydown', e => { const g = e.target.closest('[data-fid]'); if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleFace(g.dataset.fid); } });
  $('simTime').addEventListener('input', () => { simMin = Number($('simTime').value); renderPlans(); });
  let simMin = null;
  $('simDate').addEventListener('change', renderPlans);
  document.querySelectorAll('[data-day]').forEach(b => b.onclick = () => { $('simDate').value = b.dataset.day; renderPlans(); });
  $('simPlay').onclick = () => {
    if (timer) { cancelAnimationFrame(timer); timer = null; $('simPlay').textContent = '재생'; return; }
    $('simPlay').textContent = '멈춤';
    // 해가 평면도에서 같은 빠르기로 움직이게: 실제 흐른 시간(초) × 27°/초 만큼 해 방위가 움직이도록 시간 간격을 정한다.
    // 화면이 느려져도 (한낮에 날이 돌면 Unity 가 무거워짐) 흐른 시간만큼 움직여 빠르기가 같다. 밤은 하루 재생이 빨리 지나가게 분당 300분
    if (simMin === null) simMin = Number($('simTime').value);
    let prevT = performance.now();
    const tick = now => {
      if (!timer) return;
      const dt = Math.min(0.1, (now - prevT) / 1000); prevT = now;
      if (last) {
        const [y, m, d] = $('simDate').value.split('-').map(Number), lat = last.input.site.lat_deg, lon = last.input.site.lon_deg;
        const at = t => { t = ((t % 1440) + 1440) % 1440; return E.sunPosition(lat, lon, y || 2026, m || 6, d || 21, Math.floor(t / 60), t % 60); };
        const p0 = at(simMin), p1 = at(simMin + 1);
        let step = 300 * dt;
        if (p0.alt > 0) { const rate = Math.abs(((p1.az - p0.az + 540) % 360) - 180); step = Math.min(220 * dt, 27 * dt / Math.max(rate, 1e-3)); }
        simMin = (simMin + step) % 1440;
        $('simTime').value = Math.round(simMin / 2) * 2;
        renderPlans(simMin);
      }
      timer = requestAnimationFrame(tick);
    };
    timer = requestAnimationFrame(tick);
  };

  // ---------------- 2. 누적 순이익 + 민감도 ----------------
  const SL = [['sCost', 'costMul', 'oCost', v => '×' + Number(v).toFixed(2)], ['sPrice', 'price', 'oPrice', v => v + '원'], ['sEsc', 'esc', 'oEsc', v => v + '%'], ['sMaint', 'maint', 'oMaint', v => v + '%']];
  // 민감도 슬라이더는 화면에서 뺐다 (없으면 건너뜀)
  function syncSliders() { for (const [s, f, o, fmt] of SL) { if (!$(s)) continue; $(s).value = $(f).value; $(o).textContent = fmt($(f).value); } }
  let pending = null;
  for (const [s, f, o, fmt] of SL) if ($(s)) $(s).addEventListener('input', () => {
    $(f).value = $(s).value; $(o).textContent = fmt($(s).value);
    clearTimeout(pending); pending = setTimeout(() => window.UI.run(), 60);
  });
  const ALT_COLOR = { internal_reactive: '#A121CE', external_fixed: '#8595A4', external_reactive: '#0064E0' };
  function renderChart() {
    if (!last) return;
    const years = 100, g = last.input.assumptions.elec_escalation;
    const series = Object.entries(last.out.result).map(([k, r]) => ({ k, name: r.name, v: E.cumulativeNet(r, g, years).map(x => x / 1e8), be: r.money.breakeven_year }));
    const all = series.flatMap(s => s.v).concat([0]);
    let lo = Math.min(...all), hi = Math.max(...all); if (hi - lo < 1) hi = lo + 1;
    const step = niceStep((hi - lo) / 5); lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const W = 600, H = 320, L = 70, R = 118, T = 20, B = 40;
    const X = t => L + t / years * (W - L - R), Y = v => T + (hi - v) / (hi - lo) * (H - T - B);
    let s = '';
    for (let v = lo; v <= hi + 1e-9; v += step) s += `<line x1="${L}" x2="${W - R}" y1="${r1(Y(v))}" y2="${r1(Y(v))}" stroke="#DEE3E9"/><text x="${L - 8}" y="${r1(Y(v) + 4)}" text-anchor="end" font-size="15" fill="#5D6C7B">${fmtNum(v)}억</text>`;
    for (let t = 0; t <= years; t += 20) s += `<text x="${r1(X(t))}" y="${H - 12}" text-anchor="middle" font-size="15" fill="#5D6C7B">${t}년</text>`;
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
    external_reactive: { name: '외부 반응형', legend: [['#0064E0', '닫힘'], ['#FCE3A0', '열림 · 햇빛 들어옴'], ['#FA9A2A', '겨울 모드 · 난방일 해와 나란히 (눈부신 시각 0°)'], ['#C9D6E3', '주변 건물 그늘 · 열림']] },
    internal_reactive: { name: '내부 반응형', legend: [['#A121CE', '닫힘 (열은 이미 실내에)'], ['#FCE3A0', '열림 · 햇빛 들어옴']] },
    external_fixed: { name: '외부 고정 (날 0°)', legend: [['#F7B928', '유리까지 들어오는 직달']] }
  };
  function cell(alt, st) {
    if (!st || st.state === 'night' || st.state === 'back' || !st.tr) return ['#E6EAEE', 1];
    if (alt === 'external_fixed') return ['#F7B928', 0.08 + 0.92 * st.tr.external_fixed];
    if (alt === 'internal_reactive') return st.rule ? ['#A121CE', 0.3 + 0.7 * Math.min(1, st.rule_angle / 90)] : ['#FCE3A0', 1];
    if (st.state === 'closed') return ['#0064E0', 0.3 + 0.7 * Math.min(1, st.angle / 90)];
    if (st.state === 'winter') return ['#FA9A2A', 1];
    if (st.state === 'shade') return ['#C9D6E3', 1];
    return ['#FCE3A0', 1];
  }
  function heatSVG(id, alt, grid) {
    const cw = 13, ch = 11, L = 44, T = 18, cols = 48;  // 촘촘하게 (칸 높이 11)
    let s = '';
    for (let h = 0; h <= 24; h += 3) s += `<text x="${L + h * 2 * cw}" y="13" text-anchor="middle" font-size="12" fill="#5D6C7B">${h}시</text>`;
    for (let m = 1; m <= 12; m++) {
      const y = T + (m - 1) * ch;
      s += `<text x="${L - 6}" y="${y + 9}" text-anchor="end" font-size="10" fill="#5D6C7B">${m}월</text>`;
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
    const i = last.input, src = ($('srcNote').textContent || '').replace(/^s*·s*/, ''), a = i.assumptions || {}, sp = i.louver_spec || {};
    const fs = i.facades.map(f => `${esc(f.id)} ${f.azimuth_deg}° ${r1(f.window_area_m2)}㎡${f.louver ? '' : ' (루버 없음)'}`).join(' · ');
    $('printSite').innerHTML = `<p><b>${esc(i.site.address || '주소 미입력')}</b> · 위도 ${i.site.lat_deg} · 경도 ${i.site.lon_deg} · ${i.project_type === 'remodel' ? '리모델링' : '신축'} · 겨울 모드 ${i.winter_mode !== false ? '사용' : '안 함'}</p><p>입면: ${fs}</p><p>가정: 날 깊이 ${sp.blade_depth_mm} mm · 간격 ${sp.blade_spacing_mm} mm · 전기요금 ${a.elec_price_krw_kwh}원/kWh (연 ${r1((a.elec_escalation || 0) * 100)}% 인상) · COP 냉방 ${a.cop_cooling} / 난방 ${a.cop_heating} · 일사 1 kWh당 냉방 부하 ${a.cooling_load_per_kwh} / 난방 부하 ${a.heating_load_per_kwh} kWh (추정, 난방 ±20%) · 배출계수 ${a.emission_t_mwh} tCO₂/MWh · 단가 배율 ${a.cost_multiplier}</p><p class="muted">일사량: ${src} · 출력 ${new Date().toLocaleDateString('ko-KR')} · 반응형외피 검토 도구 v0.1 · 임시 단가 기준 개략 검토</p>`;
  }
  function note(html) { const m = $('hdrMsg'); m.innerHTML = html; m.hidden = false; }
  const framed = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
  if (framed) note('미리보기 창 안에서는 인쇄와 클립보드 복사가 막혀 있습니다. 크롬이나 엣지에서 직접 열어 주세요.');
  // Ctrl + P 로 바로 인쇄해도 요약이 최신이 되게
  window.addEventListener('beforeprint', renderPrintSummary);
  $('printBtn').onclick = async () => { renderPrintSummary(); if (window.runCapture) { note('인쇄용 화면을 찍는 중입니다 (Unity 는 10~20초)…'); try { await window.runCapture(); } catch (e) { console.warn(e); } } if (window.preparePrint) { try { await window.preparePrint(); } catch (e) { console.warn(e); } } note('인쇄 창이 열리지 않으면 <b>Ctrl + P</b>를 누르세요. 대상에서 "PDF로 저장"을 고르면 PDF가 됩니다.'); try { window.print(); } catch (e) {} };

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

  // ---------------- 에너지 구성: 대안마다 냉방 절감(+) 과 조명 · 난방 증가(−), 순 절감 ----------------
  function renderEnergy() {
    const el = $('energyBars'); if (!el || !last || !last.out) return;
    const R = last.out.result;
    const rows = [['internal_reactive', '내부 반응형'], ['external_fixed', '외부 고정'], ['external_reactive', '외부 반응형']].filter(([k]) => R[k]).map(([k, n]) => ({ n, ...R[k].energy }));
    if (!rows.length) { el.innerHTML = ''; return; }
    // 가운데 0 을 기준으로 왼쪽 = 늘어난 전기 (조명 · 겨울 난방), 오른쪽 = 줄어든 전기 (냉방). 각 줄 아래 가는 막대 = 순 절감
    const W = 640, labW = 84, netW = 84, head = 22, rowH = 50, H = head + rows.length * rowH;
    const neg = Math.max(...rows.map(r => r.lighting_added_mwh_yr + r.heating_added_mwh_yr), 1e-6), pos = Math.max(...rows.map(r => Math.max(r.cooling_saved_mwh_yr, r.net_saved_mwh_yr)), 1e-6);
    const sc = (W - labW - netW - 8) / (neg + pos), z = labW + neg * sc;
    const seg = (x, w, y, h, fill, v, tip) => `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(Math.max(w, 0))}" height="${h}" fill="${fill}"><title>${tip} ${r1(v)} MWh/년</title></rect>`
      + (w >= 34 ? `<text x="${r1(x + w / 2)}" y="${r1(y + h / 2 + 4.5)}" text-anchor="middle" font-size="10.5" font-weight="700" fill="#FFFFFF">${r1(v)}</text>` : '');
    let g = `<text x="${r1(z - 6)}" y="14" text-anchor="end" font-size="11" fill="#5D6C7B">← 늘어난 전기</text><text x="${r1(z + 6)}" y="14" font-size="11" fill="#5D6C7B">줄어든 전기 →</text>`;
    rows.forEach((r, i) => {
      const y = head + i * rowH, bh = 20, by = y + 6, ny = by + bh + 4, nh = 7;
      const L = r.lighting_added_mwh_yr * sc, Hh = r.heating_added_mwh_yr * sc, C = r.cooling_saved_mwh_yr * sc, N = r.net_saved_mwh_yr;
      g += `<text x="0" y="${r1(by + 15)}" font-size="12" font-weight="700" fill="#0A1317">${esc(r.n)}</text>`;
      g += seg(z, C, by, bh, '#0064E0', r.cooling_saved_mwh_yr, '냉방 절감');
      g += seg(z - L, L, by, bh, '#8595A4', r.lighting_added_mwh_yr, '조명 증가');
      g += seg(z - L - Hh, Hh, by, bh, '#E08A00', r.heating_added_mwh_yr, '겨울 난방 증가');
      const col = N >= 0 ? '#0A1317' : '#C0392B';
      g += `<rect x="${r1(N >= 0 ? z : z + N * sc)}" y="${r1(ny)}" width="${r1(Math.abs(N) * sc)}" height="${nh}" rx="2" fill="${col}"><title>순 절감 ${r1(N)} MWh/년</title></rect>`;
      g += `<text x="${W}" y="${r1(by + 15)}" text-anchor="end" font-size="12" font-weight="700" fill="${col}">순 ${r1(N)}</text>`;
    });
    g = `<line x1="${r1(z)}" y1="${head - 2}" x2="${r1(z)}" y2="${H}" stroke="#5D6C7B" stroke-width="1.5"/>` + g;
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="대안별 에너지 구성: ${esc(rows.map(r => r.n + ' 냉방 절감 ' + r1(r.cooling_saved_mwh_yr) + ', 조명 증가 ' + r1(r.lighting_added_mwh_yr) + ', 난방 증가 ' + r1(r.heating_added_mwh_yr) + ', 순 ' + r1(r.net_saved_mwh_yr) + ' MWh/년').join('; '))}" xmlns="${NS}">${g}</svg>`
      + '<div class="legend"><span><i style="background:#0064E0"></i>냉방 절감</span><span><i style="background:#8595A4"></i>조명 증가</span><span><i style="background:#E08A00"></i>겨울 난방 증가</span><span><i style="background:#0A1317;height:6px;vertical-align:1px"></i>순 절감 = 냉방 − 조명 − 난방</span></div>';
  }

  // ---------------- 결과가 나올 때마다 갱신 ----------------
  function onResult(r) {
    last = r; syncSliders(); renderPlans(); renderChart(); renderEnergy(); renderHeatmapOptions(); renderHeatmap(); renderPrintSummary();
  }
  window.addEventListener('louver:result', e => onResult(e.detail));
  if (!loadFromHash() && window.UI.getLast()) onResult(window.UI.getLast());
})();
