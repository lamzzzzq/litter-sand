/* 猫砂盆 · 砂的物理 v0.1 — Three.js 高度场位移网格
   第一阶段只做砂：真 3D 网格 + 阴影、休止角坍落、软笔刷（指压/倒砂/抹平）、颗粒法线。铲子等砂过关后再加。 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ---------- 参数 ----------
const N = 192;                 // 高度场分辨率（N×N 顶点）[调]
const TRAY_W = 44, TRAY_D = 36; // 盆内尺寸（世界单位 ≈ cm）
const WALL = 1.6, WALL_H = 9;
const BASE_H = 5.5;            // 初始砂深 [调]
const CELL = TRAY_W / (N - 1);
const LITTERS = {
  bentonite: { name: '膨润土', color: 0xd4c39c, talus: 34, grain: 1.0, rough: 0.95, slumpK: 0.35, leak: 1.3, clumping: true,  crumble: 0,   flushable: false, bounce: 0,    pSize: 0.34, wet: [0.72, 0.66, 0.58], noFlush: '膨润土遇水膨胀，马桶堵了' },
  tofu:      { name: '豆腐砂', color: 0xeee5cc, talus: 38, grain: 1.6, rough: 0.9,  slumpK: 0.25, leak: 1.1, clumping: true,  crumble: 0.6, flushable: true,  bounce: 0.1,  pSize: 0.5,  wet: [0.8, 0.74, 0.62], noFlush: '' },
  crystal:   { name: '水晶砂', color: 0xe4eef2, talus: 30, grain: 2.2, rough: 0.35, slumpK: 0.45, leak: 1.5, clumping: false, crumble: 0,   flushable: false, bounce: 0.55, pSize: 0.7,  wet: [0.98, 0.9, 0.55], noFlush: '水晶砂是硅胶，不溶，只能扔垃圾桶' },
  pine:      { name: '松木砂', color: 0xc8a672, talus: 36, grain: 1.8, rough: 0.85, slumpK: 0.3,  leak: 0.9, clumping: false, crumble: 0,   flushable: false, bounce: 0.25, pSize: 0.6,  wet: [0.62, 0.5, 0.36], noFlush: '松木砂不能冲，可以堆肥' },
};
let litter = LITTERS.bentonite;
let tool = 'scoop', brushSize = 3;

// ---------- 渲染 ----------
const cv = document.getElementById('cv');
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x2a2118);
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 500);
camera.position.set(14, 74, 56);
const controls = new OrbitControls(camera, cv);
controls.target.set(12, 3, 0); controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minDistance = 25; controls.maxDistance = 160; controls.maxPolarAngle = Math.PI * 0.42; controls.minPolarAngle = 0.15;
controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
controls.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_ROTATE };
controls.update();

// 光：主光从左上斜射，阴影是「体积感」的一半
const sun = new THREE.DirectionalLight(0xfff2dc, 2.6); sun.position.set(-30, 50, 20); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -30; sun.shadow.camera.right = 30; sun.shadow.camera.top = 30; sun.shadow.camera.bottom = -30; sun.shadow.camera.near = 10; sun.shadow.camera.far = 120; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xfff5e6, 0x4a3a2a, 0.9));
const fill = new THREE.DirectionalLight(0xcfe3ff, 0.5); fill.position.set(30, 30, -20); scene.add(fill);

// 猫砂盆：圆角矩形塑料盆，壁略外倾，顶上一圈翻边。ExtrudeGeometry 带倒角
function roundRectShape(w, d, r) { const sh = new THREE.Shape(); sh.moveTo(-w / 2 + r, -d / 2); sh.lineTo(w / 2 - r, -d / 2); sh.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r); sh.lineTo(w / 2, d / 2 - r); sh.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2); sh.lineTo(-w / 2 + r, d / 2); sh.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r); sh.lineTo(-w / 2, -d / 2 + r); sh.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2); return sh; }
const trayGroup = new THREE.Group(); scene.add(trayGroup); /* 盆+砂+屎都挂在这里，端盆时整体转 */
const plastic = new THREE.MeshPhysicalMaterial({ color: 0x9fb3c8, roughness: 0.45, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.4 });
const plasticIn = new THREE.MeshPhysicalMaterial({ color: 0x8ea3b8, roughness: 0.5, metalness: 0, clearcoat: 0.2, side: THREE.BackSide });
{
  const R = 5;
  const outer = roundRectShape(TRAY_W + WALL * 2 + 2, TRAY_D + WALL * 2 + 2, R + WALL);
  const holePath = roundRectShape(TRAY_W + 0.4, TRAY_D + 0.4, R);
  outer.holes.push(new THREE.Path(holePath.getPoints(24)));
  const wall = new THREE.Mesh(new THREE.ExtrudeGeometry(outer, { depth: WALL_H, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.5, bevelSegments: 3, curveSegments: 24 }), plastic);
  wall.rotation.x = -Math.PI / 2; wall.position.y = 0; wall.castShadow = true; wall.receiveShadow = true; trayGroup.add(wall);
  // 翻边
  const lipOuter = roundRectShape(TRAY_W + WALL * 2 + 6, TRAY_D + WALL * 2 + 6, R + WALL + 2);
  lipOuter.holes.push(new THREE.Path(roundRectShape(TRAY_W + 0.4, TRAY_D + 0.4, R).getPoints(24)));
  const lip = new THREE.Mesh(new THREE.ExtrudeGeometry(lipOuter, { depth: 1.1, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.35, bevelSegments: 2, curveSegments: 24 }), plastic);
  lip.rotation.x = -Math.PI / 2; lip.position.y = WALL_H - 0.2; lip.castShadow = true; lip.receiveShadow = true; trayGroup.add(lip);
  // 盆底
  const floorM = new THREE.Mesh(new THREE.ExtrudeGeometry(roundRectShape(TRAY_W + WALL * 2 + 2, TRAY_D + WALL * 2 + 2, R + WALL), { depth: 1.2, bevelEnabled: false }), plastic);
  floorM.rotation.x = -Math.PI / 2; floorM.position.y = -1.2; floorM.receiveShadow = true; trayGroup.add(floorM);
  // 内壁（反面，压暗）
  const inner = new THREE.Mesh(new THREE.ExtrudeGeometry(roundRectShape(TRAY_W + 0.4, TRAY_D + 0.4, R), { depth: WALL_H, bevelEnabled: false, curveSegments: 24 }), plasticIn);
  inner.rotation.x = -Math.PI / 2; inner.receiveShadow = true; trayGroup.add(inner);
}
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x3b3128, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -1; ground.receiveShadow = true; scene.add(ground);

