/*
 * 브이월드 연결 + 건물 외곽선 → 입면 변환 (2단계)
 * - 주소 → 좌표: api.vworld.kr/req/address (getcoord)
 * - 건물: api.vworld.kr/req/data (LT_C_SPBD 도로명주소건물: 외곽선 + gro_flo_co 지상층수)
 * - localhost 에서는 serve.js 프록시(/vworld/...)로, 그 밖(깃허브 페이지)에서는 JSONP 로 호출한다
 */
(function (root) {
  'use strict';
  const RAD = Math.PI / 180;
  const BASE = 'https://api.vworld.kr/req/';

  // ---- 호출 ----
  let jsonpSeq = 0;
  function jsonp(url, timeoutMs) {
    return new Promise((resolve, reject) => {
      const name = '__vw_cb' + (++jsonpSeq);
      const s = document.createElement('script');
      const done = () => { delete root[name]; s.remove(); clearTimeout(t); };
      const t = setTimeout(() => { done(); reject(new Error('브이월드 응답 없음 (키 · 서비스 URL 확인)')); }, timeoutMs || 15000);
      root[name] = data => { done(); resolve(data); };
      s.onerror = () => { done(); reject(new Error('브이월드 호출 실패')); };
      s.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + name;
      document.head.appendChild(s);
    });
  }
  const isLocal = () => ['localhost', '127.0.0.1'].includes(location.hostname);
  async function vworld(path, params, cfg) {
    const q = new URLSearchParams({ ...params, key: cfg.key || '', domain: cfg.domain || location.origin, format: 'json' });
    if (isLocal()) {
      // serve.js 프록시: 키를 비워 두면 서버의 VWORLD_KEY 환경변수를 쓴다
      const r = await fetch('/vworld/' + path + '?' + q.toString());
      if (!r.ok) throw new Error('프록시 오류 ' + r.status + ' (node serve.js 로 열었는지 확인)');
      return r.json();
    }
    return jsonp(BASE + path + '?' + q.toString());
  }
  function check(res) {
    const r = res && res.response;
    if (!r) throw new Error('브이월드 응답 형식이 다름');
    if (r.status === 'NOT_FOUND') return null;
    if (r.status !== 'OK') throw new Error('브이월드 오류: ' + ((r.error && r.error.text) || r.status) + ' (키 · 등록한 서비스 URL 확인)');
    return r;
  }

  // ---- 주소 → 좌표 ----
  async function geocode(address, cfg) {
    for (const type of ['road', 'parcel']) {
      const r = check(await vworld('address', { service: 'address', request: 'getcoord', version: '2.0', crs: 'epsg:4326', address, refine: 'true', simple: 'false', type }, cfg));
      if (r && r.result && r.result.point) return { lat: Number(r.result.point.y), lon: Number(r.result.point.x), type };
    }
    return null;
  }

  // ---- 좌표 주변 건물 ----
  async function buildingsNear(lat, lon, cfg, radiusDeg) {
    const d = radiusDeg || 0.0006; // 약 60 m
    const r = check(await vworld('data', { service: 'data', request: 'GetFeature', data: 'LT_C_SPBD', geomFilter: `BOX(${(lon - d).toFixed(6)},${(lat - d).toFixed(6)},${(lon + d).toFixed(6)},${(lat + d).toFixed(6)})`, crs: 'EPSG:4326', size: '100', page: '1', geometry: 'true', attribute: 'true' }, cfg));
    if (!r) return [];
    return r.result.featureCollection.features.map(f => ({
      id: f.id || f.properties.bd_mgt_sn,
      name: [f.properties.buld_nm, f.properties.buld_nm_dc].filter(Boolean).join(' ').trim(),
      floors: f.properties.gro_flo_co != null && f.properties.gro_flo_co !== '' ? Number(f.properties.gro_flo_co) : null,
      ring: outerRing(f.geometry),
      props: f.properties
    })).filter(b => b.ring && b.ring.length >= 4);
  }
  // 가장 큰 폴리곤의 바깥 고리 [[lon,lat],...]
  function outerRing(g) {
    if (!g) return null;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    let best = null, bestA = -1;
    for (const p of polys) { const a = Math.abs(ringArea(p[0])); if (a > bestA) { bestA = a; best = p[0]; } }
    return best;
  }
  const ringArea = r => { let s = 0; for (let i = 0; i < r.length - 1; i++) s += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return s / 2; };
  function contains(ring, lon, lat) {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  function pickBuilding(list, lat, lon) {
    const hit = list.find(b => contains(b.ring, lon, lat));
    if (hit) return hit;
    let best = null, bd = Infinity;
    for (const b of list) { const c = centroid(b.ring); const d = (c[0] - lon) ** 2 + (c[1] - lat) ** 2; if (d < bd) { bd = d; best = b; } }
    return best;
  }
  const centroid = r => { let x = 0, y = 0; const n = r.length - 1; for (let i = 0; i < n; i++) { x += r[i][0]; y += r[i][1]; } return [x / n, y / n]; };

  // ---- 외곽선 → 입면 ----
  // opts: minEdge_m(짧은 변 제외), mergeDeg(거의 같은 방향 변 합치기), floorHeight_m, wwr, northNoLouverDeg
  const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const dirName = az => DIRS[Math.round(((az % 360) + 360) % 360 / 45) % 8];
  function facadesFromRing(ring, floors, opts) {
    opts = Object.assign({ minEdge_m: 5, mergeDeg: 12, floorHeight_m: 4, wwr: 0.6, northNoLouverDeg: 45, defaultFloors: 5 }, opts || {});
    const lat0 = centroid(ring)[1];
    const mx = 111320 * Math.cos(lat0 * RAD), my = 110540;
    let pts = ring.map(([lon, lat]) => [lon * mx, lat * my]);
    if (pts.length > 1 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1]) pts = pts.slice(0, -1);
    // 반시계 방향으로 맞춘다 (바깥 법선 = 진행 방향의 오른쪽 → (dy, −dx))
    let area = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
    if (area < 0) pts.reverse();
    let edges = pts.map((a, i) => { const b = pts[(i + 1) % pts.length]; const dx = b[0] - a[0], dy = b[1] - a[1]; const len = Math.hypot(dx, dy); const az = (Math.atan2(dy, -dx) / RAD + 360) % 360; return { len, az, dx, dy }; });
    // 이웃한 변의 방향이 거의 같으면 합친다
    const diff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
    let merged = [];
    for (const e of edges) {
      const last = merged.at(-1);
      if (last && diff(last.az, e.az) <= opts.mergeDeg) { const L = last.len + e.len; last.az = (Math.atan2(last.dy + e.dy, -(last.dx + e.dx)) / RAD + 360) % 360; last.dx += e.dx; last.dy += e.dy; last.len = L; }
      else merged.push({ ...e });
    }
    if (merged.length > 1 && diff(merged[0].az, merged.at(-1).az) <= opts.mergeDeg) { const f = merged.shift(), l = merged.at(-1); l.dx += f.dx; l.dy += f.dy; l.len += f.len; l.az = (Math.atan2(l.dy, -l.dx) / RAD + 360) % 360; }
    const fl = floors && floors > 0 ? floors : opts.defaultFloors;
    const height = Math.round(fl * opts.floorHeight_m * 10) / 10;
    const counts = {};
    return merged.filter(e => e.len >= opts.minEdge_m).map(e => {
      const az = Math.round(e.az);
      const d = dirName(az); counts[d] = (counts[d] || 0) + 1;
      const north = diff(az, 0) <= opts.northNoLouverDeg;
      return { id: d + counts[d], azimuth_deg: az, width_m: Math.round(e.len * 10) / 10, height_m: height, wwr: opts.wwr, window_area_m2: Math.round(e.len * height * opts.wwr * 10) / 10, louver: !north };
    });
  }

  const api = { geocode, buildingsNear, pickBuilding, facadesFromRing, outerRing, isLocal };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.VWorld = api;
})(typeof window !== 'undefined' ? window : globalThis);
