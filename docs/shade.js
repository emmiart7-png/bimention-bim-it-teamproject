/* 주변 건물 · 지형 그림자 → 일사량 보정 (웹 계산)
 *
 * 입면마다 점 여러 개에서 해 쪽으로 광선을 쏴, 주변 건물(외곽 × 높이)이나 지형에 가리는지 본다.
 * 매월 15일, 30분 간격으로 보고, 맑은 날 직달 일사량으로 가중 평균해 "보이는 비율" k (0~1)를 냉방기 · 난방기별로 낸다.
 *
 * 팀 Radiance 값은 1784 9층 (1784 주변 그림자 포함) 이라서, 선택한 건물에는
 *   보정 배수 = k(선택한 건물) ÷ k(1784 9층, 같은 방위 입면)
 * 를 곱한다. 확산광도 직달과 같은 비율로 가린다고 보는 근사다.
 *
 * 좌표: e = 동쪽 (m), n = 북쪽 (m), z = 위 (m, 고른 건물 중심의 땅 높이 = 0)
 */
(function (root) {
  const RAD = Math.PI / 180;
  const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const COOL = [6, 7, 8, 9], HEAT = [12, 1, 2];

  // ---- 지형: AWS Terrain Tiles (model3d.js 와 같은 타일 · 같은 기준) ----
  const TZ = 15, TR = 450;
  function tileXY(lon, lat, z) {
    const n = 2 ** z, lr = lat * RAD;
    return [(lon + 180) / 360 * n, (1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2 * n];
  }
  function loadImg(url) {
    return new Promise((ok, no) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => ok(im); im.onerror = () => no(new Error('지형 타일')); im.src = url; });
  }
  // lat0, lon0 땅 높이 = 0 인 elev(e, n) 함수. 실패하면 null (지형 없이 계산)
  async function terrain(lat0, lon0) {
    try {
      const mx = 111320 * Math.cos(lat0 * RAD), my = 110540;
      const a = tileXY(lon0 - TR / mx, lat0 + TR / my, TZ), b = tileXY(lon0 + TR / mx, lat0 - TR / my, TZ);
      const x0 = Math.floor(a[0]), x1 = Math.floor(b[0]), y0 = Math.floor(a[1]), y1 = Math.floor(b[1]);
      const cv = document.createElement('canvas'); cv.width = (x1 - x0 + 1) * 256; cv.height = (y1 - y0 + 1) * 256;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      const jobs = [];
      for (let tx = x0; tx <= x1; tx++) for (let ty = y0; ty <= y1; ty++)
        jobs.push(loadImg('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/' + TZ + '/' + tx + '/' + ty + '.png').then(im => cx.drawImage(im, (tx - x0) * 256, (ty - y0) * 256)));
      await Promise.all(jobs);
      const W = cv.width, H = cv.height, px = cx.getImageData(0, 0, W, H).data;
      const h = (ix, iy) => { ix = Math.max(0, Math.min(W - 1, ix)); iy = Math.max(0, Math.min(H - 1, iy)); const k = (iy * W + ix) * 4; return px[k] * 256 + px[k + 1] + px[k + 2] / 256 - 32768; };
      const sample = (lon, lat) => {
        const [fx, fy] = tileXY(lon, lat, TZ), x = (fx - x0) * 256 - 0.5, y = (fy - y0) * 256 - 0.5;
        const ix = Math.floor(x), iy = Math.floor(y), u = x - ix, v = y - iy;
        return h(ix, iy) * (1 - u) * (1 - v) + h(ix + 1, iy) * u * (1 - v) + h(ix, iy + 1) * (1 - u) * v + h(ix + 1, iy + 1) * u * v;
      };
      const base = sample(lon0, lat0);
      const elev = (e, n) => sample(lon0 + e / mx, lat0 + n / my) - base;
      // 반경 안의 최고 높이 (광선이 이보다 높아지면 지형 검사를 멈춘다)
      let top = -Infinity; for (let e = -TR; e <= TR; e += 30) for (let n = -TR; n <= TR; n += 30) top = Math.max(top, elev(e, n));
      elev.top = top; elev.range = TR;
      return elev;
    } catch (e) { console.warn('[Shade] 지형 없이 계산', e); return null; }
  }

  // ---- 장면: 고른 건물 + 주변 건물 → 장애물 (외곽 다각형, 바닥 · 꼭대기 높이) ----
  // b = {ring:[[lon,lat],…], floors}, list = 주변 건물 (같은 형식), opt = {floorHeight (고른 건물), ctxFloorHeight, lat0, lon0, elev}
  function scene(b, list, opt) {
    const mx = 111320 * Math.cos(opt.lat0 * RAD), my = 110540;
    const toEN = r => { const p = r.slice(0, -1); return p.map(([x, y]) => [(x - opt.lon0) * mx, (y - opt.lat0) * my]); };
    const obstacles = [];
    const add = (poly, base, top, minT) => {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const [x, y] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      obstacles.push({ poly, base, top, box: [x0, x1, y0, y1], minT: minT || 0.05 });
    };
    // 고른 건물 자신 (ㄱ · ㄷ자에서 다른 날개가 만드는 그늘)
    // 입면 점은 합친 변(직선) 기준이라 곡면이면 외곽 안쪽에 들 수 있다 → 자기 건물은 2 m 이내 교차를 무시
    add(toEN(b.ring), 0, (b.floors || 5) * opt.floorHeight, 2);
    for (const x of list) {
      const poly = toEN(x.ring); if (poly.length < 3) continue;
      const c = poly.reduce((s, p) => [s[0] + p[0] / poly.length, s[1] + p[1] / poly.length], [0, 0]);
      const base = opt.elev ? opt.elev(c[0], c[1]) : 0;   // 3D 보기와 같게 중심의 땅 높이에 세운다
      add(poly, base, base + (x.floors || 3) * opt.ctxFloorHeight);
    }
    return { obstacles, mx, my, elev: opt.elev };
  }

  // 점 P 에서 방향 (dE, dN) 수평, 기울기 slope 로 올라가는 광선이 가리는가
  function blocked(S, P, dE, dN, slope) {
    for (const o of S.obstacles) {
      if (o.top <= P[2]) continue;   // 광선은 올라가기만 하므로 더 낮은 건물은 못 가린다
      const [x0, x1, y0, y1] = o.box;
      // 상자 쪽으로 가지 않으면 건너뛴다
      if ((dE > 0 && x1 < P[0]) || (dE < 0 && x0 > P[0]) || (dN > 0 && y1 < P[1]) || (dN < 0 && y0 > P[1])) continue;
      const poly = o.poly, n = poly.length;
      for (let i = 0; i < n; i++) {
        const a = poly[i], b = poly[(i + 1) % n];
        const ex = b[0] - a[0], ey = b[1] - a[1];
        const den = dE * ey - dN * ex; if (Math.abs(den) < 1e-9) continue;
        const wx = a[0] - P[0], wy = a[1] - P[1];
        const t = (wx * ey - wy * ex) / den, u = (wx * dN - wy * dE) / den;
        if (t > o.minT && u >= 0 && u <= 1) { const z = P[2] + t * slope; if (z < o.top && z > o.base - 0.5) return true; }
      }
    }
    const el = S.elev;
    if (el) for (let t = 10; t <= el.range; t += 10) {
      const z = P[2] + t * slope; if (z > el.top) break;
      if (el(P[0] + dE * t, P[1] + dN * t) > z) return true;
    }
    return false;
  }

  // 입면 점: facade = facadesFromRing 결과 (path = [[lon,lat],[lon,lat]], azimuth_deg). heights = 땅 위 높이 목록
  function facadePoints(S, f, lat0, lon0, heights, along) {
    const [a, b] = f.path.map(([x, y]) => [(x - lon0) * S.mx, (y - lat0) * S.my]);
    const nE = Math.sin(f.azimuth_deg * RAD), nN = Math.cos(f.azimuth_deg * RAD);
    const pts = [];
    for (const s of along) for (const z of heights) pts.push([a[0] + (b[0] - a[0]) * s + nE * 0.5, a[1] + (b[1] - a[1]) * s + nN * 0.5, z]);
    return pts;
  }

  // 입면마다 보이는 비율 k = {cool, heat} (맑은 날 직달 일사량 가중)
  function visibility(S, facades, pointsOf, lat, lon) {
    const sunPosition = root.LouverEngine.sunPosition;
    const out = {};
    for (const f of facades) {
      const pts = pointsOf(f);
      const acc = { cool: [0, 0], heat: [0, 0] };
      for (let m = 1; m <= 12; m++) {
        const season = COOL.includes(m) ? 'cool' : HEAT.includes(m) ? 'heat' : null; if (!season) continue;
        for (let hm = 5 * 60; hm <= 20 * 60; hm += 30) {
          const sp = sunPosition(lat, lon, 2026, m, 15, Math.floor(hm / 60), hm % 60);
          if (sp.alt <= 0.5) continue;
          const tilt = Math.abs(((sp.az - f.azimuth_deg + 540) % 360) - 180); if (tilt >= 90) continue;
          const AM = 1 / Math.sin(sp.alt * RAD);
          const w = 1353 * Math.pow(0.7, Math.pow(AM, 0.678)) * Math.cos(sp.alt * RAD) * Math.cos(tilt * RAD) * MONTH_DAYS[m - 1];
          const dE = Math.sin(sp.az * RAD), dN = Math.cos(sp.az * RAD), slope = Math.tan(sp.alt * RAD);
          let vis = 0; for (const P of pts) if (!blocked(S, P, dE, dN, slope)) vis++;
          acc[season][0] += w * vis / pts.length; acc[season][1] += w;
        }
      }
      out[f.id] = { azimuth_deg: f.azimuth_deg, cool: acc.cool[1] ? acc.cool[0] / acc.cool[1] : 1, heat: acc.heat[1] ? acc.heat[0] / acc.heat[1] : 1 };
    }
    return out;
  }

  // ---- 고른 건물: 입면 전체 (가로 3곳 × 높이 3곳) ----
  // b = 고른 건물, list = 주변 건물, facades = facadesFromRing 결과
  async function forBuilding(b, list, facades, opt) {
    const c = centroid(b.ring);
    const elev = await terrain(c[1], c[0]);
    const S = scene(b, list, { floorHeight: opt.floorHeight, ctxFloorHeight: opt.ctxFloorHeight || 3.3, lat0: c[1], lon0: c[0], elev });
    const H = (b.floors || 5) * opt.floorHeight;
    return { k: visibility(S, facades, f => facadePoints(S, f, c[1], c[0], [H / 6, H / 2, H * 5 / 6], [1 / 6, 1 / 2, 5 / 6]), c[1], c[0]), terrain: !!elev, count: list.length };
  }

  // ---- 1784 9층 기준값 (팀 Radiance 와 같은 자리: 9층 입면 중앙) ----
  // 브라우저에 한 번 계산해 저장해 둔다 (주변 건물을 다시 불러오지 않게)
  const REF_KEY = 'shade_ref_1784_v1', REF_LAT = 37.3595, REF_LON = 127.1052, REF_FLOOR = 9, REF_FLOOR_H = 4.2;
  let refPromise = null;
  function reference(cfg) {
    if (refPromise) return refPromise;
    refPromise = (async () => {
      try { const s = localStorage.getItem(REF_KEY); if (s) return JSON.parse(s); } catch (e) { }
      let list;
      try { list = await root.VWorld.buildingsNear(REF_LAT, REF_LON, { ...cfg, timeoutMs: 40000 }, 0.0025); }
      catch (e) { list = await root.VWorld.buildingsNear(REF_LAT, REF_LON, { ...cfg, timeoutMs: 40000 }, 0.0012); }
      const b = root.VWorld.pickBuilding(list, REF_LAT, REF_LON);
      const others = list.filter(x => x.id !== b.id);
      const fs = root.VWorld.facadesFromRing(b.ring, b.floors, { floorHeight_m: REF_FLOOR_H, northNoLouverDeg: -1 });
      const c = centroid(b.ring);
      const elev = await terrain(c[1], c[0]);
      const S = scene(b, others, { floorHeight: REF_FLOOR_H, ctxFloorHeight: 3.3, lat0: c[1], lon0: c[0], elev });
      const z = (REF_FLOOR - 0.5) * REF_FLOOR_H;
      const k = visibility(S, fs, f => facadePoints(S, f, c[1], c[0], [z], [1 / 2]), c[1], c[0]);
      // 팀 Radiance 입면 (E · S · W · N) 마다 방위가 가장 가까운 1784 입면 값
      const ref = {};
      for (const [id, az] of [['E', 90], ['S', 180], ['W', 270], ['N', 0]]) {
        const best = Object.values(k).reduce((p, q) => (!p || angDiff(q.azimuth_deg, az) < angDiff(p.azimuth_deg, az)) ? q : p, null);
        ref[id] = { az, cool: best ? best.cool : 1, heat: best ? best.heat : 1 };
      }
      const out = { ref, count: others.length, terrain: !!elev, at: new Date().toISOString().slice(0, 10) };
      try { localStorage.setItem(REF_KEY, JSON.stringify(out)); } catch (e) { }
      return out;
    })();
    refPromise.catch(() => { refPromise = null; });
    return refPromise;
  }

  const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
  const centroid = r => { const p = r.slice(0, -1); return [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length]; };

  // 입면별 보정 배수 = k(선택) ÷ k(1784, 방위가 가장 가까운 Radiance 입면). 0.2 ~ 2 로 제한
  function factors(sel, ref) {
    const out = {};
    for (const id in sel.k) {
      const s = sel.k[id];
      const r = Object.values(ref.ref).reduce((p, q) => angDiff(q.az, s.azimuth_deg) < angDiff(p.az, s.azimuth_deg) ? q : p);
      const f = (a, b) => Math.max(0.2, Math.min(2, b > 0.02 ? a / b : 1));
      out[id] = { cool: f(s.cool, r.cool), heat: f(s.heat, r.heat), k_cool: s.cool, k_heat: s.heat, ref_cool: r.cool, ref_heat: r.heat };
    }
    return out;
  }

  root.Shade = { forBuilding, reference, factors, _test: { scene, blocked, visibility, facadePoints } };
})(typeof window !== 'undefined' ? window : globalThis);