// ---------- 高度场 ----------
const h = new Float32Array(N * N), tmp = new Float32Array(N * N), jit = new Float32Array(N * N), bias = new Float32Array(N * N); /* bias：端盆倾斜带来的势能 */
const TILT = { x: 0, z: 0, tx: 0, tz: 0 };
function updateBias() { const gx = Math.tan(TILT.z), gz = -Math.tan(TILT.x); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const wx = -TRAY_W / 2 + x * CELL; const wz = (row0z < 0 ? -TRAY_D / 2 + y * CELL : TRAY_D / 2 - y * CELL); bias[gi(x, y)] = wx * gx + wz * gz; } }
const gi = (ix, iy) => iy * N + ix;
function resetSand() { for (let i = 0; i < h.length; i++) { h[i] = BASE_H + (Math.random() - 0.5) * 0.12; jit[i] = 0.9 + 0.2 * Math.random(); } if (typeof clearClumps === 'function') clearClumps(); dirty = true; }

// 颗粒法线贴图：噪声高度 → 法线，按砂种粗细缩放
function grainNormalTexture(scale) {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  const hh = new Float32Array(S * S);
  for (let i = 0; i < hh.length; i++) hh[i] = Math.random();
  // 两次盒式模糊做出颗粒团
  const blur = (src) => { const out = new Float32Array(S * S); for (let y = 0; y < S; y++) for (let xx = 0; xx < S; xx++) { let s = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += src[((y + dy + S) % S) * S + (xx + dx + S) % S]; out[y * S + xx] = s / 9; } return out; };
  let g = blur(hh); if (scale < 1.5) g = blur(g);
  const img = x.createImageData(S, S); const d = img.data, k = 2.2 * scale;
  for (let y = 0; y < S; y++) for (let xx = 0; xx < S; xx++) {
    const l = g[y * S + (xx - 1 + S) % S], r = g[y * S + (xx + 1) % S], u = g[((y - 1 + S) % S) * S + xx], dn = g[((y + 1) % S) * S + xx];
    let nx = (l - r) * k, ny = (u - dn) * k, nz = 1; const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    const i = (y * S + xx) * 4; d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 8); return t;
}
const sandGeo = new THREE.PlaneGeometry(TRAY_W, TRAY_D, N - 1, N - 1); sandGeo.rotateX(-Math.PI / 2);
const pos = sandGeo.attributes.position;
// 行方向：PlaneGeometry 旋转后第 0 行的 z 是 -D/2 还是 +D/2，运行时读一次
const row0z = pos.getZ(0);
const sandMat = new THREE.MeshStandardMaterial({ color: litter.color, roughness: litter.rough, metalness: 0, normalMap: grainNormalTexture(litter.grain), normalScale: new THREE.Vector2(0.6, 0.6), vertexColors: true });
sandGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * N * 3).fill(1), 3));
const sand = new THREE.Mesh(sandGeo, sandMat); sand.castShadow = true; sand.receiveShadow = true; trayGroup.add(sand);
let dirty = true;

