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
  let skyDay = null, skyNight = null;
  let model = null, lastInput = null, lastTime = null, ready = false;
  let context = null, showCtx = true;   // 주변 건물 (브이월드 외곽선 · 층수)
  // 화면: exterior 외관 (마우스로 돌리기) · interior 실내 (창 쪽을 봄) · split 나란히 — 유니티 화면과 같은 버튼
  let icam = null, viewMode = 'exterior', cmpExt = null, cmpInt = null;
  let plinth = null, terrain = null, showTer = true, elevAt = null, terrToken = 0;   // 지형 (AWS Terrain Tiles)
  let glareOn = false, glareGrp = null, occ = null, glareLast = 0, glareTimer = 0, glareArgs = null;   // 빛반사 (유리 정반사)

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
    renderer.shadowMap.autoUpdate = false;   // 그림자는 해 · 날 · 건물이 바뀔 때만 다시 계산 (화면을 돌릴 때는 그대로)
    box.appendChild(renderer.domElement);
    scene = new THREE.Scene();
    // 하늘: 위는 맑은 파랑, 지평선 쪽은 밝은 안개색 (낮 · 밤 두 장). 먼 주변 건물은 같은 색 안개로 흐리게
    const sky = (top, mid, low) => { const c = document.createElement('canvas'); c.width = 2; c.height = 256; const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
      gr.addColorStop(0, top); gr.addColorStop(0.62, mid); gr.addColorStop(1, low); g.fillStyle = gr; g.fillRect(0, 0, 2, 256); const t = new THREE.CanvasTexture(c); return t; };
    skyDay = sky('#3FC3CB', '#4AD4D4', '#BFD6DA'); skyNight = sky('#142033', '#2A3A52', '#3A4658');
    scene.background = skyDay;
    scene.fog = new THREE.Fog('#BFD6DA', 700, 2600);   // 색은 Unity 화면과 맞춤 (청록 하늘 · 흰 건물 · 연두 땅)
    camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.5, 5000);
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.495;
    hemi = new THREE.HemisphereLight(0xFFFFFF, 0xC9D4C0, 0.7); scene.add(hemi);   // 하늘빛 · 땅 반사빛
    sun = new THREE.DirectionalLight(0xFFF9F0, 0.95);   // 살짝 따뜻한 햇빛
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005;
    scene.add(sun); scene.add(sun.target);
    ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshLambertMaterial({ color: '#899C80' }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    icam = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 5000);
    box.style.position = 'relative';
    cmpExt = makeCompass(); cmpInt = makeCompass();
    const ro = new ResizeObserver(resize); ro.observe(box); resize();
    ready = true;
    (function loop() { requestAnimationFrame(loop); if (!box.offsetParent) return; controls.update(); lod(); render(); })();   // Unity 를 보는 중(숨김)이면 쉬기
  }
  function shadowDirty() { if (renderer) renderer.shadowMap.needsUpdate = true; }
  function render() {
    const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
    if (viewMode === 'split') {
      renderer.setScissorTest(true);
      renderer.setViewport(0, 0, w / 2, h); renderer.setScissor(0, 0, w / 2, h); renderer.render(scene, camera);
      renderer.setViewport(w / 2, 0, w / 2, h); renderer.setScissor(w / 2, 0, w / 2, h); renderer.render(scene, icam);
      renderer.setScissorTest(false);
    } else {
      renderer.setViewport(0, 0, w, h);
      renderer.render(scene, viewMode === 'interior' ? icam : camera);
    }
    // 나침반: 보이는 화면마다 오른쪽 위. 빨간 바늘 = 북
    const ext = viewMode !== 'interior', inn = viewMode !== 'exterior' && model;
    setCompass(cmpExt, ext && model, camera, viewMode === 'split' ? w / 2 : w);
    setCompass(cmpInt, inn, icam, w);
  }
  function makeCompass() {
    const d = document.createElement('div');
    d.style.cssText = 'position:absolute;top:10px;width:56px;height:56px;pointer-events:none;display:none';
    d.innerHTML = '<svg viewBox="-50 -50 100 100" width="56" height="56"><circle r="46" fill="rgba(255,255,255,.85)" stroke="#283848" stroke-width="3"/>'
      + '<g class="rose"><path d="M-5 0 L0 -30 L5 0 Z" fill="#DC2E29"/><path d="M-5 0 L0 30 L5 0 Z" fill="#8C99A8"/>'
      + [['N', 0, '#DC2E29'], ['E', 90, '#283848'], ['S', 180, '#283848'], ['W', 270, '#283848']].map(([t, a, c]) => `<text x="${Math.round(Math.sin(a * RAD) * 34)}" y="${Math.round(-Math.cos(a * RAD) * 34) + 6}" text-anchor="middle" font-size="17" font-weight="700" fill="${c}" font-family="sans-serif">${t}</text>`).join('')
      + '</g></svg>';
    box.appendChild(d); return d;
  }
  function setCompass(d, on, cam, right) {
    if (!d) return;
    d.style.display = on ? '' : 'none'; if (!on) return;
    const f = new THREE.Vector3(); cam.getWorldDirection(f);
    const heading = Math.atan2(f.x, -f.z) / RAD;   // 0 = 북쪽을 봄 (x = 동, −z = 북)
    d.style.left = (right - 66) + 'px';
    d.querySelector('.rose').setAttribute('transform', `rotate(${-heading})`);
  }
  // 화면 바꾸기
  function setView(mode) {
    viewMode = mode === 'interior' || mode === 'split' ? mode : 'exterior';
    resize();
  }
  // 실내 카메라: 남서쪽에 가까운 루버 입면 가운데, 9층 (낮은 건물은 가운데 층) 안쪽 4 m 에서 창 쪽을 본다
  function placeInterior() {
    if (!model || !model.faces.length) return;
    const f = nearestFace(225, true);
    const floor = Math.min(9, Math.max(1, Math.round(model.floors / 2)), model.floors);
    const y = (floor - 1) * model.floorHeight + 1.5;
    const mE = (f.a[0] + f.b[0]) / 2, mN = (f.a[1] + f.b[1]) / 2;
    icam.position.set(mE - f.nE * 4, y, -(mN - f.nN * 4));
    icam.lookAt(mE + f.nE * 10, y - 0.8, -(mN + f.nN * 10));
    model.interiorFloor = floor;
  }
  function nearestFace(az, louvered) {
    const d = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
    const list = model.faces.filter(f => !louvered || f.louver);
    return (list.length ? list : model.faces).reduce((p, q) => d(q.az, az) < d(p.az, az) ? q : p);
  }
  // 입면 보기: 그 입면 바깥에서 비스듬히 (20°) 가까이. 'all' = 처음 시점
  function lookAtFacade(side) {
    if (!model) return;
    const az = { east: 90, south: 180, west: 270, north: 0 }[side];
    if (az === undefined) { controls.target.copy(model.home.target); camera.position.copy(model.home.pos); controls.update(); return; }
    // 그 방향 (±45°) 면 중 가장 긴 면. 꺾인 건물에서 작은 홈 면을 고르면 카메라가 건물 안에 들어가 버린다
    const d = (p, q) => Math.abs(((p - q + 540) % 360) - 180);
    const near = model.faces.filter(x => d(x.az, az) <= 45);
    const f = near.length ? near.reduce((p, q) => q.len > p.len ? q : p) : nearestFace(az, false);   // 루버가 없는 면 (북면 등) 도 그 방향 면을 본다
    const mE = (f.a[0] + f.b[0]) / 2, mN = (f.a[1] + f.b[1]) / 2, y = model.height * 0.5;
    const t = (f.az + 20) * RAD, dist = clearDist(mE, mN, Math.sin(t), Math.cos(t), Math.max(40, Math.min(90, f.len * 0.9)));
    controls.target.set(mE, y, -mN);
    camera.position.set(mE + Math.sin(t) * dist, y + 6, -(mN + Math.cos(t) * dist));
    controls.update();
  }
  // 카메라가 건물 밖에 있도록 거리를 늘린다: 건물 가운데에서 (가장 먼 꼭짓점 + 10 m) 보다 멀리
  function clearDist(mE, mN, dE, dN, dist) {
    const pts = model.faces.flatMap(x => [x.a, x.b]);
    const cE = pts.reduce((t, p) => t + p[0], 0) / pts.length, cN = pts.reduce((t, p) => t + p[1], 0) / pts.length;
    const R = Math.max(...pts.map(p => Math.hypot(p[0] - cE, p[1] - cN))) + 10;
    while (dist < 400 && Math.hypot(mE + dE * dist - cE, mN + dN * dist - cN) < R) dist += 5;
    return dist;
  }
  // 보고서 캡처: 입면 id 를 정면에서 가깝게 (건물 높이 절반, 입면 너비가 화면에 들어오는 거리)
  function lookAtFaceFront(id) {
    if (!model) return false;
    const f = model.faces.find(x => x.id === id); if (!f) return false;
    const mE = (f.a[0] + f.b[0]) / 2, mN = (f.a[1] + f.b[1]) / 2, y = model.height * 0.5;
    const dist = clearDist(mE, mN, f.nE, f.nN, Math.max(25, Math.min(140, f.len / 2 / (Math.tan(camera.fov * RAD / 2) * camera.aspect) * 1.15)));   // 입면 너비가 화면 가로에 꽉 차게, 건물 밖에서
    controls.target.set(mE, y, -mN);
    camera.position.set(mE + f.nE * dist, y + 4, -(mN + f.nN * dist));
    controls.update();
    return true;
  }
  // 보고서 캡처: 지금 상태를 그린 직후 바로 이미지로 (preserveDrawingBuffer 없이도 빈 이미지가 아님)
  function snapshot() {
    if (!renderer) return null;
    controls.update(); lod(); render();
    return renderer.domElement.toDataURL('image/png');
  }
  // 가까이 가면 날을 모두: 날 간격이 화면에서 5 px 이상이면 촘촘하게 (입면마다 따로)
  function lod() {
    if (!model || model.step === model.stepF) return;
    const k = renderer.domElement.clientHeight / (2 * Math.tan(camera.fov * RAD / 2));   // 1 m 가 거리 1 m 에서 몇 px
    const gap = model.spacing * model.stepF;
    for (const b of blades) {
      const d = Math.max(0.1, b.box.distanceToPoint(camera.position));
      const want = gap * k / d >= 5 ? b.pts.length : b.nCoarse;
      if (b.mesh.count !== want) { b.mesh.count = want; shadowDirty(); }
    }
  }
  function resize() {
    if (!renderer) return;
    // 2:1 (지도 · Unity 와 같은 비율)
    const w = box.clientWidth || 640, h = box.dataset.fill && box.clientHeight > 100 ? box.clientHeight : Math.round(w / 2);   // data-fill: 칸 높이 채우기 (v3)
    renderer.setSize(w, h);
    camera.aspect = (viewMode === 'split' ? w / 2 : w) / h; camera.updateProjectionMatrix();
    if (icam) { icam.aspect = (viewMode === 'split' ? w / 2 : w) / h; icam.updateProjectionMatrix(); }
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
    building = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#7F9DC0', roughness: 0.25, metalness: 0.1, emissive: 0x2A3A4E }));
    building.castShadow = true; building.receiveShadow = true; scene.add(building);
    // 층 구분선
    const lines = [];
    for (let f = 1; f < opt.floors; f++) {
      const y = f * opt.floorHeight;
      for (let i = 0; i < L.pts.length; i++) { const a = L.pts[i], b = L.pts[(i + 1) % L.pts.length]; lines.push(a[0], y, -a[1], b[0], y, -b[1]); }
    }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    slabs = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#E6EDF4', transparent: true, opacity: 0.8 })); scene.add(slabs);
    // 루버: 입면마다 InstancedMesh 하나
    const spacing = (opt.spacingMm || 350) / 1000, depth = (opt.depthMm || 300) / 1000;
    const louvered = opt.facades;   // 루버 없는 입면도 만들어 두고 숨긴다 (setLouvers 로 켜고 끔)
    const total = louvered.reduce((s, f) => s + f.width_m / spacing, 0);
    // 멀리서는 솎아 그림 (0.35 m 간격은 물결무늬(모아레)가 생겨 약 1 m 간격), 가까이 가면 날을 모두 그린다 (lod)
    // stepF = 가까이서 그리는 간격 배수 (날이 MAX_BLADES 보다 많을 때만 1 보다 큼), step = 멀리서 그리는 배수
    const stepF = Math.max(1, Math.ceil(total / MAX_BLADES));
    const step = Math.max(stepF, Math.round(Math.ceil(1.0 / spacing) / stepF) * stepF);
    const bladeMat = new THREE.MeshStandardMaterial({ color: '#E8ECEF', roughness: 0.35, metalness: 0.55 });
    for (const f of louvered) {
      const [a, b] = f.path.map(([lon, lat]) => [(lon - L.lon0) * L.mx, (lat - L.lat0) * L.my]);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const count = Math.max(1, Math.floor(len / (spacing * stepF)));
      const az = f.azimuth_deg * RAD;
      const nE = Math.sin(az), nN = Math.cos(az);               // 바깥 법선 (동, 북)
      const g = new THREE.BoxGeometry(BLADE_T, height, depth);   // x = 두께, z = 깊이
      const mesh = new THREE.InstancedMesh(g, bladeMat, count);
      mesh.castShadow = true; mesh.receiveShadow = true;
      // 솎아 그리는 날을 앞에 두고 나머지를 뒤에: mesh.count 만 바꿔 멀리 · 가까이를 전환
      const coarse = [], fine = [], r = step / stepF, off = BLADE_GAP + depth / 2;
      for (let i = 0; i < count; i++) {
        const k = (i + 0.5) / count, e = a[0] + (b[0] - a[0]) * k, n = a[1] + (b[1] - a[1]) * k;
        (i % r === 0 ? coarse : fine).push(new THREE.Vector3(e + nE * off, height / 2, -(n + nN * off)));
      }
      const pts = coarse.concat(fine);
      const bb = new THREE.Box3().setFromPoints(pts); bb.min.y = 0; bb.max.y = height;
      mesh.count = coarse.length;
      mesh.visible = !!f.louver;
      blades.push({ id: f.id, az: f.azimuth_deg, mesh, pts, nCoarse: coarse.length, box: bb });
      scene.add(mesh);
    }
    const faces = opt.facades.map(f => {
      const [a, b] = f.path.map(([lon, lat]) => [(lon - L.lon0) * L.mx, (lat - L.lat0) * L.my]);
      return { id: f.id, az: f.azimuth_deg, louver: f.louver, a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]), nE: Math.sin(f.azimuth_deg * RAD), nN: Math.cos(f.azimuth_deg * RAD) };
    });
    model = { height, step, stepF, spacing, depth, L, faces, floors: opt.floors, floorHeight: opt.floorHeight };
    // 카메라: 남서쪽 위 35° 에서 내려다보기 (Unity 화면처럼). 낮은 건물도 주변이 보이게 거리 최소 70 m
    const r = Math.max(...L.pts.map(p => Math.hypot(p[0], p[1]))) + height * 0.6;
    const dist = Math.max(r, height, 70) * 2.5, el = 35 * RAD;
    controls.target.set(0, height * 0.3, 0);
    camera.position.set(-dist * Math.cos(el) * 0.54, height * 0.3 + dist * Math.sin(el), dist * Math.cos(el) * 0.84);
    camera.far = r * 20; camera.updateProjectionMatrix();
    model.home = { target: controls.target.clone(), pos: camera.position.clone() };
    placeInterior();
    const sr = Math.max(r * 1.5, 160);   // 주변 건물 그림자가 들어오게
    sun.shadow.camera.left = sun.shadow.camera.bottom = -sr; sun.shadow.camera.right = sun.shadow.camera.top = sr;
    sun.shadow.camera.far = r * 6; sun.shadow.camera.updateProjectionMatrix();
    note('');
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
    const c0 = new THREE.Color('#899C80'), c1 = new THREE.Color('#7F9376'), c = new THREE.Color();
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
      plinth = new THREE.Mesh(pg, new THREE.MeshLambertMaterial({ color: '#D3D7DA' }));
      plinth.position.y = low - 0.3; plinth.castShadow = plinth.receiveShadow = true; plinth.visible = showTer; scene.add(plinth);
    }
    ground.position.y = showTer ? lo - 0.5 : 0;
    placeContext(); buildOcc(); bestHome();
    const hy = elevAt(model.home.pos.x, -model.home.pos.z) + 25;   // 처음 카메라가 언덕에 묻히지 않게
    if (model.home.pos.y < hy) { const atHome = camera.position.distanceTo(model.home.pos) < 0.5; model.home.pos.y = hy; if (atHome) camera.position.y = hy; }
    if (terrCb) terrCb('지형 높이 차 ' + Math.round(hi - lo) + ' m');
  }
  // 주변 건물을 땅 높이에 맞춰 올리거나 내린다
  function placeContext() {
    shadowDirty();
    if (!context) return;
    for (const m of context.children) {
      if (!(showTer && elevAt)) { m.position.y = 0; m.scale.y = 1; continue; }
      const top = elevAt(m.userData.c[0], m.userData.c[1]) + m.userData.h;
      const low = Math.min(...m.userData.pts.map(([e, n]) => elevAt(e, n))) - 0.5;
      m.position.y = low; m.scale.y = (top - low) / m.userData.h;
    }
  }
  function showTerrain(on) {
    showTer = on; if (terrain) terrain.visible = on; if (plinth) plinth.visible = on; shadowDirty();
    if (ground) ground.position.y = (on && model && model.terrainRange) ? model.terrainRange[0] - 0.5 : 0;
    placeContext();
  }
  // 주변 건물: list = VWorld.buildingsNear 결과. 층수가 없으면 3층, 층고 3.3 m 로 세운다
  function setContext(list, opt) {
    if (!ready || !model) return;
    if (context) { scene.remove(context); context.traverse(o => o.geometry && o.geometry.dispose()); context = null; }
    opt = opt || {};
    const L = model.L, fh = opt.floorHeight || 3.3, mat = new THREE.MeshLambertMaterial({ color: '#D9DDE0', emissive: 0x4A4E52 }), edgeMat = new THREE.LineBasicMaterial({ color: '#B8BEC4', transparent: true, opacity: 0.6 });
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
      const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true;
      // 모서리 선 (건축 모형처럼)
      m.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 30), edgeMat));
      m.userData.c = c; m.userData.pts = pts; m.userData.h = h; context.add(m); n++;
    }
    context.visible = showCtx; scene.add(context);
    placeContext(); buildOcc();
    bestHome();
    model.contextCount = n;
    return n;
  }
  // 처음 카메라 방향: 8 방향 × 내려다보는 각 (35 · 50 · 65°) 중 주변 건물에 가장 덜 가리는 쪽 (같으면 남남서 35°). 사용자가 카메라를 움직였으면 그대로
  function bestHome() {
    if (!model || !context || !model.home) return;
    const h = model.home, atHome = camera.position.distanceTo(h.pos) < 0.5;
    if (!h.base) { const off = h.pos.clone().sub(h.target); h.base = { d: off.length(), az: Math.atan2(off.x, off.z) }; }
    const aims = [h.target.clone()];
    for (const [e, n] of model.L.pts) for (const y of [1, model.height]) aims.push(new THREE.Vector3(e, y, -n));
    let best = null;
    for (const [j, elD] of [35, 50, 65].entries()) for (let k = 0; k < 8; k++) {
      const a = h.base.az + k * Math.PI / 4, el = elD * RAD, hor = h.base.d * Math.cos(el);
      const p = new THREE.Vector3(h.target.x + Math.sin(a) * hor, h.target.y + h.base.d * Math.sin(el), h.target.z + Math.cos(a) * hor);
      let hit = 0;   // 건물 가운데 · 모서리(위 · 아래)로 가는 선이 주변 건물을 지나는 횟수
      for (const t of aims) for (let i = 1; i <= 16; i++) {
        const q = t.clone().lerp(p, i / 16), e = q.x, n = -q.z;
        for (const m of context.children) { const top = m.position.y + m.userData.h * m.scale.y; if (top > q.y && inside(m.userData.pts, e, n)) { hit++; break; } }
      }
      hit /= aims.length;
      const score = hit + Math.min(k, 8 - k) * 0.3 + j * 1.2;   // 기본 방향 · 낮은 각에서 멀수록 조금 불리
      if (!best || score < best.score) best = { score, p };
    }
    h.pos.copy(best.p);
    if (atHome) { camera.position.copy(h.pos); controls.target.copy(h.target); controls.update(); }
  }
  function showContext(on) { showCtx = on; if (context) context.visible = on; shadowDirty(); redoGlare(); }
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
    blades = []; building = slabs = null; model = null; occ = null; clearGlare();
    if (context) { scene.remove(context); context.traverse(o => o.geometry && o.geometry.dispose()); context = null; }
  }

  // 날짜 · 시각에 맞춰 해와 날 각도 갱신. t = {y, m, d, hh, mm}
  // ov: 입면 id → 화면용 날 상태 (features.js 가 천천히 돌린 값). 없으면 규칙 값 그대로
  function update(input, t, ov) {
    lastInput = input; lastTime = t;
    if (!ready || !model || !window.LouverEngine) return;
    const st = window.LouverEngine.stateAt(input, t.y, t.m, t.d, t.hh, t.mm);
    // 해
    const alt = st.sun.alt * RAD, az = st.sun.az * RAD, R = model.height * 4 + 200;
    const dE = Math.cos(alt) * Math.sin(az), dN = Math.cos(alt) * Math.cos(az), dU = Math.sin(alt);
    sun.position.set(dE * R, Math.max(dU, 0.02) * R, -dN * R); sun.target.position.set(0, 0, 0);
    const day = st.sun.alt > 0;
    sun.intensity = day ? 0.3 + 0.65 * Math.min(1, Math.sin(alt) * 2) : 0;   // 밝은 면이 하얗게 날아가지 않게
    hemi.intensity = day ? 0.55 : 0.25;
    scene.background = day ? skyDay : skyNight; scene.fog.color.set(day ? '#BFD6DA' : '#2E3A4C');
    // 날: 규칙 각도 (엔진과 같은 정의). 입면 로컬 (ux, uy) = (side·sin a, cos a), 화면 아래 = 실내
    const o = new window.THREE.Object3D();
    for (const b of blades) {
      const f = (ov && ov[b.id]) || st.facades.find(x => x.id === b.id);
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
      b.angle = a; b.side = s;
    }
    glareArgs = { dE, dN, dU, day };
    shadowDirty();
    if (glareOn) glareSoon();
  }
  // 상자의 깊이 축(로컬 +z)을 수평 방향 (동 vE, 북 vN) 으로 돌리는 y 회전. three 좌표의 방향은 (x = vE, z = -vN)
  function yawFor(vE, vN) { return Math.atan2(vE, -vN); }

  // 입면별 루버 켜고 끄기: on = {입면 id: true/false}
  function setLouvers(on) { for (const b of blades) if (b.id in on) b.mesh.visible = !!on[b.id]; shadowDirty(); redoGlare(); }

  // ---- 빛반사: 유리를 평평한 거울로 보고, 입면에서 반사된 햇빛이 주변 건물 · 땅 어디에 닿는지 ----
  // 입면마다 점(가로 · 세로 최대 20 개)에서 반사 방향으로 2 m 씩 나아가 주변 건물(4 m 격자 높이) 이나 땅에 닿는 곳을 찾는다
  // 세기 = cos(입사각) × 유리 반사율 0.15 × 루버를 지나는 비율 (들어올 때 × 나갈 때, 날 깊이 · 간격 · 각도로 2D 계산)
  // 빠진 것: 날 자체의 반사, 여러 번 반사, 유리 종류별 반사율 (1784 는 Unity GlareSim 이 더 정밀)
  const OCC_C = 4, OCC_N = 260, GLASS_R = 0.15;
  function buildOcc() {
    occ = null;
    if (!context || !model) return;
    const top = new Float32Array(OCC_N * OCC_N).fill(-1e9), id = new Int32Array(OCC_N * OCC_N).fill(-1), h = OCC_N / 2;
    context.children.forEach((m, k) => {
      const P = m.userData.pts, t = m.position.y + m.userData.h * m.scale.y;
      let e0 = Infinity, e1 = -Infinity, n0 = Infinity, n1 = -Infinity;
      for (const [e, n] of P) { e0 = Math.min(e0, e); e1 = Math.max(e1, e); n0 = Math.min(n0, n); n1 = Math.max(n1, n); }
      for (let i = Math.max(0, Math.floor(e0 / OCC_C + h)); i <= Math.min(OCC_N - 1, Math.floor(e1 / OCC_C + h)); i++)
        for (let j = Math.max(0, Math.floor(n0 / OCC_C + h)); j <= Math.min(OCC_N - 1, Math.floor(n1 / OCC_C + h)); j++) {
          const ce = (i - h + 0.5) * OCC_C, cn = (j - h + 0.5) * OCC_C, q = j * OCC_N + i;
          if (t > top[q] && inside(P, ce, cn)) { top[q] = t; id[q] = k; }
        }
    });
    occ = { top, id, tops: context.children.map(m => m.position.y + m.userData.h * m.scale.y) };
    redoGlare();
  }
  function clearGlare() {
    if (glareGrp) { scene.remove(glareGrp); glareGrp.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); glareGrp = null; }
  }
  function redoGlare() { if (glareOn) glareSoon(); }
  // 재생 중에는 0.15초에 한 번만 계산
  function glareSoon() {
    const now = performance.now();
    if (now - glareLast > 150) { glareLast = now; computeGlare(); return; }
    clearTimeout(glareTimer); glareTimer = setTimeout(() => { glareLast = performance.now(); computeGlare(); }, 160);
  }
  // 닿는 곳 = 주변 건물 벽(또는 지붕)에 반사된 햇빛 한 칸 크기의 판. 약하면 노랑, 셀수록 주황
  const GL_WEAK = [1, 0.894, 0.361], GL_STRONG = [1, 0.478, 0.102];   // #FFE45C → #FF7A1A
  function computeGlare() {
    clearGlare();
    const info = { on: true, rays: 0, buildings: 0, cut: null, sunBehind: false, night: false };
    if (!model || !glareArgs) return report(info);
    const { dE, dN, dU, day } = glareArgs;
    if (!day || dU <= 0) { info.night = true; return report(info); }
    const H = model.height, D = model.depth, S = model.spacing, hh = OCC_N / 2;
    // 날 배열을 지나는 비율: 방향 phi (입면 법선에서 잰 수평 각), 날 방향 beta
    const tr = (phi, beta) => Math.max(0, 1 - D * Math.abs(Math.sin(phi - beta)) / (S * Math.max(0.05, Math.cos(phi))));
    const patches = [], ln = [], hitB = new Set();
    let sumBare = 0, sumLouv = 0, anyFace = false;
    for (const f of model.faces) {
      const cosI = dE * f.nE + dN * f.nN;          // 해가 이 입면 앞에 있는지 (수평 성분)
      if (cosI <= 0.03) continue;
      anyFace = true;
      const ph = f.az * RAD, tE = Math.cos(ph), tN = -Math.sin(ph);
      const phi = Math.atan2(dE * tE + dN * tN, cosI);
      const bl = blades.find(x => x.id === f.id), beta = bl ? -(bl.side || 1) * (bl.angle || 0) : 0;
      const T = bl && bl.mesh.visible ? tr(phi, beta) * tr(-phi, beta) : 1;
      const rE = -dE + 2 * cosI * f.nE, rN = -dN + 2 * cosI * f.nN, rU = -dU;   // 반사 방향 (아래로 나간다)
      const nx = Math.max(3, Math.min(20, Math.round(f.len / 3))), ny = Math.max(3, Math.min(20, Math.round(H / 3.3)));
      const pw = f.len / nx * 1.3, phh = H / ny * 1.3;   // 판 크기 = 보내는 쪽 한 칸 크기
      for (let ix = 0; ix < nx; ix++) for (let iy = 0; iy < ny; iy++) {
        const k = (ix + 0.5) / nx, y0 = (iy + 0.5) / ny * H;
        let e = f.a[0] + (f.b[0] - f.a[0]) * k + f.nE * 0.6, n = f.a[1] + (f.b[1] - f.a[1]) * k + f.nN * 0.6, y = y0;
        const e0 = e, n0 = n, I = cosI * GLASS_R;
        sumBare += I; sumLouv += I * T;
        if (T < 0.02 || !occ || !showCtx) continue;
        let hit = null;
        for (let step = 0; step < 300 && !hit; step++) {
          const pe = e, pn = n, py = y;
          e += rE * 2; n += rN * 2; y += rU * 2;
          if (y <= (showTer && elevAt ? elevAt(e, n) : 0)) break;   // 땅에 닿으면 끝 (땅은 칠하지 않음)
          const i = Math.floor(e / OCC_C + hh), j = Math.floor(n / OCC_C + hh);
          if (i < 0 || j < 0 || i >= OCC_N || j >= OCC_N) break;
          const q = j * OCC_N + i;
          if (occ.top[q] <= y) continue;
          // 그 건물 외곽선과 이번 2 m 구간이 만나는 곳 = 벽에 닿은 곳
          const kb = occ.id[q], m = context.children[kb], P = m.userData.pts, top = occ.tops[kb];
          let tb = Infinity, ed = null;
          for (let u = 0; u < P.length; u++) {
            const A = P[u], B = P[(u + 1) % P.length];
            const sx = e - pe, sy = n - pn, ex = B[0] - A[0], ey = B[1] - A[1], den = sx * ey - sy * ex;
            if (Math.abs(den) < 1e-9) continue;
            const t = ((A[0] - pe) * ey - (A[1] - pn) * ex) / den, w = ((A[0] - pe) * sy - (A[1] - pn) * sx) / den;
            if (t >= 0 && t <= 1 && w >= 0 && w <= 1 && t < tb) { tb = t; ed = [ex, ey]; }
          }
          const yw = ed ? py + (y - py) * tb : Infinity;
          if (ed && yw <= top) hit = { e: pe + (e - pe) * tb, n: pn + (n - pn) * tb, y: yw, wall: ed, k: kb };
          else { const t = py > top ? (py - top) / (py - y) : 0; hit = { e: pe + (e - pe) * t, n: pn + (n - pn) * t, y: top, wall: null, k: kb }; }
        }
        if (!hit) continue;
        info.rays++; hitB.add(hit.k);
        patches.push({ h: hit, v: Math.min(1, T * cosI), w: pw, hgt: phh, r: [rE, rU, -rN] });
        if ((ix + iy) % 3 === 0) ln.push(e0, y0, -n0, hit.e, hit.y, -hit.n);
      }
    }
    info.buildings = hitB.size;
    info.sunBehind = !anyFace;
    info.cut = sumBare > 0 ? 1 - sumLouv / sumBare : null;
    if (patches.length) {
      glareGrp = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, patches.length);
      const o = new THREE.Object3D(), c = new THREE.Color();
      patches.forEach((p, i) => {
        const { h } = p, rl = Math.hypot(...p.r);
        o.position.set(h.e - p.r[0] / rl * 0.2, h.y - p.r[1] / rl * 0.2, -h.n - p.r[2] / rl * 0.2);   // 벽에서 살짝 띄움
        o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1);
        if (h.wall) { o.lookAt(o.position.x - h.wall[1], o.position.y, o.position.z - h.wall[0]); o.scale.set(p.w, p.hgt, 1); }
        else { o.rotation.x = -Math.PI / 2; o.scale.set(p.w, p.w, 1); }
        o.updateMatrix(); im.setMatrixAt(i, o.matrix);
        c.setRGB(GL_WEAK[0] + (GL_STRONG[0] - GL_WEAK[0]) * p.v, GL_WEAK[1] + (GL_STRONG[1] - GL_WEAK[1]) * p.v, GL_WEAK[2] + (GL_STRONG[2] - GL_WEAK[2]) * p.v);
        im.setColorAt(i, c);
      });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      glareGrp.add(im);
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(ln, 3));
      glareGrp.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#FFD24D', transparent: true, opacity: 0.25, depthWrite: false })));
      scene.add(glareGrp);
    }
    report(info);
  }
  function report(info) { if (window.Model3D && window.Model3D.onGlare) window.Model3D.onGlare(info); }
  function setGlare(on) {
    glareOn = !!on;
    if (!glareOn) { clearGlare(); clearTimeout(glareTimer); report({ on: false }); return; }
    computeGlare();
  }
  window.Model3D = { setGlare, onGlare: null, setLouvers, setBuilding, setContext, showContext, showTerrain, update, setView, lookAtFacade, lookAtFaceFront, snapshot, get hasModel() { return !!model; } };
})();
