/*
 * 선택한 건물 3D 시뮬레이션 (three.js)
 * - 브이월드 외곽선(ring, 경위도) × 층수 × 층고로 건물을 세우고
 * - 루버를 다는 입면마다 수직 날(간격 = 날 간격)을 붙여
 * - 하루 재생 날짜 · 시각의 해 위치와 규칙대로 날을 돌린다 (엔진 stateAt 과 같은 각도)
 * 좌표: x = 동, z = 남, y = 위 (m). 날 0° = 유리에 수직
 */
(function () {
  'use strict';
  const RAD = Math.PI / 180;
  const BLADE_T = 0.04;        // 날 두께 (m)
  const BLADE_GAP = 0.15;      // 유리와 날 사이 (m)
  const MAX_BLADES = 6000;     // 너무 많으면 간격을 넓혀 그린다 (보기용)
  let THREE, renderer, scene, camera, controls, sun, hemi, ground, building, slabs, blades = [], box, msg;
  let model = null, lastInput = null, lastTime = null, ready = false;
  let context = null, showCtx = true;   // 주변 건물 (브이월드 외곽선 · 층수)
  let plinth = null, terrain = null, showTer = true, elevAt = null, terrToken = 0;   // 지형 (AWS Terrain Tiles)

  function el(id) { return document.getElementById(id); }
  function note(t) { if (msg) msg.textContent = t; }

  function init() {
    THREE = window.THREE;
    box = el('model3d'); msg = el('model3dMsg');
    if (!THREE || !box) { if (msg) msg.textContent = '3D 라이브러리를 불러오지 못했습니다 (인터넷 연결 확인).'; return; }
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    box.appendChild(renderer.domElement);
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#DCE8F5');
    camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.5, 5000);
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.495;
    hemi = new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.55); scene.add(hemi);
    sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005;
    scene.add(sun); scene.add(sun.target);
    ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshLambertMaterial({ color: '#E9ECEF' }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    const ro = new ResizeObserver(resize); ro.observe(box); resize();
    ready = true;
    (function loop() { requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); })();
  }
  function resize() {
    if (!renderer) return;
    const w = box.clientWidth || 640, h = Math.round(w * 9 / 16);
    renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  // 경위도 ring → 평면 (m), 반시계 방향, 마지막 점 중복 제거
  function toLocal(ring) {
    const n = ring.length;
    const lat0 = ring.reduce((s, p) => s + p[1], 0) / n, lon0 = ring.reduce((s, p) => s + p[0], 0) / n;
    const mx = 111320 * Math.cos(lat0 * RAD), my = 110540;
    let pts = ring.map(([lon, lat]) => [(lon - lon0) * mx, (lat - lat0) * my]); // [동, 북]
    if (pts.length > 1 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1]) pts = pts.slice(0, -1);
    return { pts, lon0, lat0, mx, my };
  }

  // 건물 · 루버 만들기. facades: VWorld.facadesFromRing 결과 (path = 경위도 두 점)
  function setBuilding(opt) {
    if (!ready) init();
    if (!ready) return;
    clear();
    const L = toLocal(opt.ring);
    const height = opt.floors * opt.floorHeight;
    // 건물 덩어리 (유리 느낌)
    const shape = new THREE.Shape(L.pts.map(([e, n]) => new THREE.Vector2(e, n)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2); // shape 의 y(북) → -z, 돌출 방향 → +y
    building = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#3F6F9F', roughness: 0.2, metalness: 0.3 }));
    building.castShadow = true; building.receiveShadow = true; scene.add(building);
    // 층 구분선
    const lines = [];
    for (let f = 1; f < opt.floors; f++) {
      const y = f * opt.floorHeight;
      for (let i = 0; i < L.pts.length; i++) { const a = L.pts[i], b = L.pts[(i + 1) % L.pts.length]; lines.push(a[0], y, -a[1], b[0], y, -b[1]); }
    }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    slabs = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#C9D6E3', transparent: true, opacity: 0.7 })); scene.add(slabs);
    // 루버: 입면마다 InstancedMesh 하나
    const spacing = (opt.spacingMm || 350) / 1000, depth = (opt.depthMm || 300) / 1000;
    const louvered = opt.facades.filter(f => f.louver);
    const total = louvered.reduce((s, f) => s + f.width_m / spacing, 0);
    // 보기용으로 솎아 그림: 멀리서 0.35 m 간격은 물결무늬(모아레)가 생겨 약 1 m 간격으로 (계산은 실제 간격)
    const step = Math.max(Math.ceil(1.0 / spacing), Math.ceil(total / MAX_BLADES));
    const bladeMat = new THREE.MeshStandardMaterial({ color: '#E3E9F0', roughness: 0.5, metalness: 0.2 });
    for (const f of louvered) {
      const [a, b] = f.path.map(([lon, lat]) => [(lon - L.lon0) * L.mx, (lat - L.lat0) * L.my]);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const count = Math.max(1, Math.floor(len / (spacing * step)));
      const az = f.azimuth_deg * RAD;
      const nE = Math.sin(az), nN = Math.cos(az);               // 바깥 법선 (동, 북)
      const g = new THREE.BoxGeometry(BLADE_T, height, depth);   // x = 두께, z = 깊이
      const mesh = new THREE.InstancedMesh(g, bladeMat, count);
      mesh.castShadow = true; mesh.receiveShadow = true;
      const pts = [];
      for (let i = 0; i < count; i++) {
        const k = (i + 0.5) / count, e = a[0] + (b[0] - a[0]) * k, n = a[1] + (b[1] - a[1]) * k;
        const off = BLADE_GAP + depth / 2;
        pts.push(new THREE.Vector3(e + nE * off, height / 2, -(n + nN * off)));
      }
      blades.push({ id: f.id, az: f.azimuth_deg, mesh, pts });
      scene.add(mesh);
    }
    model = { height, step, spacing, L };
    // 카메라: 남서쪽 위에서 건물 전체
    const r = Math.max(...L.pts.map(p => Math.hypot(p[0], p[1]))) + height * 0.6;
    const dist = Math.max(r, height) * 1.9;
    controls.target.set(0, height * 0.45, 0);
    camera.position.set(-dist * 0.55, height * 0.55 + 10, dist * 0.85);
    camera.far = r * 20; camera.updateProjectionMatrix();
    const sr = Math.max(r * 1.5, 160);   // 주변 건물 그림자가 들어오게
    sun.shadow.camera.left = sun.shadow.camera.bottom = -sr; sun.shadow.camera.right = sun.shadow.camera.top = sr;
    sun.shadow.camera.far = r * 6; sun.shadow.camera.updateProjectionMatrix();
    note(`${opt.name || '선택한 건물'} · 지상 ${opt.floors}층 · 높이 ${height.toFixed(0)} m · 루버 면 ${louvered.length}개` + (step > 1 ? ` · 보기용으로 날 ${step}개 중 1개만 그림 (계산은 간격 ${Math.round(spacing * 1000)} mm)` : ''));
    if (lastInput && lastTime) update(lastInput, lastTime);
    loadTerrain().catch(e => { console.warn(e); if (opt.onTerrain) opt.onTerrain('지형을 불러오지 못했습니다'); });
    terrCb = opt.onTerrain || null;
  }
  let terrCb = null;

  // ---- 지형: AWS Terrain Tiles (terrarium PNG, 고도 = R × 256 + G + B / 256 − 32768 m, 줌 15 ≈ 4.8 m/px) ----
  const TZ = 15, TR = 450, TN = 91;   // 줌, 반경(m), 한 변 격자 점 수
  function tileXY(lon, lat, z) {
    const n = 2 ** z, lr = lat * RAD;
    return [(lon + 180) / 360 * n, (1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2 * n];
  }
  function loadImg(url) {
    return new Promise((ok, no) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => ok(im); im.onerror = () => no(new Error('지형 타일 ' + url)); im.src = url; });
  }
  async function loadTerrain() {
    if (!model) return;
    const tok = ++terrToken, L = model.L;
    const a = tileXY(L.lon0 - TR / L.mx, L.lat0 + TR / L.my, TZ), b = tileXY(L.lon0 + TR / L.mx, L.lat0 - TR / L.my, TZ);
    const x0 = Math.floor(a[0]), x1 = Math.floor(b[0]), y0 = Math.floor(a[1]), y1 = Math.floor(b[1]);
    const cv = document.createElement('canvas'); cv.width = (x1 - x0 + 1) * 256; cv.height = (y1 - y0 + 1) * 256;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    const jobs = [];
    for (let tx = x0; tx <= x1; tx++) for (let ty = y0; ty <= y1; ty++)
      jobs.push(loadImg('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/' + TZ + '/' + tx + '/' + ty + '.png').then(im => cx.drawImage(im, (tx - x0) * 256, (ty - y0) * 256)));
    await Promise.all(jobs);
    if (tok !== terrToken || !model) return;
    const W = cv.width, H = cv.height, px = cx.getImageData(0, 0, W, H).data;
    const h = (ix, iy) => { ix = Math.max(0, Math.min(W - 1, ix)); iy = Math.max(0, Math.min(H - 1, iy)); const k = (iy * W + ix) * 4; return px[k] * 256 + px[k + 1] + px[k + 2] / 256 - 32768; };
    const sample = (lon, lat) => {
      const [fx, fy] = tileXY(lon, lat, TZ), x = (fx - x0) * 256 - 0.5, y = (fy - y0) * 256 - 0.5;
      const ix = Math.floor(x), iy = Math.floor(y), u = x - ix, v = y - iy;
      return h(ix, iy) * (1 - u) * (1 - v) + h(ix + 1, iy) * u * (1 - v) + h(ix, iy + 1) * (1 - u) * v + h(ix + 1, iy + 1) * u * v;
    };
    const base = sample(L.lon0, L.lat0);   // 고른 건물 중심의 땅 높이 = 0
    elevAt = (e, n) => sample(L.lon0 + e / L.mx, L.lat0 + n / L.my) - base;
    const g = new THREE.PlaneGeometry(2 * TR, 2 * TR, TN - 1, TN - 1);
    g.rotateX(-Math.PI / 2);   // (x, y) → (x, 0, −y): 북 = −z
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
    let lo = Infinity, hi = -Infinity; const ys = [];
    for (let i = 0; i < pos.count; i++) { const y = elevAt(pos.getX(i), -pos.getZ(i)); ys.push(y); lo = Math.min(lo, y); hi = Math.max(hi, y); }
    const c0 = new THREE.Color('#9AAE86'), c1 = new THREE.Color('#3F6531'), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) { pos.setY(i, ys[i]); c.copy(c0).lerp(c1, hi - lo > 1 ? (ys[i] - lo) / (hi - lo) : 0); col.set([c.r, c.g, c.b], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
    terrain = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
    terrain.receiveShadow = true; terrain.castShadow = true; terrain.visible = showTer; scene.add(terrain);
    model.terrainRange = [lo, hi];
    // 비탈에서 건물이 뜨지 않게: 외곽선을 따라 (3 m 간격) 가장 낮은 땅까지 기단을 채운다
    let low = 0;
    const P = L.pts;
    for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 3));
      for (let j = 0; j < n; j++) low = Math.min(low, elevAt(a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n)); }
    if (low < -0.2) {
      const pg = new THREE.ExtrudeGeometry(new THREE.Shape(P.map(([e, n]) => new THREE.Vector2(e, n))), { depth: -low + 0.3, bevelEnabled: false });
      pg.rotateX(-Math.PI / 2);
      plinth = new THREE.Mesh(pg, new THREE.MeshLambertMaterial({ color: '#9AA3AD' }));
      plinth.position.y = low - 0.3; plinth.castShadow = plinth.receiveShadow = true; plinth.visible = showTer; scene.add(plinth);
    }
    ground.position.y = showTer ? lo - 0.5 : 0;
    placeContext();
    if (terrCb) terrCb('지형 높이 차 ' + Math.round(hi - lo) + ' m');
  }
  // 주변 건물을 땅 높이에 맞춰 올리거나 내린다
  function placeContext() {
    if (!context) return;
    for (const m of context.children) {
      if (!(showTer && elevAt)) { m.position.y = 0; m.scale.y = 1; continue; }
      const top = elevAt(m.userData.c[0], m.userData.c[1]) + m.userData.h;
      const low = Math.min(...m.userData.pts.map(([e, n]) => elevAt(e, n))) - 0.5;
      m.position.y = low; m.scale.y = (top - low) / m.userData.h;
    }
  }
  function showTerrain(on) {
    showTer = on; if (terrain) terrain.visible = on; if (plinth) plinth.visible = on;
    if (ground) ground.position.y = (on && model && model.terrainRange) ? model.terrainRange[0] - 0.5 : 0;
    placeContext();
  }
  // 주변 건물: list = VWorld.buildingsNear 결과. 층수가 없으면 3층, 층고 3.3 m 로 세운다
  function setContext(list, opt) {
    if (!ready || !model) return;
    if (context) { scene.remove(context); context.traverse(o => o.geometry && o.geometry.dispose()); context = null; }
    opt = opt || {};
    const L = model.L, fh = opt.floorHeight || 3.3, mat = new THREE.MeshLambertMaterial({ color: '#C9D1DA' });
    context = new THREE.Group();
    let n = 0;
    for (const b of list) {
      let pts = b.ring.map(([lon, lat]) => [(lon - L.lon0) * L.mx, (lat - L.lat0) * L.my]);
      if (pts.length > 1 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1]) pts = pts.slice(0, -1);
      if (pts.length < 3) continue;
      const c = pts.reduce((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length], [0, 0]);
      if (inside(model.L.pts, c[0], c[1])) continue;   // 고른 건물과 겹치면 빼기
      const h = (b.floors || 3) * fh;
      const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([e, nn]) => new THREE.Vector2(e, nn))), { depth: h, bevelEnabled: false });
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; m.userData.c = c; m.userData.pts = pts; m.userData.h = h; context.add(m); n++;
    }
    context.visible = showCtx; scene.add(context);
    placeContext();
    model.contextCount = n;
    return n;
  }
  function showContext(on) { showCtx = on; if (context) context.visible = on; }
  function inside(pts, x, y) {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }

  function clear() {
    terrToken++; elevAt = null;
    if (terrain) { scene.remove(terrain); terrain.geometry.dispose(); terrain = null; }
    if (plinth) { scene.remove(plinth); plinth.geometry.dispose(); plinth = null; }
    if (ground) ground.position.y = 0;
    for (const o of [building, slabs]) if (o) { scene.remove(o); o.geometry.dispose(); }
    for (const b of blades) { scene.remove(b.mesh); b.mesh.geometry.dispose(); }
    blades = []; building = slabs = null; model = null;
    if (context) { scene.remove(context); context.traverse(o => o.geometry && o.geometry.dispose()); context = null; }
  }

  // 날짜 · 시각에 맞춰 해와 날 각도 갱신. t = {y, m, d, hh, mm}
  function update(input, t) {
    lastInput = input; lastTime = t;
    if (!ready || !model || !window.LouverEngine) return;
    const st = window.LouverEngine.stateAt(input, t.y, t.m, t.d, t.hh, t.mm);
    // 해
    const alt = st.sun.alt * RAD, az = st.sun.az * RAD, R = model.height * 4 + 200;
    const dE = Math.cos(alt) * Math.sin(az), dN = Math.cos(alt) * Math.cos(az), dU = Math.sin(alt);
    sun.position.set(dE * R, Math.max(dU, 0.02) * R, -dN * R); sun.target.position.set(0, 0, 0);
    const day = st.sun.alt > 0;
    sun.intensity = day ? 0.4 + 0.9 * Math.min(1, Math.sin(alt) * 2) : 0;
    hemi.intensity = day ? 0.55 : 0.25;
    scene.background.set(day ? '#DCE8F5' : '#2A3440');
    // 날: 규칙 각도 (엔진과 같은 정의). 입면 로컬 (ux, uy) = (side·sin a, cos a), 화면 아래 = 실내
    const o = new window.THREE.Object3D();
    for (const b of blades) {
      const f = st.facades.find(x => x.id === b.id);
      const s = f && f.side ? f.side : 1, a = (f && f.angle ? f.angle : 0) * RAD;
      const ph = b.az * RAD;
      const tE = Math.cos(ph), tN = -Math.sin(ph);    // 입면을 따라가는 방향 (방위가 커지는 쪽)
      const nE = Math.sin(ph), nN = Math.cos(ph);     // 바깥 법선
      const ux = s * Math.sin(a), uy = Math.cos(a);
      const vE = ux * tE - uy * nE, vN = ux * tN - uy * nN; // 날 깊이 방향
      const yaw = yawFor(vE, vN);
      for (let i = 0; i < b.pts.length; i++) {
        o.position.copy(b.pts[i]); o.rotation.set(0, yaw, 0);
        o.updateMatrix(); b.mesh.setMatrixAt(i, o.matrix);
      }
      b.mesh.instanceMatrix.needsUpdate = true;
    }
  }
  // 상자의 깊이 축(로컬 +z)을 수평 방향 (동 vE, 북 vN) 으로 돌리는 y 회전. three 좌표의 방향은 (x = vE, z = -vN)
  function yawFor(vE, vN) { return Math.atan2(vE, -vN); }

  window.Model3D = { setBuilding, setContext, showContext, showTerrain, update, get hasModel() { return !!model; } };
})();