// ---------- 屎的种类 × 猫的习惯 ----------
// 每种：形状、颜色、埋不埋（埋=砂面在它上面隆成壳，铲到壳才露）、尿团没有屎只有湿砂团、稀屎留污渍、有虫可见虫
const POOP_TYPES = {
  normal:   { name: '正常',     buried: true,  color: 0x5a3418, r: [1.6, 2.6], shape: 'swirl' },
  exposed:  { name: '没埋',     buried: false, color: 0x5a3418, r: [1.6, 2.4], shape: 'swirl' },
  soft:     { name: '稀屎',     buried: false, color: 0x7a4a22, r: [2.2, 3.2], shape: 'splat', stain: 0.8, gloss: true },
  worms:    { name: '有虫',     buried: false, color: 0x5a3418, r: [1.8, 2.6], shape: 'swirl', worms: true },
  black:    { name: '发黑',     buried: true,  color: 0x241611, r: [1.5, 2.3], shape: 'swirl' },
  green:    { name: '发绿',     buried: true,  color: 0x4f5a2a, r: [1.5, 2.3], shape: 'swirl' },
  urine:    { name: '尿团',     buried: true,  color: null,     r: [2.6, 3.6], shape: 'none', stain: 0.55 },
};
// 猫：习惯 = 各种屎的权重 + 埋的深浅
const CATS = {
  granny: { name: '阿婆（18 岁狸花）', w: { normal: 3, urine: 4, exposed: 2, soft: 1 }, depth: [0.2, 0.5] },
  orange: { name: '小橘（贪吃）',       w: { normal: 3, soft: 3, urine: 2, black: 0.5 }, depth: [0.3, 0.8] },
  coal:   { name: '煤球（洁癖）',       w: { normal: 5, urine: 3 }, depth: [0.7, 1.2] },
  kitten: { name: '幼猫',               w: { normal: 2, exposed: 3, worms: 2, urine: 2, green: 0.5 }, depth: [0.1, 0.4] },
  stray:  { name: '流浪猫',             w: { exposed: 4, soft: 2, worms: 2, black: 1 }, depth: [0.1, 0.3] },
};
let cat = CATS.granny;
function pickType(c) { const ks = Object.keys(c.w); let t = 0; for (const k of ks) t += c.w[k]; let r = Math.random() * t; for (const k of ks) { r -= c.w[k]; if (r <= 0) return k; } return ks[0]; }
const clumps = [];
const clumpGroup = new THREE.Group(); trayGroup.add(clumpGroup);
// 砂面染色（尿/稀屎的湿印）
const tint = new Float32Array(N * N), floorTint = new Float32Array(N * N); /* floorTint：渗到盆底的尿 */
function stainAt(x, z, r, amt) { brush(x, z, r, amt, (i, a) => { tint[i] = Math.min(1, tint[i] + a); floorTint[i] = Math.min(1, floorTint[i] + a * 0.7); }); }
// 平滑的砂团（端起来时包着屎的那层结块壳）：用叠加正弦做圆润的凹凸，不用随机顶点
function sandBall(r, flat = 1) {
  const g = new THREE.SphereGeometry(r, 36, 24); const p = g.attributes.position; const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.set(p.getX(i), p.getY(i), p.getZ(i)); const n = v.clone().normalize(); const k = 1 + 0.07 * Math.sin(n.x * 5.1 + 1.3) * Math.sin(n.y * 4.3) + 0.05 * Math.sin(n.z * 6.7 + n.x * 3.1); p.setXYZ(i, v.x * k, v.y * k * flat * 0.8, v.z * k); }
  g.computeVertexNormals(); return g;
}
function ballMat() { return new THREE.MeshStandardMaterial({ color: new THREE.Color(litter.color).multiplyScalar(0.78), roughness: 1, normalMap: sandMat.normalMap, normalScale: new THREE.Vector2(1.1, 1.1) }); }
function makePoopMesh(type, r) {
  const T = POOP_TYPES[type]; const g = new THREE.Group(); if (T.shape === 'none') return g;
  const mat = new THREE.MeshStandardMaterial({ color: T.color, roughness: T.gloss ? 0.3 : 0.8 });
  if (T.shape === 'splat') { const m = new THREE.Mesh(sandBall(r, 0.28), mat); m.scale.set(1.15, 1, 0.9); g.add(m); }
  else { for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(r * (0.46 - i * 0.09), 20, 14), mat); b.position.set((Math.random() - 0.5) * r * 0.5, r * (0.2 + i * 0.3), (Math.random() - 0.5) * r * 0.5); b.scale.y = 0.75; b.castShadow = true; g.add(b); } }
  if (T.worms) { const wm = new THREE.MeshStandardMaterial({ color: 0xf2eee4, roughness: 0.5 }); for (let i = 0; i < 4; i++) { const w = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.55, 3, 6), wm); w.position.set((Math.random() - 0.5) * r * 1.2, r * 0.55 + Math.random() * r * 0.3, (Math.random() - 0.5) * r * 1.2); w.rotation.set(Math.random(), Math.random() * 3, Math.random()); g.add(w); } }
  return g;
}
function bury(x, z, type, depth) {
  const T = POOP_TYPES[type]; const r = T.r[0] + Math.random() * (T.r[1] - T.r[0]);
  const [gx, gy] = worldToGrid(x, z); const hs = h[gi(Math.round(gx), Math.round(gy))];
  if (type === 'urine' && !litter.clumping) { stainAt(x, z, r * 1.8, 0.9); if (litter === LITTERS.pine) brush(x, z, r * 1.5, -0.35, (i, a) => { h[i] += a; }); dirty = true; return null; }
  const mesh = makePoopMesh(type, r); clumpGroup.add(mesh);
  const c = { type, x, z, r, mesh, buried: T.buried, y0: 0 };
  if (T.buried) { c.y0 = hs - depth - r * 0.9; brush(x, z, r * 2.6, 0.25 + depth * 0.35, (i, a) => { h[i] += a; }); }
  else { c.y0 = hs - r * 0.15; }
  mesh.position.set(x, c.y0, z); mesh.rotation.y = Math.random() * 6.28;
  if (T.stain) stainAt(x, z, r * (T.buried ? 1.6 : 2.2), T.stain);
  clumps.push(c); dirty = true; return c;
}
function buryByCat(n = 1) { for (let k = 0; k < n; k++) { const type = pickType(cat); const d = cat.depth[0] + Math.random() * (cat.depth[1] - cat.depth[0]); bury((Math.random() - 0.5) * (TRAY_W - 14), (Math.random() - 0.5) * (TRAY_D - 14), type, d); } }
function clearClumps() { for (const c of clumps) clumpGroup.remove(c.mesh); clumps.length = 0; tint.fill(0); floorTint.fill(0); }
// 埋着的：砂面钳在壳的穹顶之上；没埋的：坐在砂面上
function updateClumps() {
  for (const c of clumps) {
    const [gx, gy] = worldToGrid(c.x, c.z);
    if (c.buried) { const rc = c.r / CELL; const x0 = Math.max(0, Math.floor(gx - rc)), x1 = Math.min(N - 1, Math.ceil(gx + rc)), y0 = Math.max(0, Math.floor(gy - rc)), y1 = Math.min(N - 1, Math.ceil(gy + rc)); for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const d2 = ((x - gx) ** 2 + (y - gy) ** 2) / (rc * rc); if (d2 >= 1) continue; const dome = c.y0 + Math.sqrt(1 - d2) * c.r * 0.85; const i = gi(x, y); if (h[i] < dome) { h[i] = dome; dirty = true; } } }
    else { const hs = h[gi(Math.max(0, Math.min(N - 1, Math.round(gx))), Math.max(0, Math.min(N - 1, Math.round(gy))))]; c.mesh.position.y = hs - c.r * 0.15; }
  }
}

const nrm = sandGeo.attributes.normal; const zSign = row0z > 0 ? -1 : 1;
function pushGeometry() {
  const py = pos.array, na = nrm.array, ca = sandGeo.attributes.color.array;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = gi(x, y); py[i * 3 + 1] = h[i];
    const hl = h[i - (x > 0 ? 1 : 0)], hr = h[i + (x < N - 1 ? 1 : 0)], hu = h[i - (y > 0 ? N : 0)], hd = h[i + (y < N - 1 ? N : 0)];
    let nx = (hl - hr) / (2 * CELL), nz = (hu - hd) / (2 * CELL) * zSign, ny = 1; const l = Math.hypot(nx, ny, nz);
    na[i * 3] = nx / l; na[i * 3 + 1] = ny / l; na[i * 3 + 2] = nz / l;
    const t = tint[i], w = litter.wet; let r = 1 - t * (1 - w[0]), g = 1 - t * (1 - w[1]), b = 1 - t * (1 - w[2]);
    const f = h[i] < 0.6 ? (0.6 - h[i]) / 0.6 : 0; /* 砂少于 0.6 露出盆底：灰蓝塑料 + 卡在底上的尿渍 */
    if (f > 0) { const ft = floorTint[i]; const fr = 0.55 + ft * 0.45, fg = 0.62 + ft * 0.15, fb = 0.78 - ft * 0.45; r = r * (1 - f) + fr * f; g = g * (1 - f) + fg * f; b = b * (1 - f) + fb * f; }
    ca[i * 3] = r; ca[i * 3 + 1] = g; ca[i * 3 + 2] = b;
  }
  pos.needsUpdate = true; nrm.needsUpdate = true; sandGeo.attributes.color.needsUpdate = true;
}
// 世界坐标 → 格子
function worldToGrid(x, z) { const ix = (x + TRAY_W / 2) / TRAY_W * (N - 1); let iy = (z + TRAY_D / 2) / TRAY_D * (N - 1); if (row0z > 0) iy = (N - 1) - iy; return [ix, iy]; }

