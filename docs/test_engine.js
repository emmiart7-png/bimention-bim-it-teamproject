// 엑셀 임시값과 같은 숫자가 나오는지 확인: node test_engine.js
const E = require('./engine.js');
const input = {
  site: { address: '경기 성남시 분당구 정자동', lat_deg: 37.3595, lon_deg: 127.1052 },
  project_type: 'new', winter_mode: true,
  facades: [
    { id: 'E', azimuth_deg: 90, window_area_m2: 300, louver: true },
    { id: 'S', azimuth_deg: 180, window_area_m2: 400, louver: true },
    { id: 'W', azimuth_deg: 270, window_area_m2: 300, louver: true },
    { id: 'N', azimuth_deg: 0, window_area_m2: 300, louver: false }
  ]
};
// 엑셀 값 (7_공사비, 8_시공전후, 13_탄소·계절효과, 14_Radiance(팀) ⑥ solar_result · 겨울 햇빛 활용률 0.7 반영 후)
const expect = {
  internal_reactive: { total: 641840000, cool: 23.18, light: 4, heat: 0, net: 19.18, t: 8.823, maint: 36092000, be: null },
  external_fixed: { total: 545790000, cool: 21.15, light: 14, heat: 15.438, net: -8.288, t: -3.812, maint: 10915800, be: null },
  external_reactive: { total: 1291590000, cool: 34.51, light: 5, heat: 3.97, net: 25.54, t: 11.748, maint: 68579500, be: null }
};
const out = E.compute(input, null, { mode: 'excel' });
let fail = 0;
const near = (a, b, tol) => (a === null && b === null) || (a !== null && b !== null && Math.abs(a - b) <= tol);
for (const [alt, x] of Object.entries(expect)) {
  const r = out.result[alt];
  const checks = [
    ['총 공사비', r.cost.total_krw, x.total, 1],
    ['냉방 절감', r.energy.cooling_saved_mwh_yr, x.cool, 0.01],
    ['조명 증가', r.energy.lighting_added_mwh_yr, x.light, 0.01],
    ['난방 증가', r.energy.heating_added_mwh_yr, x.heat, 0.01],
    ['순 절감', r.energy.net_saved_mwh_yr, x.net, 0.01],
    ['탄소', r.carbon.saved_t_yr, x.t, 0.01],
    ['유지관리비', r.money.maintenance_krw_yr, x.maint, 1],
    ['손익분기(100년 이내)', r.money.breakeven_year, x.be === null ? null : x.be, 0]
  ];
  for (const [n, a, b, tol] of checks) {
    // 내부 반응형 손익분기: 엑셀은 60년 초과 → 엔진은 100년까지 찾으므로 60 초과면 통과
    const ok = (n.startsWith('손익') && b === null) ? (a === null || a > 60) : near(a, b, tol);
    if (!ok) fail++;
    console.log(ok ? 'OK ' : 'XX ', E.ALT_NAMES[alt].padEnd(7), n.padEnd(12), a, b === null ? '(60년 초과)' : '(엑셀 ' + b + ')');
  }
}
console.log(fail ? `불일치 ${fail}건` : '엑셀과 모두 일치');
// 간이식(맑은 날) 모드 결과도 출력
const t0 = Date.now(); const s = E.compute(input, null, { mode: 'solar' });
console.log('\n간이식 모드', (Date.now() - t0) + 'ms');
for (const [alt, r] of Object.entries(s.result)) console.log(r.name, '순절감', r.energy.net_saved_mwh_yr.toFixed(1), 'MWh  냉방', r.energy.cooling_saved_mwh_yr.toFixed(1), ' 난방+', r.energy.heating_added_mwh_yr.toFixed(1), ' 탄소', r.carbon.saved_t_yr.toFixed(1), 't  손익분기', r.money.breakeven_year);
for (const f of s.solar.facades) console.log(f.id, JSON.stringify(f.cooling_season), '닫힘', f.closed_hours_yr, 'h  회전', f.blade_rotation_deg_yr, '°');
process.exitCode = fail ? 1 : 0;

const rr = E.compute(input, null, { mode: 'radiance' });
console.log('\n팀 Radiance 방위별 모드');
for (const [alt, r] of Object.entries(rr.result)) console.log(r.name, '순절감', r.energy.net_saved_mwh_yr.toFixed(1), 'MWh  냉방', r.energy.cooling_saved_mwh_yr.toFixed(1), ' 난방+', r.energy.heating_added_mwh_yr.toFixed(1), ' 탄소', r.carbon.saved_t_yr.toFixed(1), 't');
const ro = E.compute(Object.assign({}, input, { winter_mode: false }), null, { mode: 'radiance' });
console.log('\n겨울 모드 끔 (Radiance)');
for (const [a, r] of Object.entries(ro.result)) console.log(r.name, '순절감', r.energy.net_saved_mwh_yr.toFixed(1), '난방+', r.energy.heating_added_mwh_yr.toFixed(1));
