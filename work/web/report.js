/*
 * 상세 인쇄: 종합보고서 양식 (Louver_Review_Report_Draft_v2 와 같은 차례 · 모양)
 * - 건물마다 바뀌는 것 (개요 · 입면 · 일사 · 에너지 · 탄소 · 경제성 · 적용 제안 · 그림) 은 지금 웹 계산 결과로 채운다
 * - 1784 에서만 따로 분석한 것 (실내 눈부심 · EnergyPlus · 층별 · 수평 루버 · 검증) 은 "1784 검증 결과 (참고)" 로 같은 값을 싣는다
 * 상세 인쇄 버튼 → 보고서용 화면 캡처 → 보고서 만들기 → 인쇄 (body.print-detail 일 때만 보고서가 보이고 나머지는 숨김)
 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const E = window.LouverEngine;
  if (!E || !$('detailBtn')) return;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pct = v => Math.round(v * 100);
  const f1 = v => (Math.round(v * 10) / 10).toFixed(1);
  const eok = v => (v / 1e8).toFixed(2);
  const man = v => Math.round(v / 1e4).toLocaleString('ko-KR');
  const dirName = az => { const a = ((az % 360) + 360) % 360; return a >= 315 || a < 45 ? '북' : a < 135 ? '동' : a < 225 ? '남' : '서'; };
  const FN = { N: '북면', E: '동면', S: '남면', W: '서면' };
  const fname = (id, az) => FN[id] || `${id} (${dirName(az)})`;
  const range = arr => { const a = arr.map(pct); const lo = Math.min(...a), hi = Math.max(...a); return lo === hi ? lo + '%' : lo + '~' + hi + '%'; };
  const today = () => { const d = new Date(); return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, '0')}. ${String(d.getDate()).padStart(2, '0')}`; };

  // ---- 표 · 문단 도우미 ----
  const kv = rows => `<table class="kv"><tr><th>구 분</th><th>내 용</th></tr>${rows.map(([k, v]) => `<tr><td class="k">${k}</td><td>${v}</td></tr>`).join('')}</table>`;
  const grid = (head, rows, opt = {}) => `${opt.cap ? `<p class="tcap">${opt.cap}</p>` : ''}<table class="grid"><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map((c, i) => `<td${i === 0 ? ' class="k"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</table>`;
  const ul = items => `<ul>${items.map(t => `<li>${t}</li>`).join('')}</ul>`;
  const ref = t => `<p class="ref">${t}</p>`;

  // ---- 그림: 입면별 냉방기 창 일사 (통유리 · 고정 0° · 반응형) ----
  function solarChart(rows) {
    const W = 640, H = 230, L = 46, B = 34, T = 14, max = Math.max(...rows.map(r => r.bare), 1);
    const gw = (W - L - 10) / rows.length, bw = Math.min(26, gw / 4.2), Y = v => T + (1 - v / max) * (H - T - B);
    const col = ['#8C99A8', '#F7B928', '#0064E0'];
    let g = `<line x1="${L}" y1="${H - B}" x2="${W - 6}" y2="${H - B}" stroke="#5D6C7B"/>`;
    for (let k = 0; k <= 4; k++) { const v = max * k / 4, y = Y(v); g += `<line x1="${L}" y1="${y}" x2="${W - 6}" y2="${y}" stroke="#E3E8EE"/><text x="${L - 6}" y="${y + 4}" text-anchor="end" font-size="11" fill="#5D6C7B">${Math.round(v)}</text>`; }
    rows.forEach((r, i) => {
      const cx = L + gw * (i + 0.5);
      [r.bare, r.fixed, r.react].forEach((v, j) => { const x = cx + (j - 1.5) * bw + j * 2; g += `<rect x="${x}" y="${Y(v)}" width="${bw}" height="${H - B - Y(v)}" fill="${col[j]}"/><text x="${x + bw / 2}" y="${Y(v) - 3}" text-anchor="middle" font-size="10" fill="#444950">${Math.round(v)}</text>`; });
      g += `<text x="${cx}" y="${H - B + 16}" text-anchor="middle" font-size="12" fill="#0A1317">${esc(fname(r.id, r.az))}</text>`;
    });
    g += `<text x="12" y="${T + 4}" font-size="11" fill="#5D6C7B">kWh/㎡</text>`;
    const leg = [['통유리', col[0]], ['외부 고정 0°', col[1]], ['외부 반응형', col[2]]].map(([t, c], i) => `<rect x="${W - 300 + i * 100}" y="${H - 12}" width="10" height="10" fill="${c}"/><text x="${W - 286 + i * 100}" y="${H - 3}" font-size="11" fill="#444950">${t}</text>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto">${g}${leg}</svg>`;
  }

  // ---- 그림 3-1: 대상지 지도 (브이월드 정적 지도 + 고른 건물 외곽선) ----
  function siteMap(site, info) {
    const key = (window.VW_KEY_FOR_REPORT && window.VW_KEY_FOR_REPORT()) || '';
    const z = 17, w = 1024, h = 512, lat = site.lat_deg, lon = site.lon_deg;
    const src = `https://api.vworld.kr/req/image?service=image&request=getmap&key=${encodeURIComponent(key)}&center=${lon},${lat}&crs=epsg:4326&zoom=${z}&size=${w},${h}&format=png&basemap=GRAPHIC`;
    const px = (lo, la) => { const s = 256 * Math.pow(2, z), m = l => Math.log(Math.tan(Math.PI / 4 + l * Math.PI / 360)); return [w / 2 + (lo - lon) / 360 * s, h / 2 - (m(la) - m(lat)) / (2 * Math.PI) * s]; };
    const ring = info.ring && info.ring.length > 2 ? `<polygon points="${info.ring.map(([lo, la]) => px(lo, la).map(v => v.toFixed(1)).join(',')).join(' ')}" fill="rgba(0,100,224,.18)" stroke="#0064E0" stroke-width="3"/>` : `<circle cx="${w / 2}" cy="${h / 2}" r="9" fill="#0064E0" stroke="#fff" stroke-width="3"/>`;
    return `<div class="map"><img src="${esc(src)}" alt="대상지 지도"><svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${ring}</svg></div>`;
  }

  // ---- 보고서 만들기 ----
  function build() {
    const last = window.UI && window.UI.getLast();
    if (!last || !last.out) return null;
    const input = last.input, out = last.out, R = out.result, A = E.merge(E.DEFAULT_ASSUMPTIONS, input.assumptions || {});
    const info = window.SiteInfo || { is1784: window.simMode !== 'model', name: '네이버 1784', address: '경기도 성남시 분당구 정자일로 95', floors: 28, ring: null };
    const is1784 = !!info.is1784, name = info.name, floors = info.floors || Number($('floors') && $('floors').value) || null;
    const lv = input.facades.filter(f => f.louver), sol = id => (out.solar_used || out.solar).facades.find(x => x.id === id);
    // 겨울 모드를 끈 경우 (규칙대로 닫음) 의 난방기 일사: 같은 입력으로 한 번 더 계산
    let ruleSol = null;
    try { ruleSol = E.compute(Object.assign({}, input, { winter_mode: false }), null, { mode: last.mode === 'excel' ? 'radiance' : last.mode, shade: window.ShadeCorr || null }).solar_used; } catch (e) { console.warn(e); }
    const fac = lv.map(f => { const s = sol(f.id), r = ruleSol && ruleSol.facades.find(x => x.id === f.id), c = s.cooling_season, hh = s.heating_season;
      return { id: f.id, az: f.azimuth_deg, area: Number(f.window_area_m2) || 0, bare: c.bare_kwh_m2_yr, fixed: c.external_fixed_kwh_m2_yr, react: c.external_reactive_kwh_m2_yr,
        cFix: 1 - c.external_fixed_kwh_m2_yr / c.bare_kwh_m2_yr, cRe: 1 - c.external_reactive_kwh_m2_yr / c.bare_kwh_m2_yr,
        hFix: 1 - hh.external_fixed_kwh_m2_yr / hh.bare_kwh_m2_yr, hWin: 1 - hh.external_reactive_kwh_m2_yr / hh.bare_kwh_m2_yr,
        hRule: r ? 1 - r.heating_season.external_reactive_kwh_m2_yr / r.heating_season.bare_kwh_m2_yr : null,
        perM2: (c.bare_kwh_m2_yr - c.external_reactive_kwh_m2_yr) }; });
    const wsum = k => { const a = fac.reduce((t, f) => t + f.area, 0) || 1; return fac.reduce((t, f) => t + f[k] * f.area, 0) / a; };
    const wBare = wsum('bare'), wReact = wsum('react'), wcRe = 1 - wReact / wBare;
    const hb = fac.reduce((t, f) => t + sol(f.id).heating_season.bare_kwh_m2_yr * f.area, 0), hw = fac.reduce((t, f) => t + sol(f.id).heating_season.external_reactive_kwh_m2_yr * f.area, 0);
    const whWin = hb ? 1 - hw / hb : 0;
    const sorted = fac.slice().sort((a, b) => b.cRe - a.cRe);
    const ir = R.internal_reactive, ef = R.external_fixed, er = R.external_reactive, g = A.elec_escalation;
    const cum30 = r => E.cumulativeNet(r, g, 30)[30];
    const be = r => r.money.breakeven_year == null ? '100년 초과' : r.money.breakeven_year + '년';
    const cpt = r => r.carbon.cost_per_t_krw ? '약 ' + man(r.carbon.cost_per_t_krw) + '만 원' : '-';
    const winOn = input.winter_mode !== false;
    const period = is1784 ? '2026. 10. 06 ~ 2026. 10. 16' : today() + ' (웹 검토 도구 자동 작성)';
    const subj = `${esc(name)}${floors ? ` (지상 ${floors}층, 외피 ${input.facades.length}면)` : ` (외피 ${input.facades.length}면)`}`;
    const est = is1784 ? '' : ' (추정)';

    // ---------- 표지 ----------
    let h = `<section class="cover">
      <p class="logo">(주)BIMension</p>
      <p class="sub">${esc(name)} 외피</p>
      <h1 class="title">반응형 외부 루버 적용 검토<br>종합보고서</h1>
      <p class="draft">(초안)</p>
      <table class="kv cov"><tr><td class="k">대 상 건 물</td><td>${esc(name)}${info.address ? ` (${esc(info.address)})` : ''}</td></tr>
      <tr><td class="k">검 토 기 간</td><td>${period}</td></tr><tr><td class="k">발 주 처</td><td>○○ (교육용 사례 연구)</td></tr><tr><td class="k">수 행 업 체</td><td>(주)BIMension</td></tr></table>
      <p class="note">본 보고서는 공개 자료를 바탕으로 한 교육용 사례 연구입니다. 실제 발주나 특정 주체의 판단과는 관계없습니다.${is1784 ? '' : '<br>대상 건물의 수치는 웹 검토 도구가 1784 검증 규칙과 일사 자료를 적용해 계산한 추정값입니다.'}</p>
    </section>`;

    // ---------- 차례 ----------
    const toc = [['1. 검토 개요', []], ['2. 검토 적용기준', ['2.1 성능 평가 기준', '2.2 루버 운영 기준', '2.3 기상 및 주변 건물 데이터 기준']], ['3. 검토 수행 환경', ['3.1 검토 수행 조직', '3.2 소프트웨어 환경', '3.3 데이터 흐름', '3.4 검토 도구 화면']],
      ['4. 모델 작성 결과', ['4.1 대상 건물 및 입면 구성', '4.2 루버 사양', '4.3 주변 건물 및 지형']], ['5. 성능 분석 결과', ['5.1 입면별 창 일사량', '5.2 겨울 모드', '5.3 실내 눈부심 (9층 대표 실)', '5.4 에너지 · 탄소 (건물 전체)', '5.5 냉난방 에너지 상세 (9층 대표 실)', '5.6 층별 효과', '5.7 수직 루버와 수평 루버']],
      ['6. 품질관리(검증) 결과', ['6.1 규칙 구현 검증', '6.2 프로그램 교차 검증', '6.3 민감도 검토', '6.4 검토 이슈']], ['7. 경제성 검토 결과', []], ['8. 적용 제안 및 활용방안', []], ['9. 성과품', []], ['10. 책임과 한계', []]];
    h += `<section class="pg"><h1>차 례</h1><div class="toc">${toc.map(([t, s]) => `<p class="t1">${t}</p>${s.map(x => `<p class="t2">${x}</p>`).join('')}`).join('')}</div></section>`;

    // ---------- 1. 검토 개요 ----------
    h += `<section class="pg"><h1>1. 검토 개요</h1><p>본 검토의 개요는 다음과 같다.</p>${kv([
      ['검 토 명', `${esc(name)} 외피 반응형 외부 루버 적용 검토`],
      ['검 토 목 적', '해의 위치에 따라 날 각도가 바뀌는 외부 반응형 루버의 운영 규칙을 정의하고, 일사 · 실내 눈부심 · 냉난방 에너지 · 경제성 효과를 정량화하여 입면별 적용 여부를 판단'],
      ['대 상 건 물', subj],
      ['수 치 기 준', is1784 ? '건물 전체 값(창 일사 · 에너지 · 탄소 · 경제성): 1~28층 평균<br>실내 조도 · 직달 · EnergyPlus 상세: 9층 대표 실 (서남 모서리 방)' : '팀 Radiance 1784 1~28층 평균 일사를 입면 방위에 맞춰 적용하고, 주변 건물 그림자는 웹에서 보정 (추정값)<br>실내 조도 · EnergyPlus 상세는 1784 9층 대표 실 결과를 참고로 수록'],
      ['비 교 대 안', '① 시공 전(통유리) ② 내부 반응형(그린팩토리형)<br>③ 외부 고정 루버(날 0°) ④ 외부 반응형 루버(규칙 운영 + 겨울 모드)'],
      ['검 토 범 위', '창면 일사(냉방기 6~9월 · 난방기 11~3월), 냉난방 · 조명 전력, 탄소, 경제성, 웹 · Unity 검토 도구'],
      ['검 토 기 간', period], ['수 행 사', '(주)BIMension']])}`;
    h += is1784 ? `<p class="small"><b>수치 기준</b> — 건물 전체 값은 층별 계산 결과(3 · 5 · 9 · 15 · 20 · 25층)를 각 층이 대표하는 층 수로 가중한 1~28층 평균이다. 간단 보고서 · 발표 자료 · 웹 검토 도구와 같은 기준이며, 9층 값과는 1~3점 차이다.</p>`
      : `<p class="small"><b>수치 기준</b> — 대상 건물의 창 일사는 1784의 층 평균 일사(Radiance)를 입면 방위에 맞춰 적용하고, 브이월드 주변 건물로 가려지는 정도를 웹에서 보정한 추정값이다. 1784에서만 따로 분석한 항목(5.3 · 5.5~5.7 · 6장)은 참고로 싣는다.</p>`;
    h += `<h2>1.1 검토 결과 요약</h2>${ul([
      `냉방기 창 일사는 외부 반응형 루버로 ${sorted.map(f => `<b>${esc(fname(f.id, f.az))} ${pct(f.cRe)}%</b>`).join(' · ')} 감소한다(면적 가중 ${Math.round(wBare)} → ${Math.round(wReact)} kWh/㎡${est}). 외부 고정 루버는 ${range(fac.map(f => f.cFix))}이다.`,
      ruleSol ? `겨울에도 규칙대로 닫으면 난방기 일사를 ${range(fac.map(f => f.hRule))} 잃으나, <b>겨울 모드</b>를 켜면 손실이 <b>${range(fac.map(f => f.hWin))}</b>로 줄어 겨울 햇빛의 ${100 - pct(whWin)}%를 받는다.` : `겨울 모드를 켜면 난방기 일사 손실이 ${range(fac.map(f => f.hWin))}로 줄어 겨울 햇빛의 ${100 - pct(whWin)}%를 받는다.`,
      `창 ${Math.round(er.quantity.window_area_m2).toLocaleString('ko-KR')}㎡ 기준 연간 순 전력 절감은 <b>외부 반응형 ${f1(er.energy.net_saved_mwh_yr)} MWh(탄소 ${f1(er.carbon.saved_t_yr)} t)</b>, 내부 반응형 ${f1(ir.energy.net_saved_mwh_yr)} MWh, 외부 고정 ${f1(ef.energy.net_saved_mwh_yr)} MWh이다${est}.`,
      is1784 ? '9층 서남 모서리 방의 직달 햇빛 면적(하지 15:30)은 <b>73% → 16%</b>로 줄어 눈부심이 크게 감소한다.' : '실내 눈부심은 1784 9층 서남 모서리 방에서 직달 햇빛 면적이 73% → 16%로 줄었다(참고, 5.3절).',
      `임시 단가에서 외부 반응형은 공사비 ${eok(er.cost.total_krw)}억 원, 연 에너지 절감 ${man(er.money.energy_saved_krw_yr)}만 원, 유지관리비 ${man(er.money.maintenance_krw_yr)}만 원으로 손익분기는 ${be(er)}이다. 회수보다 <b>탄소 1톤 감축 비용(${cpt(er)})</b>으로 판단한다.`])}`;
    h += `<h2>1.2 핵심 지표</h2>${grid(['지 표', '결 과', '비 고'], [
      ['냉방기 창 일사 감소 (외부 반응형)', sorted.map(f => `${esc(fname(f.id, f.az))} ${pct(f.cRe)}%`).join(' · '), `고정 0°는 ${range(fac.map(f => f.cFix))}${est}`],
      ['난방기 일사 손실 (겨울 모드)', fac.slice().sort((a, b) => a.hWin - b.hWin).map(f => `${esc(fname(f.id, f.az))} ${pct(f.hWin)}%`).join(' · '), ruleSol ? `규칙대로 닫으면 ${range(fac.map(f => f.hRule))}` : ''],
      ['순 전력 절감 · 탄소 (연간)', `${f1(er.energy.net_saved_mwh_yr)} MWh · ${f1(er.carbon.saved_t_yr)} tCO₂`, `외부 반응형 · 내부 반응형 ${f1(ir.energy.net_saved_mwh_yr)}, 외부 고정 ${f1(ef.energy.net_saved_mwh_yr)} MWh`],
      ['실내 직달 햇빛 면적 (하지 15:30)', '73% → 16%', '1784 9층 서남 모서리 방' + (is1784 ? '' : ' (참고)')],
      ['냉난방 에너지 (9층 대표 실)', '열펌프 -17~-22%', '1784 EnergyPlus' + (is1784 ? '' : ' (참고)')],
      ['검증', '1,160건 일치 · 평균 4.7점 차이', '1784 규칙 구현 · Radiance · Ladybug 교차 비교'],
      ['보호 유리', `공사비 ${eok(er.glass_compare ? er.glass_compare.with.cost : er.cost.total_krw)}억 대 ${er.glass_compare ? eok(er.glass_compare.without.cost) : '-'}억`, '루버 효과는 같음, 내구성 선택 옵션'],
      ['경제성 (임시 단가)', `손익분기 ${be(er)}`, `공사비 ${eok(er.cost.total_krw)}억 · 연 절감 ${man(er.money.energy_saved_krw_yr)}만 · 유지 ${man(er.money.maintenance_krw_yr)}만 원`]])}</section>`;

    // ---------- 2. 검토 적용기준 (공통) ----------
    h += `<section class="pg"><h1>2. 검토 적용기준</h1><h2>2.1 성능 평가 기준</h2><p>본 검토의 성능 평가 기준은 다음과 같다.</p>${grid(['평가 항목', '평가 지표', '판단 기준'], [
      ['냉방기 창 일사', '6~9월 창면 입사 일사 합계 (kWh/㎡)', '시공 전 대비 감소율이 클수록 유리'], ['난방기 창 일사', '11~3월 창면 입사 일사 합계 (kWh/㎡)', '시공 전 대비 감소율(손실)이 작을수록 유리'],
      ['실내 눈부심', '직달 햇빛 1,000 lx 이상 면적 비율 (%)', '작을수록 유리'], ['실내 채광', '목표 조도 400 lx 이상 면적 (KS A 3011)', '창측 · 중간 구역 충족 여부'],
      ['냉난방 에너지', '냉방 · 난방 부하 및 설비 에너지 (kWh/㎡ · 년)', '시공 전 대비 감소'], ['운영 부담', '연간 닫힌 시간, 날 회전량', '작을수록 유리'], ['경제성', '공사비, 유지비, 연 절감액, 누적 순이익', '회수 기간 · 민감도']])}
      <h2>2.2 루버 운영 기준</h2>${kv([['닫힘 조건', '해 고도 5° 이상이고, 해와 입면의 방위차가 컷오프 이하이며, 주변 건물에 해가 절반 이상 가려지지 않을 때'],
      ['컷오프', '춘분 30° · 하지 60° · 추분 45° · 동지 30° (대표일 사이는 날짜별 직선 보간), 설계 판단값'], ['닫힘 각도', '직달 일사가 날 사이로 들어오지 못하는 최소 각도: a = asin(s · cosθ / w) - |θ| (w = 300, s = 350 mm)'],
      ['겨울 모드', '난방이 필요한 날 날을 해와 나란히. 해 고도 20° 미만이면서 방위차 60° 이내, 또는 방위차 75° 초과 시 0°'], ['북면', '직달 일사가 거의 없어 항상 열림'], ['기본값', `겨울 모드 ${winOn ? '켬' : '끔'}`]])}
      <h2>2.3 기상 및 주변 건물 데이터 기준</h2>${kv([['기상 데이터', 'KOR_KG_Seoul-Seongnam.AP.471110_TMYx (표준기상년), 월평균 시간별 직달 · 산란 일사'], ['대표일', '각 월 15일, 계절 합계 = 대표일 값 × 해당 월 일수'],
      ['주변 건물', is1784 ? '1784 주변 건물 325동 (실제 위치 · 높이)' : `브이월드 건물 ${window.CtxCount != null ? window.CtxCount + '동 ' : ''}(반경 약 250 m, 층수 없으면 3층 · 층고 3.3 m) · 지형 고도 반영`],
      ['층 평균', '3 · 5 · 9 · 15 · 20 · 25층 결과를 층 수 3.5 · 3 · 5 · 5.5 · 5 · 6으로 가중 (1~28층 평균), 입면 합계는 창 면적 가중'], ['날 재질', '반사율 0.5 (확산), 창 뒤 벽 반사율 0.3']])}</section>`;

    // ---------- 3. 검토 수행 환경 ----------
    const cap = window.CaptureResult, cut = k => cap && cap.out.find(o => o.key === k && !o.miss);
    const fig = (o, n, t) => o ? `<figure><img src="${o.src}" alt="${esc(t)}"><figcaption>[그림 ${n}] ${esc(t)}</figcaption></figure>` : '';
    const tool = cap && cap.useModel ? '웹 3D (추정값)' : 'Unity 시연';
    const p1 = cut('pair1'), p2 = cut('pair2');
    h += `<section class="pg"><h1>3. 검토 수행 환경</h1><h2>3.1 검토 수행 조직</h2>${grid(['역 할', '수 행 업 무'], [['총괄 · 웹 · 보고서', '일정 · 리스크 관리, 웹 검토 도구 및 웹-Unity 연동, 경제성, 보고서 및 발표 자료'], ['분석 · 개발', '운영 규칙, 태양 위치, Radiance · EnergyPlus 분석, Unity 스크립트, 검증'], ['외피 모델링', '1784 외피, 수직 · 수평 루버 모델링, 공유 모델 관리'], ['대지 · 시각화', '대지 · 주변 건물, Unity 장면, WebGL 빌드, 시연'], ['실내 구현', '대표 실 모델(마감 · 가구 · 조명), 목표 조도 · 마감 반사율 자료']])}
      <h2>3.2 소프트웨어 환경</h2>${grid(['구 분', '소프트웨어', '용 도'], [['모델링', 'Rhino, Revit', '외피 · 루버 모델, 주변 건물'], ['분석', 'Grasshopper + Ladybug Tools', '태양 위치, 운영 규칙, 일사 교차 검증'], ['일사 · 조도', 'Radiance (gendaylit, rtrace)', '3D 날 창면 일사, 실내 조도'], ['에너지', 'EnergyPlus 25.2 (Honeybee)', '냉난방 부하, 민감도'], ['시각화', 'Unity 6000.6.4f1 (WebGL)', '1784 루버 운영 시연'], ['웹', '웹 검토 도구 (GitHub Pages, 브이월드 연동)', '건물 선택, 입면 생성, 경제성, 보고서'], ['스크립트', 'Python, C#, JavaScript', '계산 자동화, Unity · 웹 연동']])}
      <h2>3.3 데이터 흐름</h2>${kv([['입 력', '위치 · 날짜 · 시각, 입면 방위 · 면적, 루버 사양, 기상 데이터, 주변 건물'], ['계 산', '태양 위치 → 운영 규칙(층 · 면별 각도) → Radiance 일사 · 조도 → EnergyPlus 에너지 → 경제성'], ['산 출', 'CSV · JSON(solar_result, 층별 각도표, 겨울 날짜표) → Unity · 웹 → 보고서']])}</section>
      <section class="pg"><h2>3.4 검토 도구 화면</h2><figure>${siteMap(input.site, info)}<figcaption>[그림 3-1] 웹 검토 도구의 대상지 지도 (${esc(name)} 일대, 브이월드)</figcaption></figure>
      ${fig(p1, '3-2', `${tool}: ${cap ? cap.face + ' 입면 (' + cap.az + '°) · ' : ''}${p1 ? p1.labels.join(' 대 ') : ''}`)}${fig(p2, '3-3', `${tool}: ${cap ? cap.face + ' 입면 · ' : ''}${p2 ? p2.labels.join(' 대 ') : ''}`)}
      ${p1 || p2 ? '' : ref('시연 화면 캡처가 없습니다 (화면이 다 뜬 뒤 다시 상세 인쇄하면 들어갑니다).')}</section>`;

    // ---------- 4. 모델 작성 결과 ----------
    const feat = f => { const d = dirName(f.azimuth_deg); return d === '북' ? '직달 일사 거의 없음' : d === '동' ? '아침 해, 오전에 닫힘' : d === '남' ? '정오 전후 고도 높은 해' : '오후 낮은 해, 가장 오래 닫힘'; };
    h += `<section class="pg"><h1>4. 모델 작성 결과</h1><h2>4.1 대상 건물 및 입면 구성</h2>${grid(['입면', '방위', '창 면적 (㎡)', '주요 특성', '루버'], input.facades.map(f => [esc(fname(f.id, f.azimuth_deg)), Math.round(f.azimuth_deg) + '°', Math.round(Number(f.window_area_m2) || 0).toLocaleString('ko-KR'), feat(f), f.louver ? '설치' : (dirName(f.azimuth_deg) === '북' ? '설치 안 함 (항상 열림)' : '설치 안 함')]))}
      <p>${is1784 ? '1~5층은 동 · 북면이 저층부(포디움)에 접하며, 6층부터 4면이 모두 외기에 노출된다. 건물 전체 값은 1~28층 평균으로, 실내 상세는 9층 서남 모서리 방(15.75 × 13.8 m, 통창, 층고 4.2 m)으로 계산하였다.' : `입면은 브이월드 건물 외곽선의 변마다 만들었고(북쪽부터 시계방향), 창 면적은 변 길이 × 층수 × 층고 × 창면적비로 계산하였다.`}</p>
      <h2>4.2 루버 사양</h2>${grid(['항목', '수직 루버'], [['날 폭 / 간격', '300 mm / 350 mm'], ['회전축', '수직(Y)축, 0° = 날이 유리에 수직(열림)'], ['운영 규칙', '방위차 기준 컷오프(2.2)'], ['재질(제안)', '무광 알루미늄, 반사율 0.5 가정']])}
      <h2>4.3 주변 건물 및 지형</h2><p>${is1784 ? '1784 주변 건물 325동을 실제 위치와 높이로 반영하였다. 층별로 해 방향 광선 검사를 수행하여, 해가 절반 이상 가려지는 시각에는 날을 열도록 하였다.' : `브이월드 주변 건물${window.CtxCount != null ? ' ' + window.CtxCount + '동' : ''}과 지형 고도로 입면별 해 가림을 계산하여, 1784 대비 가려지는 정도만큼 일사를 보정하였다.`}</p></section>`;

    // ---------- 5. 성능 분석 결과 ----------
    const rows51 = fac.map(f => [esc(fname(f.id, f.az)), pct(f.cFix) + '%', pct(f.cRe) + '%', pct(f.hFix) + '%', f.hRule != null ? pct(f.hRule) + '%' : '-', pct(f.hWin) + '%']);
    const wa = k => wsum(k);
    rows51.push(['루버 면 합계', pct(1 - wa('fixed') / wBare) + '%', pct(wcRe) + '%', '-', '-', pct(whWin) + '%']);
    h += `<section class="pg"><h1>5. 성능 분석 결과</h1><h2>5.1 입면별 창 일사량</h2><p>입면별 창 일사 감소율(시공 전 대비)은 다음과 같다${est}.</p>${grid(['입면', '냉방기 고정 0°', '냉방기 반응형', '난방기 고정 0°', '난방기 규칙대로', '난방기 겨울 모드'], rows51)}
      <figure>${solarChart(fac)}<figcaption>[그림 5-1] 입면별 냉방기 창 일사 (kWh/㎡, ${is1784 ? '1~28층 평균' : '추정'})</figcaption></figure>
      <p>북면은 직달 일사가 거의 없어 루버를 운영하지 않는다.</p>
      <h2>5.2 겨울 모드</h2><p>겨울에도 규칙대로 날을 닫으면 난방에 필요한 햇빛까지 막는다${ruleSol ? `(최대 ${Math.max(...fac.map(f => pct(f.hRule)))}%)` : ''}. 겨울 모드는 난방이 필요한 날에 날을 해와 나란히 두어 손실을 ${range(fac.map(f => f.hWin))}(면적 가중 ${pct(whWin)}%)로 줄이며, 낮은 해가 정면으로 드는 눈부심 시각만 날을 0°로 둔다. 웹과 Unity 모두 기본값은 켬이다.</p></section>`;
    h += `<section class="pg"><h2>5.3 실내 눈부심 (9층 대표 실)</h2>${is1784 ? '' : ref('1784 9층 서남 모서리 방 결과 (참고)')}${grid(['구 분', '시공 전', '고정 0°', '반응형'], [['직달 1,000 lx 이상 면적 (하지 15:30)', '73%', '53%', '16%'], ['직달 1,000 lx 이상 면적 (동지 12:30)', '100%', '93%', '15%'], ['평균 조도 (하지 15:30)', '7,568 lx', '6,080 lx', '2,787 lx']])}
      <h2>5.4 에너지 · 탄소 (건물 전체)</h2><p>창 일사를 냉방 · 조명 · 난방 전력으로 환산한 대안별 연간 효과는 다음과 같다(통유리 대비, 루버 설치면 창 ${Math.round(er.quantity.window_area_m2).toLocaleString('ko-KR')}㎡${est}).</p>
      ${grid(['항 목', '내부 반응형', '외부 고정 0°', '외부 반응형'], [
        ['냉방 전력 절감 (MWh)', f1(ir.energy.cooling_saved_mwh_yr), f1(ef.energy.cooling_saved_mwh_yr), f1(er.energy.cooling_saved_mwh_yr)],
        ['조명 전력 증가 (MWh)', f1(ir.energy.lighting_added_mwh_yr), f1(ef.energy.lighting_added_mwh_yr), f1(er.energy.lighting_added_mwh_yr)],
        ['난방 전력 증가 (MWh)', f1(ir.energy.heating_added_mwh_yr), f1(ef.energy.heating_added_mwh_yr), f1(er.energy.heating_added_mwh_yr)],
        ['<b>순 전력 절감 (MWh)</b>', '<b>' + f1(ir.energy.net_saved_mwh_yr) + '</b>', '<b>' + f1(ef.energy.net_saved_mwh_yr) + '</b>', '<b>' + f1(er.energy.net_saved_mwh_yr) + '</b>'],
        ['탄소 감축 (tCO₂)', f1(ir.carbon.saved_t_yr), f1(ef.carbon.saved_t_yr), f1(er.carbon.saved_t_yr)]], { cap: '[표 5-1] 대안별 연간 전력 · 탄소' })}
      ${ul([`냉방은 창 일사 1 kWh당 냉방 부하 ${A.cooling_load_per_kwh} kWh ÷ COP ${A.cop_cooling}, 난방은 ${A.heating_load_per_kwh} kWh ÷ 히트펌프 COP ${A.cop_heating}, 배출계수 ${A.emission_t_mwh} tCO₂/MWh(고시값 확인 필요)를 적용하였다.`,
        '내부 반응형은 Radiance 계산이 없어, 외부 반응형과 같은 시간에 닫히고 막은 햇빛의 55%가 실내에 남는다고 가정하였다.',
        '외부 고정은 냉방을 줄이지만 겨울 햇빛을 막고 조명이 늘어 순 절감이 작거나 마이너스가 된다.'])}</section>`;
    h += `<section class="pg"><h2>5.5 냉난방 에너지 상세 (9층 대표 실)</h2>${is1784 ? '' : ref('1784 9층 대표 실 결과 (참고)')}<p>에너지는 민감도 기반 추정과 EnergyPlus 직접 계산(블라인드 모델, Radiance 보정 전 · 후) 세 방법으로 검토하였다.</p>${grid(['시공 전 대비', '추정', 'EnergyPlus', 'EnergyPlus(보정)'], [['겨울 모드 켬 · 가스 보일러', '+1%', '+2%', '+7%'], ['겨울 모드 켬 · 열펌프', '-22%', '-17%', '-18%'], ['겨울 모드 끔 · 가스 보일러', '+60%', '+30%', '+42%']])}
      <h2>5.6 층별 효과</h2>${is1784 ? '' : ref('1784 결과 (참고)')}<p>서면과 남면은 층에 관계없이 효과가 일정하나, 동면은 동쪽 고층 건물로 인해 저층의 효과가 작다(냉방기 절감 3층 109 → 25층 223 kWh/㎡).</p>
      ${grid(['층', '동 냉방 감소', '남 냉방 감소', '서 냉방 감소', '남 난방 손실(겨울 모드)'], [['3', '63%', '69%', '69%', '14%'], ['9', '66%', '65%', '69%', '17%'], ['15', '71%', '65%', '69%', '19%'], ['25', '72%', '65%', '69%', '19%']], { cap: '[표 5-2] 층별 창 일사 감소 (1784)' })}
      <h2>5.7 수직 루버와 수평 루버</h2>${is1784 ? '' : ref('1784 9층 결과 (참고)')}${grid(['입면', '냉방 수직 반응형', '냉방 수평 고정', '냉방 수평 반응형', '난방 수직 겨울 모드', '난방 수평 겨울 모드'], [['남면', '65%', '64%', '65%', '17%', '10%'], ['동면', '66%', '65%', '67%', '32%', '24%'], ['서면', '70%', '49%', '63%', '34%', '25%']], { cap: '[표 5-3] 수직 루버와 수평 루버의 창 일사 감소율' })}</section>`;

    // ---------- 6. 품질관리 (1784) ----------
    h += `<section class="pg"><h1>6. 품질관리(검증) 결과</h1>${is1784 ? '' : ref('검증은 1784 기준이며, 같은 규칙 · 엔진이 대상 건물에 적용된다.')}
      <h2>6.1 규칙 구현 검증</h2><p>운영 규칙의 정답표와 구현 결과(Grasshopper · Unity)를 대조하여, 1784 대표일 290개 시각 × 4면 = 1,160건에서 열림/닫힘과 각도가 모두 일치함을 확인하였다.</p>
      <h2>6.2 프로그램 교차 검증</h2>${grid(['검증 항목', '방 법', '결 과'], [['규칙 구현', '정답표와 Grasshopper · Unity 구현 결과 대조', '1,160건 모두 일치'], ['일사 계산', 'Radiance와 Ladybug로 같은 조건 계산 (대표일 4 × 방향 4)', '평균 차이 4.7점, 최대 12점'], ['창면 일사', 'Radiance와 EnergyPlus 창 앞 일사 비교', '4~6% 이내 일치'], ['태양 위치', 'NOAA 공식 · Ladybug 비교', 'NOAA ±0.6° 이내'], ['웹 계산 엔진', '경제성 자료(엑셀)와 같은 입력으로 비교', '0.05% 이내 일치']])}
      <h2>6.3 민감도 검토</h2>${grid(['검토 항목', '변화 범위', '결과'], [['날씨', '맑은 날 · 흐린 날 · 실제 날씨 섞임', '냉방기 감소율 60~71%'], ['컷오프', '0 ~ 90°', '냉방 효과는 45° 부근에서 포화'], ['날 간격', '350 / 450 / 550 mm', '하지 반응형 감소율 63 / 52 / 43%'], ['날 반사율', '0.2 ~ 0.8', '감소율 5~16점 변화, 결론 유지'], ['보호 유리', '유무 (투과율 0.88)', '루버 효과 동일, 유리 추가 차단은 냉방 절감의 5~10%']])}
      <h2>6.4 검토 이슈</h2>${grid(['구분', '조치 결과'], [['직달 일사 식의 효과 과소평가', '산란광까지 계산하는 Radiance 3D 날 모델로 교체, Ladybug와 교차 검증'], ['겨울 난방 손실', '겨울 모드(해와 나란히 + 눈부심 시각 0°) 도입, 기본값 켬'], ['Unity 장면 방위 180° 회전', '모델 · 지형 · 루버를 한 부모 아래 Y 180° 회전하도록 수정 요청'], ['웹 계산 엔진 규칙 버전 차이', '웹 엔진을 팀 v9 규칙(11~3월, 혼합 겨울 모드, 날짜 보간)과 일치']])}</section>`;

    // ---------- 7. 경제성 ----------
    const it = r => r.cost.items_krw, c7 = k => [ir, ef, er].map(r => it(r)[k] ? eok(it(r)[k]) : '-');
    const gc = er.glass_compare;
    h += `<section class="pg"><h1>7. 경제성 검토 결과</h1><p>경제성 자료(임시 단가, 루버 설치면 창 ${Math.round(er.quantity.window_area_m2).toLocaleString('ko-KR')}㎡, 분석 기간 ${A.life_yr}년, 전기요금 연 ${f1(g * 100)}% 인상)로 검토하였다. 에너지 절감에는 겨울 난방 증가분을 포함하였다.</p>
      <h2>7.1 공사비</h2>${grid(['항 목 (억 원)', '내부 반응형', '외부 고정', '외부 반응형'], [['루버 자재', ...c7('louver')], ['지지 프레임 · 부속', ...c7('frame')], ['구동장치 · 센서 · 제어', ...c7('drive')], ['제어 소프트웨어(앱)', ...c7('software')], ['보호 유리', ...c7('protective_glass')], ['설치 공사', ...c7('install')], ['가설 · 장비', ...c7('scaffold')],
        ['설계 · 감리 · 예비비', ...[ir, ef, er].map(r => eok((it(r).design_fee || 0) + (it(r).contingency || 0)))], ['<b>총 공사비</b>', ...[ir, ef, er].map(r => '<b>' + eok(r.cost.total_krw) + '</b>')]])}
      <h2>7.2 운영 및 회수</h2>${grid(['항 목', '내부 반응형', '외부 고정', '외부 반응형'], [['연간 에너지 절감', ...[ir, ef, er].map(r => man(r.money.energy_saved_krw_yr) + '만 원')], ['추가 유지관리비 (연)', ...[ir, ef, er].map(r => man(r.money.maintenance_krw_yr) + '만 원')],
        ['연간 순절감', ...[ir, ef, er].map(r => man(r.money.energy_saved_krw_yr - r.money.maintenance_krw_yr) + '만 원')], ['손익분기 (전기요금 인상 반영)', ...[ir, ef, er].map(be)], [`${A.life_yr}년 누적 순이익`, ...[ir, ef, er].map(r => (cum30(r) / 1e8).toFixed(1) + '억 원')], ['탄소 1톤 감축 비용', ...[ir, ef, er].map(cpt)]])}
      ${ul(['유지관리비(루버 시스템, 보호 유리, 구동장치 교체 · 앱 운영 포함)가 연 에너지 절감보다 크면 에너지 절감만으로는 회수되지 않는다.',
        gc ? `보호 유리를 빼면 외부 반응형 공사비는 ${eok(gc.without.cost)}억 원(포함 ${eok(gc.with.cost)}억 원)이며, 구동장치 교체 주기는 ${gc.without.drive_life_yr}년으로 짧아진다.` : '보호 유리는 루버의 일사 차단 효과를 바꾸지 않으므로, 내구성 요구가 클 때의 선택 옵션으로 본다.',
        '회수 기간보다 탄소 감축 비용과 비에너지 가치(눈부심 · 쾌적성 · 외관)로 판단한다.', '단가 · 창 면적 · 유지비율은 임시값으로, 실제 견적과 모델 물량에 따라 결과가 달라진다.'])}</section>`;

    // ---------- 8. 적용 제안 ----------
    const rank = fac.slice().sort((a, b) => b.perM2 - a.perM2);
    const prop = rank.map((f, i) => [esc(fname(f.id, f.az)), (i + 1) + '순위', `냉방 감소 ${pct(f.cRe)}%, ㎡당 ${Math.round(f.perM2)} kWh 절감, 겨울 모드 손실 ${pct(f.hWin)}%`]);
    input.facades.filter(f => !f.louver).forEach(f => prop.push([esc(fname(f.id, f.azimuth_deg)), '설치 안 함', dirName(f.azimuth_deg) === '북' ? '직달 일사 거의 없음' : '사용자가 루버 없음으로 지정']));
    h += `<section class="pg"><h1>8. 적용 제안 및 활용방안</h1><h2>8.1 적용 제안</h2>${grid(['입면', '권장', '근 거'], prop)}
      ${ul(['운영: 겨울 모드 켬을 기본으로 한다.', '재질: 무광 알루미늄 날을 권장하며, 보호 유리는 강풍 · 해안 등 내구성 요구가 클 때 선택 옵션으로 한다.', `판단: 회수 기간은 참고 지표로 보고, 탄소 감축 비용(외부 반응형 1톤당 ${cpt(er)}), 눈부심 저감, 쾌적성을 함께 판단한다.`])}
      <h2>8.2 활용방안</h2>${ul(['웹 검토 도구에서 다른 건물을 선택하면 같은 규칙으로 입면별 효과와 경제성을 산출한다(주변 건물 그림자 보정 포함, 추정값).', 'Unity로 날짜 · 시각별 루버 운영을 시각화하여 발주처 설명에 활용한다.', '후속 과제: 실제 견적 기반 경제성, 1784 실제 운영 자료와의 대조, 반사광 정량 검토, 다른 루버 형태.'])}</section>`;

    // ---------- 9 · 10 ----------
    h += `<section class="pg"><h1>9. 성과품</h1><p>본 검토의 성과품 목록은 다음과 같다.</p>${grid(['폴더명', '하위 폴더 / 파일', '내 용'], [['01 Unity', 'Unity_Package_v9.zip', '운영 규칙 · 태양 위치 · 루버 구동 스크립트, StreamingAssets(CSV 4종), 설치 가이드'], ['02 데이터', 'solar_result, Floor_Solar_Result.json, 층별 각도표, 겨울 날짜표, 규칙 정답표', '웹용 일사 결과 · 규칙 자료'], ['03 분석', 'Weather_Variability, Cutoff_Sweep, Floor_Effect, EnergyPlus 결과', '민감도 · 층별 · 에너지 분석 원자료(CSV)'], ['04 그림', '1784_Comparison_Final 외', '보고서 · 발표용 그림(PNG)'], ['05 Grasshopper', 'Horizontal_Louver_Rule.gh, Daylight_Analysis_Template.gh', '규칙 · 조도 분석 정의'], ['06 문서', '개발계획서, 예상 질문과 답, 종합보고서, 간단 보고서, 경제성 자료', 'Word · PDF · Excel'], ['07 웹', '웹 검토 도구 (GitHub Pages)', '건물 선택, 입면 생성, 경제성, 인쇄']])}
      <h1 class="mt">10. 책임과 한계</h1><h2>10.1 결과의 성격</h2>${ul(['본 보고서의 수치는 시뮬레이션 결과이며 실측값이 아니다.', '일사 · 조도는 월평균 기상 데이터의 대표일로 계산하였고, 날씨 다양성 검토로 결론이 유지됨을 확인하였다.'])}
      <h2>10.2 검토 범위의 한계</h2>${ul([...(is1784 ? ['1784의 실제 운영 시각은 공개되어 있지 않아 대조하지 못하였으며, 공개된 운영 원리를 재현하였다.'] : [`${esc(name)}의 결과는 1784에서 검증한 규칙과 일사 자료를 적용한 추정값이며, 1784의 검증값과 구분하여 사용한다.`, '실제 창 배치 대신 창면적비로 창 면적을 가정하였다.']),
        '에너지는 민감도 추정과 EnergyPlus 블라인드 모델로 검토하였으며, 3D 날 연간 계산과 보호 유리 사이 공기 순환은 반영하지 않았다.', '경제성은 경제성 자료(엑셀)의 임시 단가 · 창 면적 기준이며, 실제 견적과 모델 물량으로 재검토가 필요하다.', '내부 반응형은 Radiance로 계산하지 않고 열 잔류율(55%)을 가정하였다.'])}
      <h2>10.3 데이터 사용</h2>${ul(['본 검토는 공개 자료를 바탕으로 한 교육용 사례 연구이며, 성과품은 교육 목적으로 사용한다.'])}
      <p class="foot">작성: 반응형외피 검토 도구 (웹) · ${today()}</p></section>`;
    return h;
  }

  // ---- 보고서 모양 (인쇄 전용) ----
  const css = `
#detailReport{display:none}
@media print{
  body.print-detail>*:not(#detailReport){display:none!important}
  body.print-detail #detailReport{display:block;page:detail;font-family:'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#1C2B39;font-size:10.5pt;line-height:1.55}
  @page detail{size:A4;margin:20mm 18mm 18mm;@bottom-center{content:"- " counter(page) " -";font-size:9pt;color:#5D6C7B}}
  #detailReport section{break-after:page}
  #detailReport section:last-child{break-after:auto}
  #detailReport h1{font-size:17pt;font-weight:700;margin:0 0 10pt;padding-bottom:5pt;border-bottom:1.5pt solid #1C2B39;break-after:avoid}
  #detailReport h1.mt{margin-top:22pt}
  #detailReport h2{font-size:12.5pt;color:#0064E0;font-weight:700;margin:16pt 0 6pt;break-after:avoid}
  #detailReport p{margin:4pt 0}
  #detailReport .small{font-size:9.5pt;color:#444950}
  #detailReport .ref{font-size:9pt;color:#0064E0;background:#EAF2FD;border-left:3pt solid #0064E0;padding:3pt 8pt;margin:4pt 0 6pt}
  #detailReport table{width:100%;border-collapse:collapse;margin:6pt 0 8pt;font-size:9.5pt;break-inside:avoid;table-layout:auto}
  #detailReport th{background:#0064E0;color:#fff;font-weight:600;padding:4pt 6pt;border:0.5pt solid #0064E0;text-align:center}
  #detailReport td{border:0.5pt solid #C9D3DD;padding:4pt 6pt;vertical-align:middle;text-align:center}
  #detailReport table.kv td:not(.k){text-align:left}
  #detailReport td.k{background:#F1F4F7;font-weight:600;white-space:nowrap}
  #detailReport .tcap{font-size:9.5pt;font-weight:600;margin:8pt 0 2pt}
  #detailReport ul{margin:4pt 0 6pt 14pt;padding:0}
  #detailReport li{margin:2pt 0}
  #detailReport figure{margin:8pt 0;text-align:center;break-inside:avoid}
  #detailReport figure img{max-width:100%;max-height:72mm;display:block;margin:0 auto}
  #detailReport figcaption{font-size:9pt;color:#444950;margin-top:3pt}
  #detailReport .map{position:relative;width:100%;max-width:150mm;margin:0 auto}
  #detailReport .map img{width:100%;max-height:none}
  #detailReport .map svg{position:absolute;inset:0;width:100%;height:100%}
  #detailReport .cover{text-align:center;padding-top:28mm}
  #detailReport .cover .logo{color:#0064E0;font-weight:700;font-size:13pt}
  #detailReport .cover .sub{margin-top:30mm;font-size:13pt;color:#444950}
  #detailReport .cover .title{border:0;font-size:24pt;line-height:1.5;margin:6pt 0 0}
  #detailReport .cover .draft{color:#C4314B;margin:22mm 0 10mm;font-weight:600}
  #detailReport .cover table{width:85%;margin:0 auto}
  #detailReport .cover .note{margin-top:14mm;font-size:9pt;color:#444950}
  #detailReport .toc .t1{font-weight:700;margin:7pt 0 2pt}
  #detailReport .toc .t2{margin:1pt 0 1pt 14pt;color:#444950}
  #detailReport .foot{margin-top:18pt;font-size:8.5pt;color:#8595A4;text-align:right}
}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const box = document.createElement('div'); box.id = 'detailReport'; document.body.appendChild(box);

  // ---- 상세 인쇄 버튼 ----
  const note = html => { const m = $('hdrMsg'); if (m) { m.innerHTML = html; m.hidden = false; } };
  let busy = false;
  $('detailBtn').onclick = async () => {
    if (busy) return; busy = true; $('detailBtn').disabled = true;
    try {
      if (window.runCapture) { note('상세 보고서용 화면을 찍는 중입니다 (Unity 는 10~20초)…'); try { await window.runCapture(); } catch (e) { console.warn(e); } }
      const html = build();
      if (!html) { note('먼저 계산 결과가 있어야 합니다.'); return; }
      box.innerHTML = html;
      // 지도 · 캡처 이미지가 다 뜬 뒤 인쇄
      await Promise.all([...box.querySelectorAll('img')].map(i => i.complete ? 0 : new Promise(ok => { i.onload = i.onerror = ok; setTimeout(ok, 6000); })));
      note('상세 보고서 인쇄 창을 엽니다. 대상에서 "PDF로 저장"을 고르면 PDF가 됩니다.');
      document.body.classList.add('print-detail');
      try { window.print(); } catch (e) {}
    } finally {
      busy = false; $('detailBtn').disabled = false;
    }
  };
  window.addEventListener('afterprint', () => document.body.classList.remove('print-detail'));
  window.buildDetailReport = () => { const h = build(); if (h) box.innerHTML = h; return !!h; };   // 시험용
})();