// ---------- 砂的物理 ----------
// 休止角坍落：八邻居（对角线距离 √2 格），相邻高差超过 tan(角)·距离 的部分按 slumpK 往低处流，带一点随机让堆变圆。每帧 2 遍。[调]
const NB = [[1, 0, 1], [0, 1, 1], [1, 1, Math.SQRT2], [-1, 1, Math.SQRT2]];
function slump(iter = 2) {
  const jostle = Math.min(1, (Math.abs(TILT.x) + Math.abs(TILT.z)) * 1.6); /* 端着盆晃，砂松动，休止角降到六成 */
  const T0 = Math.tan(litter.talus * (1 - 0.4 * jostle) * Math.PI / 180) * CELL, k = litter.slumpK * (1 + jostle);
  let moved = 0;
  for (let it = 0; it < iter; it++) {
    tmp.fill(0);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = gi(x, y), hi = h[i] + bias[i];
      for (const [dx, dy, dist] of NB) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || nx >= N || ny >= N) continue;
        const j = gi(nx, ny), T = T0 * dist * jit[i], d = hi - (h[j] + bias[j]);
        if (d > T) { const m = (d - T) * k * 0.25 / dist; tmp[i] -= m; tmp[j] += m; }
        else if (d < -T) { const m = (-d - T) * k * 0.25 / dist; tmp[i] += m; tmp[j] -= m; }
      }
    }
    for (let i = 0; i < h.length; i++) { if (tmp[i] !== 0) { h[i] += tmp[i]; moved += Math.abs(tmp[i]); if (h[i] < 0) h[i] = 0; } }
    if (moved < 1e-4) break;
  }
  if (moved > 1e-3) dirty = true;
}
function settle(k = 0.02) { for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) { const i = gi(x, y); tmp[i] = (h[i - 1] + h[i + 1] + h[i - N] + h[i + N]) * 0.25 - h[i]; } for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) { const i = gi(x, y); if (Math.abs(tmp[i]) > 0.004) { h[i] += tmp[i] * k; dirty = true; } } }
// 软笔刷：高斯衰减
function brush(cx, cz, r, amt, fn) {
  const [gx, gy] = worldToGrid(cx, cz); const rc = r / CELL, s2 = 2 * (rc * 0.5) * (rc * 0.5);
  const x0 = Math.max(0, Math.floor(gx - rc)), x1 = Math.min(N - 1, Math.ceil(gx + rc)), y0 = Math.max(0, Math.floor(gy - rc)), y1 = Math.min(N - 1, Math.ceil(gy + rc));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const d2 = (x - gx) ** 2 + (y - gy) ** 2; if (d2 > rc * rc) continue; const w = Math.exp(-d2 / s2); fn(gi(x, y), w * amt, x, y); }
  dirty = true;
}
// 指压 / 铲刃：压下去的砂 40% 推到外圈成脊，其余算被手带走（消失）[调]
function press(cx, cz, r, dt) {
  let removed = 0;
  brush(cx, cz, r * 1.3, 8 * dt, (i, a) => { const take = Math.min(h[i], a); h[i] -= take; removed += take; }); // 指压面比光标环略宽，坑口更开
  if (removed > 0) { const ring = []; brush(cx, cz, r * 1.9, 1, (i, w, x, y) => { const d = Math.hypot(x - worldToGrid(cx, cz)[0], y - worldToGrid(cx, cz)[1]) * CELL; if (d > r * 0.85) ring.push(i); }); const per = removed * 0.4 / Math.max(1, ring.length); for (const i of ring) h[i] += per; }
}
function pour(cx, cz, r, dt) { const jx = (Math.random() - 0.5) * r * 0.6, jz = (Math.random() - 0.5) * r * 0.6; brush(cx + jx, cz + jz, r * 0.7, 9 * dt, (i, a) => { h[i] += a * (0.8 + 0.4 * Math.random()); }); }
function smooth(cx, cz, r, dt) {
  brush(cx, cz, r, Math.min(1, 6 * dt), (i, a, x, y) => { if (x <= 0 || y <= 0 || x >= N - 1 || y >= N - 1) return; const avg = (h[i - 1] + h[i + 1] + h[i - N] + h[i + N]) * 0.25; h[i] += (avg - h[i]) * a; });
}
function flattenAll() { let m = 0; for (let i = 0; i < h.length; i++) m += h[i]; m /= h.length; for (let i = 0; i < h.length; i++) h[i] = m + (Math.random() - 0.5) * 0.05; dirty = true; }

