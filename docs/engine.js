/*
 * 반응형외피 계산 엔진 v0.1
 * - 입력: site_input (데이터 형식 문서 ①), solar_result (②, 없으면 간이식으로 직접 계산)
 * - 출력: result (문서 '출력' 표)
 * 식은 엑셀 은미_2일차_경제성자료.xlsx 의 7·8·9·10·13번 시트와 같다.
 * 브라우저: window.LouverEngine / Node: require('./engine.js')
 */
(function (root) {
  'use strict';
  const RAD = Math.PI / 180;
  const ALTS = ['internal_reactive', 'external_fixed', 'external_reactive'];
  const ALT_NAMES = { internal_reactive: '내부 반응형', external_fixed: '외부 고정', external_reactive: '외부 반응형' };

  // 엑셀 1_입력값 · 2_단가조사 · 13_탄소 기본값
  const DEFAULT_ASSUMPTIONS = {
    unit_price: {
      louver_ext_krw_m2: 250000,      // 알루미늄 외부 루버 자재
      frame_krw_m2: 70000,            // 지지 프레임·부속
      drive_unit_krw: 600000,         // 구동 유닛
      control_system_krw: 30000000,   // 센서·제어 시스템 (1식)
      install_ext_krw_m2: 130000,     // 외부 루버 설치
      gondola_krw_day: 700000,        // 곤돌라
      lift_krw_day: 600000,           // 고소작업차
      louver_int_krw_m2: 350000,      // 내부 반응형 루버 자재
      install_int_krw_m2: 100000,     // 내부 루버 설치
      software_krw: 40000000,         // 제어 소프트웨어 개발 (1회)
      software_run_krw_yr: 4000000,   // 소프트웨어 연 운영
      protective_glass_krw_m2: 500000 // 외부 루버 보호 유리
    },
    scaffold_days_ext: 60,
    scaffold_days_int: 5,
    design_fee_rate: 0.08,
    contingency_rate: 0.05,
    cost_multiplier: 1,
    protective_glass: { external_reactive: true, external_fixed: false },
    maintenance_rate: { internal_reactive: 0.05, external_fixed: 0.02, external_reactive: 0.05 },
    maintenance_multiplier: 1,
    elec_price_krw_kwh: 150,
    elec_price_multiplier: 1,
    elec_escalation: 0.04,
    life_yr: 30,
    cop_cooling: 3,
    cop_heating: 3,
    shgc: 0.6,
    emission_t_mwh: 0.46,
    // 조명 사용량 (kWh/년, 루버 단 창 1,000㎡ 기준 → 창 면적에 비례)
    lighting_kwh_per_1000m2: { bare: 38000, internal_reactive: 42000, external_fixed: 52000, external_reactive: 43000 },
    // 간이 일사 계산
    clear_fraction: 0.6,             // 맑은 날 비율
    winter_mode_transmission: 0.88,  // 겨울 모드에서 날을 햇빛과 나란히 둘 때 (팀 Radiance 결과 약 88%)
    internal_shading_coef: 0.55,     // 내부 루버가 닫혔을 때 실내에 남는 열 비율
    cooling_months: [6, 7, 8, 9],
    heating_months: [12, 1, 2],
    // 엑셀 검증 모드 전용 (8_시공전후 · 13_탄소)
    // 엑셀 검증 모드: 엑셀 1·8·13·14번 시트와 같은 값 (팀 Radiance, 9층, 동·남·서 면적 가중)
    excel_mode: {
      cooling_irradiance_kwh_m2: { bare: 257.550, internal_reactive: 257.550 * 0.55, external_fixed: 151.802, external_reactive: 85.001 }, // 냉방기 6~9월 (solar_result 동·남·서 가중)
      winter_kwh_m2_day: 2.56501,     // 난방기 통유리 합계 ÷ 90일 (solar_result 동·남·서 가중)
      winter_days: 90,
      weather_factor: 1,              // Radiance 는 실제 날씨 반영
      winter_transmission: { bare: 1, internal_reactive: 1, external_fixed: 0.52234, external_reactive_rule: 0.27813, external_reactive_winter: 0.87716 }
    }
  };
  // 팀 Radiance solar_result (1784 타워 9층 면 중앙 1㎡, 주변 건물 325개 그림자, 서울(성남) TMY 월평균, 월별 15일 × 일수 적분,
  // 날 폭 300 / 간격 350, 날짜별 컷오프 + 그늘이면 열림). 겨울 모드 켬 / 끔 두 가지. internal_reactive 는 팀 값이 없어 아래에서 통유리 × 0.55 로 둔다
  const RADIANCE_9F = {
    winter_on: { E: { az: 90, cooling_season: {"bare_kwh_m2_yr":192.5,"internal_reactive_kwh_m2_yr":192.5,"external_fixed_kwh_m2_yr":109.3,"external_reactive_kwh_m2_yr":65.1}, heating_season: {"bare_kwh_m2_yr":161.9,"internal_reactive_kwh_m2_yr":161.9,"external_fixed_kwh_m2_yr":60.1,"external_reactive_kwh_m2_yr":136}, closed_hours_yr: 586, blade_rotation_deg_yr: 65933 },
      S: { az: 180, cooling_season: {"bare_kwh_m2_yr":276.7,"internal_reactive_kwh_m2_yr":276.7,"external_fixed_kwh_m2_yr":143.4,"external_reactive_kwh_m2_yr":96.7}, heating_season: {"bare_kwh_m2_yr":368.8,"internal_reactive_kwh_m2_yr":368.8,"external_fixed_kwh_m2_yr":229.3,"external_reactive_kwh_m2_yr":340.6}, closed_hours_yr: 926, blade_rotation_deg_yr: 61241 },
      W: { az: 270, cooling_season: {"bare_kwh_m2_yr":300.5,"internal_reactive_kwh_m2_yr":300.5,"external_fixed_kwh_m2_yr":204,"external_reactive_kwh_m2_yr":91.4}, heating_season: {"bare_kwh_m2_yr":140.6,"internal_reactive_kwh_m2_yr":140.6,"external_fixed_kwh_m2_yr":55.6,"external_reactive_kwh_m2_yr":109.6}, closed_hours_yr: 1106, blade_rotation_deg_yr: 59946 },
      N: { az: 0, cooling_season: {"bare_kwh_m2_yr":103.1,"internal_reactive_kwh_m2_yr":103.1,"external_fixed_kwh_m2_yr":49.2,"external_reactive_kwh_m2_yr":49.2}, heating_season: {"bare_kwh_m2_yr":80.6,"internal_reactive_kwh_m2_yr":80.6,"external_fixed_kwh_m2_yr":49,"external_reactive_kwh_m2_yr":48.9}, closed_hours_yr: 0, blade_rotation_deg_yr: 0 } },
    winter_off: { E: { az: 90, cooling_season: {"bare_kwh_m2_yr":192.5,"internal_reactive_kwh_m2_yr":192.5,"external_fixed_kwh_m2_yr":109.3,"external_reactive_kwh_m2_yr":65.1}, heating_season: {"bare_kwh_m2_yr":161.9,"internal_reactive_kwh_m2_yr":161.9,"external_fixed_kwh_m2_yr":60.1,"external_reactive_kwh_m2_yr":52.8}, closed_hours_yr: 614, blade_rotation_deg_yr: 56015 },
      S: { az: 180, cooling_season: {"bare_kwh_m2_yr":276.7,"internal_reactive_kwh_m2_yr":276.7,"external_fixed_kwh_m2_yr":143.4,"external_reactive_kwh_m2_yr":96.7}, heating_season: {"bare_kwh_m2_yr":368.8,"internal_reactive_kwh_m2_yr":368.8,"external_fixed_kwh_m2_yr":229.3,"external_reactive_kwh_m2_yr":82.5}, closed_hours_yr: 1268, blade_rotation_deg_yr: 65700 },
      W: { az: 270, cooling_season: {"bare_kwh_m2_yr":300.5,"internal_reactive_kwh_m2_yr":300.5,"external_fixed_kwh_m2_yr":204,"external_reactive_kwh_m2_yr":91.4}, heating_season: {"bare_kwh_m2_yr":140.6,"internal_reactive_kwh_m2_yr":140.6,"external_fixed_kwh_m2_yr":55.6,"external_reactive_kwh_m2_yr":54.5}, closed_hours_yr: 1134, blade_rotation_deg_yr: 50194 },
      N: { az: 0, cooling_season: {"bare_kwh_m2_yr":103.1,"internal_reactive_kwh_m2_yr":103.1,"external_fixed_kwh_m2_yr":49.2,"external_reactive_kwh_m2_yr":49.2}, heating_season: {"bare_kwh_m2_yr":80.6,"internal_reactive_kwh_m2_yr":80.6,"external_fixed_kwh_m2_yr":49,"external_reactive_kwh_m2_yr":49}, closed_hours_yr: 0, blade_rotation_deg_yr: 0 } }
  };
  // 입면마다 방위가 가장 가까운 Radiance 값을 쓴다 (같은 지역 · 비슷한 높이일 때의 근사). 겨울 모드 체크에 따라 켬 / 끔 결과를 고른다
  function radianceSolar(input) {
    const A = merge(DEFAULT_ASSUMPTIONS, input.assumptions);
    const set = RADIANCE_9F[input.winter_mode !== false ? 'winter_on' : 'winter_off'];
    const dist = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
    const near = az => Object.values(set).reduce((b, v) => dist(v.az, az) < dist(b.az, az) ? v : b);
    return {
      meta: { weather_source: 'KOR_KG_Seoul-Seongnam TMYx (month-average hourly)', shading_included: true, timestep_min: 60, version: 'radiance-9F-0.1' },
      facades: input.facades.map(f => { const v = near(f.azimuth_deg); return {
        id: f.id,
        cooling_season: Object.assign({}, v.cooling_season, { internal_reactive_kwh_m2_yr: v.cooling_season.bare_kwh_m2_yr * A.internal_shading_coef }),
        heating_season: Object.assign({}, v.heating_season, { internal_reactive_kwh_m2_yr: v.heating_season.bare_kwh_m2_yr }),
        closed_hours_yr: v.closed_hours_yr, blade_rotation_deg_yr: v.blade_rotation_deg_yr
      }; })
    };
  }
  const DEFAULT_SPEC = { blade_depth_mm: 300, blade_spacing_mm: 350, louver_to_window_ratio: 0.9, area_per_unit_m2: 6, cutoff_deg: [30, 60, 45, 30], min_sun_alt_deg: 5 };

  function merge(base, over) {
    if (over === undefined || over === null) return JSON.parse(JSON.stringify(base));
    if (typeof base !== 'object' || base === null || Array.isArray(base)) return over;
    const out = {};
    for (const k of Object.keys(base)) out[k] = merge(base[k], over[k]);
    for (const k of Object.keys(over)) if (!(k in base)) out[k] = over[k];
    return out;
  }

  // ---- 태양 위치 (NOAA 간이식, 한국 시간 UTC+9) ----
  function sunPosition(latDeg, lonDeg, y, m, d, hh, mm, tz) {
    tz = tz === undefined ? 9 : tz;
    const doy = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 864e5);
    const g = 2 * Math.PI / 365 * (doy - 1 + (hh - 12) / 24);
    const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    const tst = hh * 60 + mm + eqt + 4 * lonDeg - 60 * tz;
    const ha = (tst / 4 - 180) * RAD, lat = latDeg * RAD;
    const cz = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
    const zen = Math.acos(Math.max(-1, Math.min(1, cz)));
    const alt = 90 - zen / RAD;
    let az = Math.acos(Math.max(-1, Math.min(1, (Math.sin(lat) * cz - Math.sin(decl)) / (Math.cos(lat) * Math.sin(zen))))) / RAD;
    az = ha > 0 ? (az + 180) % 360 : (540 - az) % 360;
    return { alt, az };
  }

  // 기운 각도 = 태양 방위와 입면 정면 방위의 차 (0~180)
  const tiltOf = (sunAz, facadeAz) => Math.abs(((sunAz - facadeAz + 540) % 360) - 180);
  // 월 → 컷오프 (춘분 3~5월, 하지 6~8월, 추분 9~11월, 동지 12~2월)
  const cutoffOf = (month, c) => [c[3], c[3], c[0], c[0], c[0], c[1], c[1], c[1], c[2], c[2], c[2], c[3]][month - 1];
  // 날 깊이 d, 간격 s일 때 열린 날(정면에 수직)의 직달 투과율
  const openTransmission = (tilt, ds) => Math.max(0, 1 - ds * Math.tan(tilt * RAD));
  // 닫힘일 때 햇빛이 막히는 최소 날 각도 (d = s 이면 90 − 2·기운 각도)
  const closedAngle = (tilt, ds) => Math.max(0, Math.asin(Math.min(1, Math.cos(tilt * RAD) / ds)) / RAD - tilt);

  // ---- 한 시각, 한 입면의 루버 상태 (애니메이션 · 히트맵 · 연간 계산이 모두 이 식을 쓴다) ----
  // state: 'night'(해 없음) · 'back'(해가 입면 뒤) · 'open' · 'closed' · 'winter'(겨울 모드, 햇빛과 나란히)
  // angle: 날 회전 각도(0 = 정면에 수직), side: 해가 정면의 오른쪽(+1)/왼쪽(−1) (밖에서 실내를 볼 때가 아니라 실내에서 밖을 볼 때)
  function louverState(sp, month, facadeAz, spec, A, winterOn) {
    const ds = spec.blade_depth_mm / spec.blade_spacing_mm;
    const heat = A.heating_months.includes(month);
    if (sp.alt <= 0.5) return { state: 'night', angle: 0, side: 1, tilt: null, tr: null };
    const tilt = tiltOf(sp.az, facadeAz);
    const signed = ((sp.az - facadeAz + 540) % 360) - 180;
    const side = signed >= 0 ? 1 : -1;
    const closedRule = tilt <= cutoffOf(month, spec.cutoff_deg) && sp.alt >= spec.min_sun_alt_deg;
    const winterNow = winterOn && heat;
    const closed = closedRule && !winterNow;
    let angle = 0;
    if (closed) angle = closedAngle(tilt, ds);
    else if (winterNow && tilt < 90) angle = tilt;
    if (tilt >= 90) return { state: 'back', angle, side, tilt, closed: false, tr: null };
    const open = openTransmission(tilt, ds);
    const tr = {
      bare: 1,
      internal_reactive: closed ? A.internal_shading_coef : 1,
      external_fixed: open,
      external_reactive: winterNow ? A.winter_mode_transmission : (closed ? 0 : open)
    };
    // rule / rule_angle: 겨울 모드와 상관없이 규칙만 따를 때 (내부 반응형은 겨울 모드가 없다)
    return { state: winterNow ? 'winter' : closed ? 'closed' : 'open', angle, side, tilt, closed, rule: closedRule, rule_angle: closedRule ? closedAngle(tilt, ds) : 0, tr };
  }

  // 편의 함수: 입력과 날짜 · 시각으로 모든 입면 상태
  function stateAt(input, y, m, d, hh, mm) {
    const A = merge(DEFAULT_ASSUMPTIONS, input.assumptions), spec = merge(DEFAULT_SPEC, input.louver_spec);
    const sp = sunPosition(input.site.lat_deg, input.site.lon_deg, y, m, d, hh, mm);
    return { sun: sp, facades: input.facades.map(f => ({ id: f.id, louver: f.louver, azimuth_deg: f.azimuth_deg, ...louverState(sp, m, f.azimuth_deg, spec, A, input.winter_mode !== false) })) };
  }

  // ---- 간이식: Unity 값이 없을 때 solar_result 를 직접 만든다 ----
  function clearSkySolar(input, opts) {
    opts = opts || {};
    const A = merge(DEFAULT_ASSUMPTIONS, input.assumptions);
    const spec = merge(DEFAULT_SPEC, input.louver_spec);
    const year = opts.year || 2026, step = opts.step_min || 10;
    const winter = input.winter_mode !== false;
    const lat = input.site.lat_deg, lon = input.site.lon_deg;
    const facades = input.facades.map(f => ({ id: f.id, cooling_season: { bare_kwh_m2_yr: 0, internal_reactive_kwh_m2_yr: 0, external_fixed_kwh_m2_yr: 0, external_reactive_kwh_m2_yr: 0 }, heating_season: { bare_kwh_m2_yr: 0, internal_reactive_kwh_m2_yr: 0, external_fixed_kwh_m2_yr: 0, external_reactive_kwh_m2_yr: 0 }, closed_hours_yr: 0, blade_rotation_deg_yr: 0, _prev: 0 }));
    const dt = step / 60; // h
    for (let t = Date.UTC(year, 0, 1); t < Date.UTC(year + 1, 0, 1); t += step * 6e4) {
      const dd = new Date(t), m = dd.getUTCMonth() + 1, d = dd.getUTCDate(), mins = dd.getUTCHours() * 60 + dd.getUTCMinutes();
      const sp = sunPosition(lat, lon, year, m, d, Math.floor(mins / 60), mins % 60);
      const cool = A.cooling_months.includes(m), heat = A.heating_months.includes(m);
      input.facades.forEach((f, i) => {
        const r = facades[i];
        const s = louverState(sp, m, f.azimuth_deg, spec, A, winter);
        if (s.closed) r.closed_hours_yr += dt;
        if (s.tr) {
          const AM = 1 / Math.sin(sp.alt * RAD);
          const dni = 1353 * Math.pow(0.7, Math.pow(AM, 0.678)) * A.clear_fraction;
          const I = dni * Math.cos(sp.alt * RAD) * Math.cos(s.tilt * RAD) * dt / 1000; // kWh/㎡
          const bucket = cool ? r.cooling_season : heat ? r.heating_season : null;
          if (bucket) {
            bucket.bare_kwh_m2_yr += I;
            for (const a of ALTS) bucket[a + '_kwh_m2_yr'] += I * s.tr[a];
          }
        }
        r.blade_rotation_deg_yr += Math.abs(s.angle - r._prev); r._prev = s.angle;
      });
    }
    facades.forEach(r => { delete r._prev; for (const s of ['cooling_season', 'heating_season']) for (const k in r[s]) r[s][k] = Math.round(r[s][k] * 10) / 10; r.closed_hours_yr = Math.round(r.closed_hours_yr); r.blade_rotation_deg_yr = Math.round(r.blade_rotation_deg_yr); });
    return { meta: { weather_source: 'clear_sky', shading_included: false, timestep_min: step, version: 'engine-0.1' }, facades };
  }

  // ---- 물량 · 공사비 (7_공사비) ----
  function quantities(input) {
    const spec = merge(DEFAULT_SPEC, input.louver_spec);
    const lf = input.facades.filter(f => f.louver);
    const window_area_m2 = lf.reduce((s, f) => s + windowArea(f), 0);
    const louver_area_m2 = window_area_m2 * spec.louver_to_window_ratio;
    const drive_units = Math.round(louver_area_m2 / spec.area_per_unit_m2);
    return { window_area_m2, louver_area_m2, drive_units };
  }
  const windowArea = f => (f.window_area_m2 !== undefined && f.window_area_m2 !== null && f.window_area_m2 !== '') ? Number(f.window_area_m2) : f.width_m * f.height_m * f.wwr;

  function cost(alt, q, A) {
    const P = A.unit_price, L = q.louver_area_m2, U = q.drive_units, W = q.window_area_m2;
    const items = {};
    if (alt === 'internal_reactive') {
      items.louver = L * P.louver_int_krw_m2; items.frame = 0;
      items.drive = U * P.drive_unit_krw + P.control_system_krw; items.software = P.software_krw;
      items.protective_glass = 0; items.install = L * P.install_int_krw_m2;
      items.scaffold = A.scaffold_days_int * P.lift_krw_day;
    } else {
      const reactive = alt === 'external_reactive';
      items.louver = L * P.louver_ext_krw_m2; items.frame = L * P.frame_krw_m2;
      items.drive = reactive ? U * P.drive_unit_krw + P.control_system_krw : 0;
      items.software = reactive ? P.software_krw : 0;
      items.protective_glass = A.protective_glass[alt] ? W * P.protective_glass_krw_m2 : 0;
      items.install = L * P.install_ext_krw_m2;
      items.scaffold = A.scaffold_days_ext * (P.gondola_krw_day + P.lift_krw_day);
    }
    for (const k in items) items[k] *= A.cost_multiplier;
    const direct = Object.values(items).reduce((s, v) => s + v, 0);
    items.design_fee = direct * A.design_fee_rate; items.contingency = direct * A.contingency_rate;
    return { items_krw: items, total_krw: direct + items.design_fee + items.contingency };
  }

  // 누적 비용이 통유리보다 낮아지는 첫 해 (10_누적·민감도, 최대 maxYears)
  function breakeven(C, saving, M, g, maxYears) {
    for (let t = 0; t <= maxYears; t++) {
      const ann = g === 0 ? t : (Math.pow(1 + g, t) - 1) / g;
      if (C + M * t <= saving * ann) return t;
    }
    return null;
  }

  // ---- 본 계산 ----
  function compute(input, solar, opts) {
    opts = opts || {};
    const A = merge(DEFAULT_ASSUMPTIONS, input.assumptions);
    const mode = opts.mode || 'solar'; // 'solar' | 'excel'
    const warnings = [];
    if (mode === 'radiance') { solar = radianceSolar(input); }
    if ((mode === 'solar') && !solar) { solar = clearSkySolar(input, opts); }
    if (mode === 'solar' && solar.meta && solar.meta.weather_source === 'clear_sky') warnings.push('일사량: 맑은 날 간이식 사용 (기상 데이터 · 주변 그림자 미반영)');
    if (mode === 'excel') warnings.push('엑셀 검증 모드: 엑셀 1·8·13·14번 시트 값(팀 Radiance 9층 가중 평균)으로 계산');
    if (mode === 'radiance') warnings.push('일사량: 팀 Radiance solar_result(1784 9층, 주변 그림자 · 실제 날씨 반영)를 입면 방위에 맞춰 적용. 다른 건물 · 층에서는 근사값');
    const q = quantities(input);
    const price = A.elec_price_krw_kwh * A.elec_price_multiplier; // 원/kWh
    const lightScale = q.window_area_m2 / 1000;
    const winterMode = input.winter_mode !== false;
    const alts = input.alternative && input.alternative.length ? input.alternative : ALTS;
    const lf = input.facades.filter(f => f.louver);
    const result = {};
    for (const alt of alts) {
      let coolSaved = 0, heatAdded = 0;
      const per_facade = [];
      if (mode === 'excel') {
        const X = A.excel_mode;
        coolSaved = q.window_area_m2 * A.shgc * (X.cooling_irradiance_kwh_m2.bare - X.cooling_irradiance_kwh_m2[alt]) / A.cop_cooling / 1000;
        const tw = alt === 'external_reactive' ? (winterMode ? X.winter_transmission.external_reactive_winter : X.winter_transmission.external_reactive_rule) : X.winter_transmission[alt];
        heatAdded = X.winter_kwh_m2_day * q.window_area_m2 * (1 - tw) * A.shgc * X.winter_days * X.weather_factor / A.cop_heating / 1000;
      } else {
        for (const f of lf) {
          const s = solar.facades.find(x => x.id === f.id);
          if (!s) { warnings.push(`입면 ${f.id}: 일사량 값 없음`); continue; }
          const Aw = windowArea(f);
          const c = Aw * A.shgc * (s.cooling_season.bare_kwh_m2_yr - s.cooling_season[alt + '_kwh_m2_yr']) / A.cop_cooling / 1000;
          const h = Aw * A.shgc * (s.heating_season.bare_kwh_m2_yr - s.heating_season[alt + '_kwh_m2_yr']) / A.cop_heating / 1000;
          coolSaved += c; heatAdded += h;
          per_facade.push({ id: f.id, window_area_m2: Aw, louver_area_m2: Aw * merge(DEFAULT_SPEC, input.louver_spec).louver_to_window_ratio, cooling_saved_mwh_yr: c, heating_added_mwh_yr: h, closed_hours_yr: s.closed_hours_yr, blade_rotation_deg_yr: s.blade_rotation_deg_yr });
        }
      }
      const lightAdded = (A.lighting_kwh_per_1000m2[alt] - A.lighting_kwh_per_1000m2.bare) * lightScale / 1000;
      const net = coolSaved - lightAdded - heatAdded;
      const cst = cost(alt, q, A);
      const maint = cst.total_krw * A.maintenance_rate[alt] * A.maintenance_multiplier + (alt !== 'external_fixed' ? A.unit_price.software_run_krw_yr * A.maintenance_multiplier : 0);
      // 엑셀 8·9·10번 시트는 전기요금에 난방을 넣지 않음 → 검증 모드에서만 제외
      const moneyMwh = mode === 'excel' ? coolSaved - lightAdded : net;
      const energySavedKrw = moneyMwh * 1000 * price;
      const be = breakeven(cst.total_krw, energySavedKrw, maint, A.elec_escalation, opts.max_years || 100);
      result[alt] = {
        name: ALT_NAMES[alt],
        quantity: { window_area_m2: q.window_area_m2, louver_area_m2: q.louver_area_m2, drive_units: alt === 'external_fixed' ? 0 : q.drive_units, protective_glass_m2: A.protective_glass[alt] ? q.window_area_m2 : 0 },
        cost: cst,
        energy: { cooling_saved_mwh_yr: coolSaved, lighting_added_mwh_yr: lightAdded, heating_added_mwh_yr: heatAdded, net_saved_mwh_yr: net },
        carbon: { saved_t_yr: net * A.emission_t_mwh, saved_t_life: net * A.emission_t_mwh * A.life_yr, cost_per_t_krw: net > 0 ? cst.total_krw / (net * A.emission_t_mwh * A.life_yr) : null },
        money: { energy_saved_krw_yr: energySavedKrw, maintenance_krw_yr: maint, breakeven_year: be },
        per_facade
      };
    }
    return { result, warnings, solar };
  }

  // 통유리 대비 누적 순이익 (원): 전기요금 절감 × 인상 반영 누적 − 공사비 − 유지관리비 × 연수
  function cumulativeNet(r, escalation, years) {
    const out = [];
    for (let t = 0; t <= years; t++) { const ann = escalation === 0 ? t : (Math.pow(1 + escalation, t) - 1) / escalation; out.push(r.money.energy_saved_krw_yr * ann - r.cost.total_krw - r.money.maintenance_krw_yr * t); }
    return out;
  }

  const api = { compute, clearSkySolar, radianceSolar, RADIANCE_9F, sunPosition, quantities, stateAt, louverState, cumulativeNet, merge, DEFAULT_ASSUMPTIONS, DEFAULT_SPEC, ALT_NAMES, version: '0.1' };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LouverEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