// ---------- 钢丝猫砂铲 ----------
const BW = 12, BD = 10, BARS = 9, WIRE = 0.16;        // 铲面宽/深、条数、钢丝半径（世界单位≈cm）
const GAP = BW / BARS - WIRE * 2;                    // 缝宽 ≈1.0：比它小的东西会漏下去
const DIG_DEPTH = 2.4, DIG_RATE = 8, V_CAP = 2400;   // 铲入深度、速率、铲上砂容量（格高单位）[调]
const wireMat = new THREE.MeshStandardMaterial({ color: 0xdfe3e8, metalness: 0.92, roughness: 0.22 });
const gripMat = new THREE.MeshStandardMaterial({ color: 0x8e9299, roughness: 0.7 });
const YAW = 0.55; /* 右手持：铲头朝左前，柄在右下 */
const scoop = new THREE.Group(); scoop.rotation.y = YAW; scene.add(scoop);
const gridToWorld = (gx, gy) => [-TRAY_W / 2 + gx * CELL, row0z < 0 ? -TRAY_D / 2 + gy * CELL : TRAY_D / 2 - gy * CELL];
const toLocal = (wx, wz) => { const dx = wx - SC.px, dz = wz - SC.pz; return [dx * Math.cos(YAW) - dz * Math.sin(YAW), dx * Math.sin(YAW) + dz * Math.cos(YAW)]; };
const blade = new THREE.Group(); scoop.add(blade);
{
  const pts = []; const rr = 1.2; const segs = 8;
  const corner = (cx, cz, a0) => { for (let i = 0; i <= segs; i++) { const a = a0 + i / segs * Math.PI / 2; pts.push(new THREE.Vector3(cx + Math.cos(a) * rr, 0, cz + Math.sin(a) * rr)); } };
  corner(BW / 2 - rr, -BD / 2 + rr, -Math.PI / 2); corner(BW / 2 - rr, BD / 2 - rr, 0); corner(-BW / 2 + rr, BD / 2 - rr, Math.PI / 2); corner(-BW / 2 + rr, -BD / 2 + rr, Math.PI);
  const frame = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 120, WIRE, 8, true), wireMat); frame.castShadow = true; blade.add(frame);
  for (let i = 0; i < BARS; i++) { const x = -BW / 2 + (i + 0.5) * (BW / BARS); const bar = new THREE.Mesh(new THREE.CylinderGeometry(WIRE * 0.85, WIRE * 0.85, BD - 0.6, 8), wireMat); bar.rotation.x = Math.PI / 2; bar.position.set(x, 0, 0); bar.castShadow = true; blade.add(bar); }
  const cross = new THREE.Mesh(new THREE.CylinderGeometry(WIRE * 0.8, WIRE * 0.8, BW - 1.2, 8), wireMat); cross.rotation.z = Math.PI / 2; cross.position.set(0, 0.05, BD * 0.22); blade.add(cross);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(WIRE * 1.1, WIRE * 1.1, 4.5, 10), wireMat); neck.position.set(0, 1.4, BD / 2 + 1.4); neck.rotation.x = -0.75; scoop.add(neck);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 6.5, 16), gripMat); grip.position.set(0, 4.4, BD / 2 + 4.3); grip.rotation.x = -0.75; grip.castShadow = true; scoop.add(grip);
}
const pileGeo = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2); { const p = pileGeo.attributes.position; for (let i = 0; i < p.count; i++) { const k = 1 + (Math.random() - 0.5) * 0.12; p.setXYZ(i, p.getX(i) * k, p.getY(i), p.getZ(i) * k); } pileGeo.computeVertexNormals(); }
const pileMat = new THREE.MeshStandardMaterial({ color: litter.color, roughness: 1, normalMap: sandMat.normalMap, normalScale: new THREE.Vector2(0.8, 0.8) });
const pile = new THREE.Mesh(pileGeo, pileMat); pile.castShadow = true; pile.position.y = 0.05; blade.add(pile);
const SC = { state: 'hover', V: 0, held: [], px: 0, pz: 0, vx: 0, vz: 0, tilt: 0, floor: 0, bagClumps: 0, wasted: 0, y: 0, shake: 0, digCaught: false, overWall: false };
// 漏砂粒子
const PMAX = 4000;
const pPos = new Float32Array(PMAX * 3), pVel = new Float32Array(PMAX * 3), pAmt = new Float32Array(PMAX); const pAlive = new Uint8Array(PMAX); let pHead = 0;
const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
const pMat = new THREE.PointsMaterial({ color: litter.color, size: litter.pSize, sizeAttenuation: true, transparent: true, opacity: 0.95, toneMapped: false, depthWrite: false });
const points = new THREE.Points(pGeo, pMat); points.frustumCulled = false; scene.add(points);
for (let i = 0; i < PMAX; i++) pPos[i * 3 + 1] = -100;
const tmpV = new THREE.Vector3();
function spawnLeak(n, amtEach) {
  for (let k = 0; k < n; k++) {
    const i = pHead; pHead = (pHead + 1) % PMAX;
    const gap = Math.floor(Math.random() * (BARS - 1)); const lx = -BW / 2 + (gap + 1) * (BW / BARS) + (Math.random() - 0.5) * GAP * 0.8; const lz = (Math.random() - 0.5) * (BD - 1.5);
    tmpV.set(lx, -0.1, lz); blade.localToWorld(tmpV);
    pPos[i * 3] = tmpV.x; pPos[i * 3 + 1] = tmpV.y; pPos[i * 3 + 2] = tmpV.z;
    pVel[i * 3] = SC.vx * 0.3 + (Math.random() - 0.5) * 2; pVel[i * 3 + 1] = -2 - Math.random() * 3; pVel[i * 3 + 2] = SC.vz * 0.3 + (Math.random() - 0.5) * 2;
    pAmt[i] = amtEach; pAlive[i] = 1;
  }
}
function updateParticles(dt) {
  let any = false;
  for (let i = 0; i < PMAX; i++) {
    if (!pAlive[i]) continue; any = true;
    pVel[i * 3 + 1] -= 60 * dt;
    const x = pPos[i * 3] += pVel[i * 3] * dt, y = pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt, z = pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
    if (Math.abs(x) <= TRAY_W / 2 && Math.abs(z) <= TRAY_D / 2) { const [gx, gy] = worldToGrid(x, z); const ci = gi(Math.round(gx), Math.round(gy)); if (y <= h[ci] + 0.12) { if (litter.bounce > 0 && pVel[i * 3 + 1] < -7) { pPos[i * 3 + 1] = h[ci] + 0.13; pVel[i * 3 + 1] *= -litter.bounce; pVel[i * 3] += (Math.random() - 0.5) * 6 * litter.bounce; pVel[i * 3 + 2] += (Math.random() - 0.5) * 6 * litter.bounce; continue; } const a = pAmt[i]; const cx = Math.round(gx), cy = Math.round(gy); h[ci] += a * 0.4; if (cx > 0) h[ci - 1] += a * 0.15; if (cx < N - 1) h[ci + 1] += a * 0.15; if (cy > 0) h[ci - N] += a * 0.15; if (cy < N - 1) h[ci + N] += a * 0.15; dirty = true; pAlive[i] = 0; pPos[i * 3 + 1] = -100; continue; } }
    else if (y <= -0.9) { pAlive[i] = 0; pPos[i * 3 + 1] = -100; continue; }
  }
  if (any) pGeo.attributes.position.needsUpdate = true;
}
function bladeCells(pad = 0) { const out = []; const [gx0, gy0] = worldToGrid(SC.px, SC.pz); const R = (Math.hypot(BW, BD) / 2 + pad) / CELL; for (let y = Math.max(0, Math.floor(gy0 - R)); y <= Math.min(N - 1, Math.ceil(gy0 + R)); y++) for (let x = Math.max(0, Math.floor(gx0 - R)); x <= Math.min(N - 1, Math.ceil(gx0 + R)); x++) { const [wx, wz] = gridToWorld(x, y); const [lx, lz] = toLocal(wx, wz); const u = lx / (BW / 2 + pad), v = lz / (BD / 2 + pad); if (Math.abs(u) > 1 || Math.abs(v) > 1) continue; if (Math.max(Math.abs(u), Math.abs(v)) > 0.8 && u * u + v * v > 1.1) continue; out.push(gi(x, y)); } return out; }
function scoopDig(dt) {
  const cells = bladeCells(); if (!cells.length) return;
  let removed = 0; const room = V_CAP - SC.V;
  for (const i of cells) { const target = Math.max(SC.floor, 0.05); if (h[i] > target) { const take = Math.min(h[i] - target, DIG_RATE * dt, Math.max(0, room - removed) / cells.length * 4); h[i] -= take; removed += take; } }
  if (removed > 0) { SC.V += removed * 0.78; dirty = true;
    const inner = new Set(cells); const ring = bladeCells(1.4).filter(i => !inner.has(i));
    const per = removed * 0.22 / Math.max(1, ring.length); for (const i of ring) h[i] += per;
  }
  if (SC.digCaught) return; /* 一次铲入最多端起一坨；端着可以再铲下一坨 */
  let best = null, bd = 1e9;
  for (const c of clumps) { const [lx, lz] = toLocal(c.x, c.z); if (Math.abs(lx) > BW / 2 - 0.5 || Math.abs(lz) > BD / 2 - 0.5) continue; const under = c.buried ? SC.floor <= c.y0 + c.r * 0.45 : SC.floor <= c.mesh.position.y - 0.2; if (!under) continue; const d = lx * lx + lz * lz; if (d < bd) { bd = d; best = c; } }
  if (best) {
    const c = best; const [lx, lz] = toLocal(c.x, c.z); const k = clumps.indexOf(c);
    SC.digCaught = true; clumps.splice(k, 1); clumpGroup.remove(c.mesh);
    const T = POOP_TYPES[c.type]; const holder = new THREE.Group();
    if (c.buried && litter.clumping) { const ball = new THREE.Mesh(sandBall(c.r * 0.95, T.shape === 'none' ? 0.9 : 1), ballMat()); ball.castShadow = true; holder.add(ball); c.ball = ball; c.mesh.position.set(0, c.r * 0.15, 0); holder.add(c.mesh); }
    else if (c.buried) { c.mesh.position.set(0, 0, 0); holder.add(c.mesh); }
    else { c.mesh.position.set(0, 0, 0); holder.add(c.mesh); if (T.stain) stainAt(c.x, c.z, c.r * 1.6, 0.35); }
    holder.position.set(lx + (Math.random() - 0.5), 0.35 + c.r * (c.buried ? 0.8 : 0.3), lz); blade.add(holder); c.holder = holder; SC.held.push(c);
    SC.last = T.name; if (T.stain && c.buried) { brush(c.x, c.z, c.r * 1.4, 0.3, (i, a) => { tint[i] = Math.max(0, tint[i] - a); }); }
  }
}
function scoopDump() { SC.bagClumps += SC.held.length; for (const c of SC.held) blade.remove(c.holder || c.mesh); SC.held = []; SC.wasted += SC.V; SC.V = 0; }
function updateScoop(dt) {
  if (!hit || tool === 'lift') { scoop.visible = false; return; } scoop.visible = tool === 'scoop';
  if (tool !== 'scoop') return;
  const tx = Math.max(-TRAY_W / 2 - 30, Math.min(TRAY_W / 2 + 40, hit.x)), tz = Math.max(-TRAY_D / 2 - 30, Math.min(TRAY_D / 2 + 30, hit.z));
  const nx = SC.px + (tx - SC.px) * Math.min(1, dt * 18), nz = SC.pz + (tz - SC.pz) * Math.min(1, dt * 18);
  SC.vx = (nx - SC.px) / Math.max(dt, 1e-3); SC.vz = (nz - SC.pz) / Math.max(dt, 1e-3); SC.px = nx; SC.pz = nz;
  const speed = Math.hypot(SC.vx, SC.vz); SC.shake = SC.shake * 0.85 + Math.min(1, speed / 45) * 0.15;
  const [gx, gy] = worldToGrid(SC.px, SC.pz);
  // 铲面四角任一角压到盆壁或盆外 → 抬到盆沿以上，不能铲（碰撞）
  SC.overWall = false; for (const [cx, cz] of [[-BW / 2, -BD / 2], [BW / 2, -BD / 2], [-BW / 2, BD / 2], [BW / 2, BD / 2]]) { const wx = SC.px + cx * Math.cos(YAW) + cz * Math.sin(YAW), wz = SC.pz - cx * Math.sin(YAW) + cz * Math.cos(YAW); if (Math.abs(wx) > TRAY_W / 2 - 0.8 || Math.abs(wz) > TRAY_D / 2 - 0.8) { SC.overWall = true; break; } }
  const inside = !SC.overWall;
  const hs = inside ? h[gi(Math.max(0, Math.min(N - 1, Math.round(gx))), Math.max(0, Math.min(N - 1, Math.round(gy))))] : BASE_H;
  if (pressing && inside) {
    if (SC.state !== 'dig') { SC.state = 'dig'; SC.floor = hs - DIG_DEPTH; }
    SC.y += ((SC.floor + 0.3) - SC.y) * Math.min(1, dt * 10); SC.tilt += (-0.28 - SC.tilt) * Math.min(1, dt * 8);
    scoopDig(dt);
  } else {
    SC.state = (SC.V > 1 || SC.held.length) ? 'carry' : 'hover';
    const ty = SC.overWall ? WALL_H + 3.2 + (SC.state === 'carry' ? 1 : 0) : Math.max(hs, BASE_H) + 2.2 + (SC.state === 'carry' ? 1.5 : 0);
    SC.y += (ty - SC.y) * Math.min(1, dt * 8); SC.tilt += ((SC.state === 'carry' ? 0.06 : -0.1) - SC.tilt) * Math.min(1, dt * 6);
    if (litter.crumble && SC.shake > 0.45) for (const c of SC.held) if (c.ball && c.ball.scale.x > 0.72) { c.ball.scale.multiplyScalar(1 - dt * litter.crumble * SC.shake * 0.6); SC.V += 0.4; spawnLeak(2, 0.2); }
    if (SC.V > 0.5) { const rate = litter.leak * (0.28 + 3.2 * SC.shake); const dV = Math.min(SC.V, SC.V * rate * dt + 0.3 * dt * litter.leak); SC.V -= dV; const n = Math.min(80, Math.max(1, Math.round(dV / 0.5))); spawnLeak(n, dV / n); }
  }
  scoop.position.set(SC.px, SC.y, SC.pz); blade.rotation.x = SC.tilt + Math.sin(performance.now() / 40) * SC.shake * 0.05;
  const fill = Math.min(1, SC.V / V_CAP); pile.visible = fill > 0.01; pile.scale.set(BW * 0.42 * (0.55 + fill * 0.45), 0.6 + fill * 1.9, BD * 0.42 * (0.55 + fill * 0.45));
}
// ---------- 丢的地方：垃圾袋 + 马桶 ----------
const bagMat = new THREE.MeshPhysicalMaterial({ color: 0xf4f4f0, roughness: 0.55, transparent: true, opacity: 0.92, side: THREE.DoubleSide });
const bag = new THREE.Group(); bag.position.set(TRAY_W / 2 + 18, 0, 14); bag.scale.setScalar(1.7); scene.add(bag);
{ const prof = []; for (let i = 0; i <= 14; i++) { const t = i / 14; const rr = 3.2 + Math.sin(t * 9) * 0.25 + t * 1.1; prof.push(new THREE.Vector2(rr * (i === 0 ? 0.6 : 1), t * 8.5)); }
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), bagMat); body.castShadow = true; body.receiveShadow = true; bag.add(body);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(4.3, 0.22, 8, 36), bagMat); lip.rotation.x = Math.PI / 2; lip.position.y = 8.5; bag.add(lip);
  const inside = new THREE.Mesh(new THREE.CircleGeometry(3.4, 28), new THREE.MeshStandardMaterial({ color: 0x2a2118 })); inside.rotation.x = -Math.PI / 2; inside.position.y = 6.5; bag.add(inside); }
const toilet = new THREE.Group(); toilet.position.set(TRAY_W / 2 + 26, 0, -16); toilet.scale.setScalar(2.4); scene.add(toilet);
const water = new THREE.Mesh(new THREE.CircleGeometry(3.1, 32), new THREE.MeshPhysicalMaterial({ color: 0xbfe0f0, roughness: 0.05, transparent: true, opacity: 0.9 }));
{ const cer = new THREE.MeshPhysicalMaterial({ color: 0xf7f7f5, roughness: 0.18, clearcoat: 0.8 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.8, 7, 28), cer); base.position.y = 3.5; base.castShadow = true; base.receiveShadow = true; toilet.add(base);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 3.6, 3.4, 32, 1, true), new THREE.MeshPhysicalMaterial({ color: 0xf7f7f5, roughness: 0.18, clearcoat: 0.8, side: THREE.DoubleSide })); bowl.position.y = 8.2; bowl.castShadow = true; toilet.add(bowl);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.55, 12, 40), cer); rim.rotation.x = Math.PI / 2; rim.position.y = 9.9; rim.castShadow = true; toilet.add(rim);
  water.rotation.x = -Math.PI / 2; water.position.y = 7.4; toilet.add(water);
  const tank = new THREE.Mesh(new THREE.BoxGeometry(6.5, 7, 2.6), cer); tank.position.set(0, 12.5, -4.2); tank.castShadow = true; toilet.add(tank); }
const DISP = { bag: 0, flushed: 0, clogged: 0, flushT: 0, clogT: 0, msg: '' };
function dumpTo(where) {
  const n = SC.held.length, v = SC.V;
  for (const c of SC.held) blade.remove(c.holder || c.mesh); SC.held = []; SC.V = 0;
  if (where === 'bag') { DISP.bag += n; SC.wasted += v; DISP.msg = n ? `${n} 坨进袋${v > 300 ? '，带了不少砂' : ''}` : '倒了一铲砂进袋'; }
  else if (!litter.flushable && (v > 250 || n)) { DISP.clogged++; DISP.clogT = 2.5; DISP.msg = litter.noFlush; }
  else { DISP.flushed += n; DISP.flushT = 1.4; DISP.msg = n ? `冲走 ${n} 坨` : '冲了一下'; }
}
function updateLift(dt) {
  if (tool !== 'lift') { TILT.tx = 0; TILT.tz = 0; }
  const k = Math.min(1, dt * 6); const ox = TILT.x, oz = TILT.z;
  TILT.x += (TILT.tx - TILT.x) * k; TILT.z += (TILT.tz - TILT.z) * k;
  trayGroup.rotation.set(TILT.x, 0, TILT.z); trayGroup.position.y = tool === 'lift' ? 6 : 0;
  if (Math.abs(TILT.x - ox) > 1e-4 || Math.abs(TILT.z - oz) > 1e-4 || (tool === 'lift' && Math.abs(TILT.x) + Math.abs(TILT.z) > 0.01)) updateBias();
  if (tool !== 'lift' && Math.abs(TILT.x) + Math.abs(TILT.z) < 1e-3 && (ox !== 0 || oz !== 0)) { TILT.x = TILT.z = 0; updateBias(); }
}
function updateDispose(dt) {
  if (DISP.flushT > 0) { DISP.flushT -= dt; water.rotation.z += dt * 9; water.scale.setScalar(0.55 + Math.abs(Math.sin(DISP.flushT * 4)) * 0.45); water.material.color.set(0xbfe0f0); }
  else if (DISP.clogT > 0) { DISP.clogT -= dt; water.scale.setScalar(1.25); water.material.color.set(0x9a7a4a); }
  else { water.scale.setScalar(1); water.material.color.set(0xbfe0f0); }
}

// ---------- 输入 ----------
const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // y=0 平面，再用高度场近似（斜视角误差可接受）
let pressing = false, hit = null, cursor = null;
function pick(e) {
  const rect = cv.getBoundingClientRect(); ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const inter = ray.intersectObject(sand, false)[0];
  if (inter) return inter.point;
  const p = new THREE.Vector3(); return ray.ray.intersectPlane(plane, p) ? p : null;
}
const inTray = p => p && Math.abs(p.x) <= TRAY_W / 2 && Math.abs(p.z) <= TRAY_D / 2;
cv.addEventListener('pointerdown', e => { if (e.button !== 0) return; hit = pick(e);
  if (tool === 'scoop') { const rect = cv.getBoundingClientRect(); ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1); ray.setFromCamera(ndc, camera); if (SC.V > 1 || SC.held.length) { if (ray.intersectObject(bag, true).length) { dumpTo('bag'); return; } if (ray.intersectObject(toilet, true).length) { dumpTo('toilet'); return; } } }
  if (tool === 'scoop') { SC.digCaught = false; pressing = true; cv.setPointerCapture(e.pointerId); return; }
  if (tool === 'lift') { pressing = true; liftStart = { x: e.clientX, y: e.clientY, tx: TILT.tx, tz: TILT.tz }; cv.setPointerCapture(e.pointerId); return; }
  if (inTray(hit)) { pressing = true; cv.setPointerCapture(e.pointerId); } });
let liftStart = null;
cv.addEventListener('pointermove', e => { hit = pick(e); if (tool === 'lift' && pressing && liftStart) { TILT.tz = Math.max(-0.9, Math.min(0.9, liftStart.tz - (e.clientX - liftStart.x) / 220)); TILT.tx = Math.max(-0.9, Math.min(0.9, liftStart.tx + (e.clientY - liftStart.y) / 220)); } });
cv.addEventListener('pointerup', () => { pressing = false; if (SC.state === 'dig') SC.state = 'carry'; });
cv.addEventListener('pointercancel', () => { pressing = false; });
cv.addEventListener('contextmenu', e => e.preventDefault());
// 光标环
const ringGeo = new THREE.RingGeometry(0.9, 1, 48); ringGeo.rotateX(-Math.PI / 2);
cursor = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthTest: false })); cursor.renderOrder = 10; scene.add(cursor);

// UI
document.querySelectorAll('[data-litter]').forEach(b => b.onclick = () => { document.querySelectorAll('[data-litter]').forEach(x => x.classList.toggle('on', x === b)); litter = LITTERS[b.dataset.litter]; sandMat.color.set(litter.color); sandMat.roughness = litter.rough; sandMat.normalMap.dispose(); sandMat.normalMap = grainNormalTexture(litter.grain); sandMat.needsUpdate = true; pileMat.color.set(litter.color); pileMat.normalMap = sandMat.normalMap; pMat.color.set(litter.color); pMat.size = litter.pSize; resetSand(); buryByCat(4); for (const c of SC.held) blade.remove(c.holder || c.mesh); SC.held = []; SC.V = 0; });
document.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => { document.querySelectorAll('[data-tool]').forEach(x => x.classList.toggle('on', x === b)); tool = b.dataset.tool; });
document.getElementById('size').oninput = e => { brushSize = +e.target.value; };
document.getElementById('reset').onclick = () => { resetSand(); buryByCat(4); for (const c of SC.held) blade.remove(c.holder || c.mesh); SC.held = []; SC.V = 0; };
document.getElementById('bury').onclick = () => { buryByCat(1); };
document.getElementById('cat').onchange = e => { cat = CATS[e.target.value]; };
document.getElementById('flat').onclick = flattenAll;
window.addEventListener('keydown', e => { if (e.shiftKey) tool = 'pour'; });
window.addEventListener('keyup', e => { if (!e.shiftKey && tool === 'pour' && document.querySelector('[data-tool].on').dataset.tool !== 'pour') tool = document.querySelector('[data-tool].on').dataset.tool; });

function resize() { const w = innerWidth, hh = innerHeight; renderer.setSize(w, hh, false); camera.aspect = w / hh; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

// ---------- 主循环 ----------
resetSand(); buryByCat(4);
let last = performance.now(), fpsT = 0, frames = 0;
window.SAND = { h, N, litter: () => litter, slump, reset: resetSand, camera, controls, clumps, bury: buryByCat, SC, bag, toilet, DISP, POOP_TYPES, CATS, setCat: k => { cat = CATS[k]; } };
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (pressing && inTray(hit) && tool !== 'scoop' && tool !== 'lift') { if (tool === 'press') press(hit.x, hit.z, brushSize, dt); else if (tool === 'pour') pour(hit.x, hit.z, brushSize, dt); else smooth(hit.x, hit.z, brushSize, dt); }
  slump(2); settle(0.03);
  if (dirty) { pushGeometry(); dirty = false; }
  updateClumps();
  updateLift(dt); updateScoop(dt); updateParticles(dt); updateDispose(dt);
  if (hit && tool !== 'scoop') { cursor.visible = inTray(hit); const [gx, gy] = worldToGrid(hit.x, hit.z); const hy = h[gi(Math.round(Math.max(0, Math.min(N - 1, gx))), Math.round(Math.max(0, Math.min(N - 1, gy))))] || 0; cursor.position.set(hit.x, hy + 0.15, hit.z); cursor.scale.setScalar(brushSize); } else cursor.visible = false;
  if (tool === 'scoop') cursor.visible = false;
  controls.update(); renderer.render(scene, camera);
  frames++; fpsT += dt; if (fpsT >= 1) { document.getElementById('fps').textContent = `${frames} fps · 铲上砂 ${Math.round(SC.V)} · 铲上 ${SC.held.length} 坨${SC.last ? '（' + SC.last + '）' : ''} · 袋里 ${DISP.bag} 坨 · 冲走 ${DISP.flushed} · 堵 ${DISP.clogged} 次 · 浪费砂 ${Math.round(SC.wasted)}${DISP.msg ? ' · ' + DISP.msg : ''}`; frames = 0; fpsT = 0; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
