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
  bentonite: { name: '膨润土', color: 0xd4c39c, talus: 34, grain: 1.0, rough: 0.95, slumpK: 0.35, leak: 1.3, clumping: true,  crumble: 0,   flushable: false, bounce: 0,    pSize: 0.34, wet: [0.72, 0.66, 0.58], noFlush: '膨润土遇水膨胀，马桶堵了', pel: { kind: 'grain', r: 0.2,  len: 0,   n: 6500 } },
  tofu:      { name: '豆腐砂', color: 0xeee5cc, talus: 38, grain: 1.6, rough: 0.9,  slumpK: 0.25, leak: 1.1, clumping: true,  crumble: 0.6, flushable: true,  bounce: 0.1,  pSize: 0.5,  wet: [0.8, 0.74, 0.62], noFlush: '', pel: { kind: 'rod', r: 0.19, len: 1.0, n: 5600 } },
  crystal:   { name: '水晶砂', color: 0xe4eef2, talus: 30, grain: 2.2, rough: 0.35, slumpK: 0.45, leak: 1.5, clumping: false, crumble: 0,   flushable: false, bounce: 0.55, pSize: 0.7,  wet: [0.98, 0.9, 0.55], noFlush: '水晶砂是硅胶，不溶，只能扔垃圾桶', pel: { kind: 'grain', r: 0.3, len: 0, n: 4600 } },
  pine:      { name: '松木砂', color: 0xc8a672, talus: 36, grain: 1.8, rough: 0.85, slumpK: 0.3,  leak: 0.9, clumping: false, crumble: 0,   flushable: false, bounce: 0.25, pSize: 0.6,  wet: [0.62, 0.5, 0.36], noFlush: '松木砂不能冲，可以堆肥', pel: { kind: 'rod', r: 0.24, len: 1.2, n: 4600 } },
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
const SHAKE = { e: 0 };            /* 晃动能量：倾角变化快就涨，约半秒衰减 */
let trayY = 0, flowed = 0;         /* flowed：上一帧坍落搬走的总砂量，喂滚砂粒 */
function updateBias() { const gx = Math.tan(TILT.z), gz = -Math.tan(TILT.x); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const wx = -TRAY_W / 2 + x * CELL; const wz = (row0z < 0 ? -TRAY_D / 2 + y * CELL : TRAY_D / 2 - y * CELL); bias[gi(x, y)] = wx * gx + wz * gz; } }
const gi = (ix, iy) => iy * N + ix;
function resetSand() { for (let i = 0; i < h.length; i++) { h[i] = BASE_H + (Math.random() - 0.5) * 0.12; jit[i] = 0.9 + 0.2 * Math.random(); } if (typeof clearClumps === 'function') clearClumps(); killRolls(); /* 不清的话，飞着的滚砂粒会把重置前借的砂还进新砂面 */ dirty = true; }

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
  /* 尿往下渗：砂薄处才容易一路渗到盆底结成黏底饼（满砂 ~16%，砂薄到见底 ~90%），得铲到底反复刮才下来 */
  if (type === 'urine' && litter.clumping) {
    const pStick = Math.min(0.9, Math.max(0.1, (6.2 - hs) / 4.5));
    if (Math.random() < pStick) {
      c.stick = 4 + Math.floor(Math.random() * 3); c.wasStuck = true; c.y0 = c.r * 0.35; /* 压扁贴底；不设 domeK：黏底饼不钳砂面，砂挖走了它才露出来 */
      const w = litter.wet; /* 结在底上的尿饼：湿砂色、压扁、贴着盆底 */
      const cake = new THREE.Mesh(sandBall(r * 0.95, 0.5), new THREE.MeshStandardMaterial({ color: new THREE.Color(litter.color).multiply(new THREE.Color(w[0], w[1], w[2])).multiplyScalar(0.9), roughness: 0.75, normalMap: sandMat.normalMap, normalScale: new THREE.Vector2(1.2, 1.2) }));
      cake.castShadow = true; mesh.add(cake); c.cake = cake;
      stainAt(x, z, r * 1.5, 0.5);
    }
  }
  mesh.position.set(x, c.y0, z); mesh.rotation.y = Math.random() * 6.28;
  if (T.stain) stainAt(x, z, r * (T.buried ? 1.6 : 2.2), T.stain);
  clumps.push(c); dirty = true; return c;
}
function buryByCat(n = 1) { for (let k = 0; k < n; k++) { const type = pickType(cat); const d = cat.depth[0] + Math.random() * (cat.depth[1] - cat.depth[0]); bury((Math.random() - 0.5) * (TRAY_W - 14), (Math.random() - 0.5) * (TRAY_D - 14), type, d); } }
function clearClumps() {
  for (const c of clumps) clumpGroup.remove(c.mesh); clumps.length = 0;
  /* 地上散落的、空中还在飞的也要清 —— 不清的话 fallen 落地后又会 push 回 clumps */
  for (const c of loose) scene.remove(c.holder); loose.length = 0;
  for (const f of fallen) scene.remove(f.c.holder); fallen.length = 0;
  tint.fill(0); floorTint.fill(0);
}
// 埋着的：砂面钳在壳的穹顶之上；没埋的：坐在砂面上
function updateClumps() {
  for (const c of clumps) {
    const [gx, gy] = worldToGrid(c.x, c.z);
    if (c.buried && !c.wasStuck) { const rc = c.r / CELL; /* 黏底饼不钳砂面：钳了就永远挖不到底（还会成无限砂源） */ const x0 = Math.max(0, Math.floor(gx - rc)), x1 = Math.min(N - 1, Math.ceil(gx + rc)), y0 = Math.max(0, Math.floor(gy - rc)), y1 = Math.min(N - 1, Math.ceil(gy + rc)); for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const d2 = ((x - gx) ** 2 + (y - gy) ** 2) / (rc * rc); if (d2 >= 1) continue; const dome = c.y0 + Math.sqrt(1 - d2) * c.r * (c.domeK || 0.85); const i = gi(x, y); if (h[i] < dome) { h[i] = dome; dirty = true; } } }
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
// 盆坐标系里的砂面高度 / 有效坡度（含倾斜势 bias），给滚砂粒、滑屎用
function hAt(lx, lz) { const [gx, gy] = worldToGrid(lx, lz); return h[gi(Math.max(0, Math.min(N - 1, Math.round(gx))), Math.max(0, Math.min(N - 1, Math.round(gy))))]; }
function gradAt(lx, lz) {
  const [gx, gy] = worldToGrid(lx, lz); const x = Math.max(1, Math.min(N - 2, Math.round(gx))), y = Math.max(1, Math.min(N - 2, Math.round(gy))); const i = gi(x, y);
  const sx = ((h[i + 1] + bias[i + 1]) - (h[i - 1] + bias[i - 1])) / (2 * CELL);
  const sz = ((h[i + N] + bias[i + N]) - (h[i - N] + bias[i - N])) / (2 * (TRAY_D / (N - 1))) * (row0z > 0 ? -1 : 1); /* z 向格距 ≠ CELL（盆不是正方形） */
  return [sx, sz];
}

// ---------- 表层颗粒 ----------
// 真砂子是一粒一粒的：高度场 + 法线贴图只能做出「面」，做不出颗粒感。
// 在砂面上铺一层实例化的真颗粒（豆腐/松木是躺平的短棒，膨润土/水晶是碎粒），
// x/z 固定、每帧分批把 y 贴到当前砂面上；砂挖光的地方缩到 0，露出盆底。
const PEL_MAX = 8000;
const pelX = new Float32Array(PEL_MAX), pelZ = new Float32Array(PEL_MAX), pelYaw = new Float32Array(PEL_MAX), pelTx = new Float32Array(PEL_MAX), pelTz = new Float32Array(PEL_MAX), pelS = new Float32Array(PEL_MAX);
const pelDummy = new THREE.Object3D(); let pelMesh = null, pelCursor = 0;
function pelGeometry(L) {
  if (L.pel.kind === 'rod') { const g = new THREE.CylinderGeometry(L.pel.r, L.pel.r * 0.9, L.pel.len, 6, 1); g.rotateZ(Math.PI / 2); return g; } /* 躺平的短棒 */
  return new THREE.IcosahedronGeometry(L.pel.r, 0);
}
function buildPellets() {
  if (pelMesh) { trayGroup.remove(pelMesh); pelMesh.geometry.dispose(); pelMesh.material.dispose(); pelMesh.dispose(); }
  const L = litter, n = Math.min(PEL_MAX, L.pel.n);
  const mat = new THREE.MeshStandardMaterial({ color: L.color, roughness: L.rough, metalness: 0, flatShading: true });
  pelMesh = new THREE.InstancedMesh(pelGeometry(L), mat, n);
  pelMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  /* receiveShadow 必须留（盆壁的影子压在砂面上，颗粒不接影会在阴影区亮出一片）；
     castShadow 关掉：一粒才几个像素，自投影看不出来，却要多跑一整趟 16 万三角的阴影 pass */
  pelMesh.castShadow = false; pelMesh.receiveShadow = true; pelMesh.frustumCulled = false;
  trayGroup.add(pelMesh);
  const col = new THREE.Color();
  for (let i = 0; i < n; i++) {
    pelX[i] = (Math.random() - 0.5) * (TRAY_W - 0.8); pelZ[i] = (Math.random() - 0.5) * (TRAY_D - 0.8);
    pelYaw[i] = Math.random() * 6.283; pelTx[i] = (Math.random() - 0.5) * 0.8; pelTz[i] = (Math.random() - 0.5) * 0.8;
    pelS[i] = 0.75 + Math.random() * 0.5;
    if (Math.random() < 0.22) pelS[i] *= 0.42;      /* 一小撮细碎的：真盆里总有磨碎的小颗粒和粉 */
    const k = 0.84 + Math.random() * 0.3; col.setRGB(k, k, k); pelMesh.setColorAt(i, col); /* 每粒深浅不同，堆在一起才不像一块塑料 */
  }
  if (pelMesh.instanceColor) pelMesh.instanceColor.needsUpdate = true;
  pelCursor = 0; for (let k = 0; k < 4; k++) updatePellets(); /* 先铺满，别第一帧全堆在原点 */
}
function updatePellets() {
  if (!pelMesh) return;
  const n = pelMesh.count, chunk = Math.min(n, 2200);
  for (let k = 0; k < chunk; k++) {
    const i = (pelCursor + k) % n, hy = hAt(pelX[i], pelZ[i]);
    pelDummy.position.set(pelX[i], hy - 0.06, pelZ[i]);
    pelDummy.rotation.set(pelTx[i], pelYaw[i], pelTz[i]);
    pelDummy.scale.setScalar(hy < 0.45 ? 0 : pelS[i]);
    pelDummy.updateMatrix(); pelMesh.setMatrixAt(i, pelDummy.matrix);
  }
  /* 只上传这一批的区间：needsUpdate 默认整块重传（8000 粒 = 512KB/帧），分批就白分了 */
  const im = pelMesh.instanceMatrix;
  if (im.clearUpdateRanges) {
    im.clearUpdateRanges(); const end = pelCursor + chunk;
    if (end <= n) im.addUpdateRange(pelCursor * 16, chunk * 16);
    else { im.addUpdateRange(pelCursor * 16, (n - pelCursor) * 16); im.addUpdateRange(0, (end - n) * 16); }
  }
  pelCursor = (pelCursor + chunk) % n; im.needsUpdate = true;
}

// ---------- 砂的物理 ----------
// 休止角坍落：八邻居（对角线距离 √2 格），相邻高差超过 tan(角)·距离 的部分按 slumpK 往低处流，带一点随机让堆变圆。每帧 2 遍。[调]
const NB = [[1, 0, 1], [0, 1, 1], [1, 1, Math.SQRT2], [-1, 1, Math.SQRT2]];
function slump(iter = 2) {
  /* 端在手上的砂是松的：倾角 + 晃动一起把休止角往下压（最低压到三成），流量同步放大。
     不端盆时维持原表现。倾过 ~15° 或快速晃，砂才开始成片滑 —— 小倾角端稳了不流。 */
  const lifting = tool === 'lift', tiltMag = Math.abs(TILT.x) + Math.abs(TILT.z);
  const jostle = lifting ? Math.min(1, tiltMag * 2.0 + SHAKE.e * 2.5) : Math.min(1, tiltMag * 1.6);
  const drop = lifting ? 0.7 : 0.4;
  const T0 = Math.tan(litter.talus * (1 - drop * jostle) * Math.PI / 180) * CELL;
  const k = Math.min(0.9, litter.slumpK * (1 + jostle * (lifting ? 2.2 : 1))); /* 上限压回历史安全值，防棋盘抖纹 */
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
  flowed = moved;
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
const SINK_RATE = 6, DIG_RATE = 8, V_CAP = 2400;     // 下沉速度、挖砂速率、铲上砂容量（格高单位）[调]
const HOVER_Y = WALL_H + 4.5;                        // 默认悬在盆口上方；按住一路沉到盆底 ≈ 13 的落差
let siftT = 0.8;                                     // 「晃一晃筛砂」提示节流
const wireMat = new THREE.MeshStandardMaterial({ color: 0xdfe3e8, metalness: 0.92, roughness: 0.22 });
const gripMat = new THREE.MeshStandardMaterial({ color: 0x8e9299, roughness: 0.7 });
let YAW = 0.55; const YAW_R = 0.55; /* 右手持：铲头朝左前，柄在右下；到盆右侧 1/4 换左手（镜像） */
let hand = 1;                       /* +1 右手 / -1 左手，带回差，不从 YAW 反推（贴壁时 YAW 会转到 ±π/2、π） */
const angLerp = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t; /* 走最短弧，跨 ±π 不会绕远路 */
const scoop = new THREE.Group(); scoop.rotation.y = YAW; scene.add(scoop);
const gridToWorld = (gx, gy) => [-TRAY_W / 2 + gx * CELL, row0z < 0 ? -TRAY_D / 2 + gy * CELL : TRAY_D / 2 - gy * CELL];
const toLocal = (wx, wz) => { const dx = wx - SC.px, dz = wz - SC.pz; return [dx * Math.cos(YAW) - dz * Math.sin(YAW), dx * Math.sin(YAW) + dz * Math.cos(YAW)]; };
const blade = new THREE.Group(); scoop.add(blade);
// 铲面剖面：前沿(z=-BD/2)是 0 高的平刃，FLAT_Z 之后起翘成后壁；侧壁从前沿一路爬到后壁顶
const BACK_H = 4.6, FLAT_Z = BD / 2 - 4.6;
const bladeFloorY = z => z <= FLAT_Z ? 0 : BACK_H * (1 - Math.cos((z - FLAT_Z) / (BD / 2 - FLAT_Z) * Math.PI / 2));
const bladeSideY = z => BACK_H * Math.pow(Math.max(0, Math.min(1, (z + BD / 2) / BD)), 1.35);
const backZAtY = y => FLAT_Z + Math.acos(1 - Math.min(1, y / BACK_H)) / (Math.PI / 2) * (BD / 2 - FLAT_Z);
// 两点之间生成一根杆：端点对端点，不会像手算 position+rotation 那样对不上
function rodBetween(a, b, r0, r1, mat, seg = 10) {
  const dir = new THREE.Vector3().subVectors(b, a), len = dir.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, len, seg), mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}
{
  /* 真猫砂铲是簸箕形，不是一块平网：平底 → 后半段起翘成后壁，两侧起壁，只有前沿是开口的平刃。
     钢丝顺着「底 + 后壁」一根根弯上去（缝隙仍沿 x 方向，筛砂逻辑不变）。 */
  const NZ = 18;
  for (let i = 0; i < BARS; i++) {
    const x = -BW / 2 + (i + 0.5) * (BW / BARS), wp = [];
    for (let k = 0; k <= NZ; k++) { const z = -BD / 2 + BD * k / NZ; wp.push(new THREE.Vector3(x, bladeFloorY(z), z)); }
    const w = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wp), 26, WIRE * 0.85, 6, false), wireMat);
    w.castShadow = true; blade.add(w);
  }
  // 外框：前沿平刃 → 右侧上沿一路爬高 → 后壁顶 → 左侧下来，一根闭合钢丝
  const pts = [];
  pts.push(new THREE.Vector3(-BW / 2 + 1.1, 0, -BD / 2), new THREE.Vector3(BW / 2 - 1.1, 0, -BD / 2));
  for (let k = 1; k <= NZ; k++) { const z = -BD / 2 + BD * k / NZ; pts.push(new THREE.Vector3(BW / 2, bladeSideY(z), z)); }
  pts.push(new THREE.Vector3(BW / 2 - 1.1, BACK_H, BD / 2), new THREE.Vector3(-BW / 2 + 1.1, BACK_H, BD / 2));
  for (let k = NZ; k >= 1; k--) { const z = -BD / 2 + BD * k / NZ; pts.push(new THREE.Vector3(-BW / 2, bladeSideY(z), z)); }
  const frame = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 190, WIRE, 8, true), wireMat); frame.castShadow = true; blade.add(frame);
  // 侧壁竖丝：底边 → 侧上沿
  for (const sx of [-BW / 2, BW / 2]) for (let k = 1; k <= 5; k++) {
    const z = -BD / 2 + BD * k / 6, y0 = bladeFloorY(z), y1 = bladeSideY(z);
    if (y1 - y0 < 0.35) continue;
    const s = rodBetween(new THREE.Vector3(sx, y0, z), new THREE.Vector3(sx, y1, z), WIRE * 0.7, WIRE * 0.7, wireMat, 6); s.castShadow = true; blade.add(s);
  }
  // 后壁横丝
  for (const yy of [BACK_H * 0.42, BACK_H * 0.78]) {
    const z = backZAtY(yy);
    blade.add(rodBetween(new THREE.Vector3(-BW / 2, yy, z), new THREE.Vector3(BW / 2, yy, z), WIRE * 0.8, WIRE * 0.8, wireMat, 8));
  }
  /* 杆：必须挂在 blade 上（挂 scoop 的话铲面一倾斜杆不跟着转，就脱开了），
     且用两点连接生成，端点对端点焊死，不靠手算 position+rotation 去凑。
     从后壁顶接出去，抬到 ~45°：杆太平的话贴墙下铲时整根会从盆壁里穿出去。 */
  const P0 = new THREE.Vector3(0, BACK_H - 0.35, BD / 2 - 0.35);  // 焊在后壁顶
  const P1 = new THREE.Vector3(0, BACK_H + 2.2, BD / 2 + 2.0);    // 折弯处（金属→塑料握把）
  const P2 = new THREE.Vector3(0, BACK_H + 7.5, BD / 2 + 6.8);    // 握把末端
  const neck = rodBetween(P0, P1, WIRE * 1.15, WIRE * 1.3, wireMat, 10); neck.castShadow = true; blade.add(neck);
  const grip = rodBetween(P1, P2, 0.62, 0.78, gripMat, 16); grip.castShadow = true; blade.add(grip);
  const dir = new THREE.Vector3().subVectors(P2, P1).normalize();
  const ferrule = rodBetween(P1.clone().addScaledVector(dir, -0.55), P1.clone().addScaledVector(dir, 1.1), 0.5, 0.62, wireMat, 14); blade.add(ferrule); /* 接头套管，盖住金属杆插进握把的那一截 */
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.78, 14, 10), gripMat); cap.position.copy(P2); cap.scale.y = 0.7; cap.castShadow = true; blade.add(cap);
  const hole = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.16, 8, 18), gripMat); hole.position.copy(P2).addScaledVector(dir, 0.55); hole.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir); blade.add(hole); /* 挂钩孔 */
}
const pileGeo = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2); { const p = pileGeo.attributes.position; for (let i = 0; i < p.count; i++) { const k = 1 + (Math.random() - 0.5) * 0.12; p.setXYZ(i, p.getX(i) * k, p.getY(i), p.getZ(i) * k); } pileGeo.computeVertexNormals(); }
const pileMat = new THREE.MeshStandardMaterial({ color: litter.color, roughness: 1, normalMap: sandMat.normalMap, normalScale: new THREE.Vector2(0.8, 0.8) });
const pile = new THREE.Mesh(pileGeo, pileMat); pile.castShadow = true; pile.position.y = 0.05; blade.add(pile);
// 铲上那堆也要是一粒一粒的：在半球壳上撒一层颗粒，跟着 fill 一起缩放
const HEAP = 380;
const heapU = new Float32Array(HEAP * 3), heapRot = new Float32Array(HEAP * 3), heapS = new Float32Array(HEAP);
const heapDummy = new THREE.Object3D(); let heapMesh = null;
function buildHeap() {
  if (heapMesh) { blade.remove(heapMesh); heapMesh.geometry.dispose(); heapMesh.material.dispose(); heapMesh.dispose(); }
  heapMesh = new THREE.InstancedMesh(pelGeometry(litter), new THREE.MeshStandardMaterial({ color: litter.color, roughness: litter.rough, flatShading: true }), HEAP);
  heapMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); heapMesh.castShadow = true; heapMesh.frustumCulled = false; blade.add(heapMesh);
  const col = new THREE.Color();
  for (let i = 0; i < HEAP; i++) {
    // 半球壳上均匀取点，往里收一点让它有厚度
    const u = Math.random() * 2 - 1, ph = Math.random() * 6.283, rr = Math.sqrt(1 - u * u), rad = 0.97 + Math.random() * 0.12; /* 撒在壳外侧：撒进去的会被不透明的 pile 挡住，白画 */
    heapU[i * 3] = rr * Math.cos(ph) * rad; heapU[i * 3 + 1] = Math.abs(u) * rad; heapU[i * 3 + 2] = rr * Math.sin(ph) * rad;
    heapRot[i * 3] = Math.random() * 6.283; heapRot[i * 3 + 1] = Math.random() * 6.283; heapRot[i * 3 + 2] = Math.random() * 6.283;
    heapS[i] = 0.7 + Math.random() * 0.55; if (Math.random() < 0.2) heapS[i] *= 0.45;
    const k = 0.84 + Math.random() * 0.3; col.setRGB(k, k, k); heapMesh.setColorAt(i, col);
  }
  if (heapMesh.instanceColor) heapMesh.instanceColor.needsUpdate = true;
}
let heapLast = -1;
function updateHeap(fill) {
  if (!heapMesh) return;
  heapMesh.visible = fill > 0.01; if (!heapMesh.visible) return;
  const sx = pile.scale.x, sy = pile.scale.y, sz = pile.scale.z;
  if (Math.abs(sy - heapLast) < 1e-3) return; /* 只有堆的大小变了才要重算+重传 */
  heapLast = sy;
  for (let i = 0; i < HEAP; i++) {
    heapDummy.position.set(heapU[i * 3] * sx, 0.05 + heapU[i * 3 + 1] * sy, heapU[i * 3 + 2] * sz);
    heapDummy.rotation.set(heapRot[i * 3], heapRot[i * 3 + 1], heapRot[i * 3 + 2]);
    heapDummy.scale.setScalar(heapS[i]); heapDummy.updateMatrix(); heapMesh.setMatrixAt(i, heapDummy.matrix);
  }
  heapMesh.instanceMatrix.needsUpdate = true;
}
const SC = { state: 'hover', V: 0, held: [], px: 0, pz: 0, vx: 0, vz: 0, tilt: 0, floor: 0, wasted: 0, y: 0, shake: 0, digCaught: false, overWall: false, steep: 0 };
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
// 刮黏底尿块：碎屑从铲刃前沿溅开（顺着刮的方向）
function scrapeBurst(c) {
  const sp = Math.hypot(SC.vx, SC.vz) || 1, ux = SC.vx / sp, uz = SC.vz / sp;
  for (let k = 0; k < 14; k++) {
    const i = pHead; pHead = (pHead + 1) % PMAX;
    pPos[i * 3] = c.x + (Math.random() - 0.5) * c.r * 1.6; pPos[i * 3 + 1] = c.y0 + c.r * 0.5 + Math.random(); pPos[i * 3 + 2] = c.z + (Math.random() - 0.5) * c.r * 1.6;
    pVel[i * 3] = ux * (6 + Math.random() * 10) + (Math.random() - 0.5) * 7; pVel[i * 3 + 1] = 4 + Math.random() * 7; pVel[i * 3 + 2] = uz * (6 + Math.random() * 10) + (Math.random() - 0.5) * 7;
    pAmt[i] = 0.05; pAlive[i] = 1;
  }
}
function updateParticles(dt) {
  let any = false;
  for (let i = 0; i < PMAX; i++) {
    if (!pAlive[i]) continue; any = true;
    pVel[i * 3 + 1] -= 60 * dt;
    const x = pPos[i * 3] += pVel[i * 3] * dt, y = pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt, z = pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
    if (Math.abs(x) <= TRAY_W / 2 && Math.abs(z) <= TRAY_D / 2) { const [gx, gy] = worldToGrid(x, z); const ci = gi(Math.round(gx), Math.round(gy)); if (y <= h[ci] + 0.12) { if (litter.bounce > 0 && pVel[i * 3 + 1] < -7) { pPos[i * 3 + 1] = h[ci] + 0.13; pVel[i * 3 + 1] *= -litter.bounce; pVel[i * 3] += (Math.random() - 0.5) * 6 * litter.bounce; pVel[i * 3 + 2] += (Math.random() - 0.5) * 6 * litter.bounce; continue; } const a = pAmt[i]; const cx = Math.round(gx), cy = Math.round(gy); h[ci] += a * 0.4; if (cx > 0) h[ci - 1] += a * 0.15; if (cx < N - 1) h[ci + 1] += a * 0.15; if (cy > 0) h[ci - N] += a * 0.15; if (cy < N - 1) h[ci + N] += a * 0.15; dirty = true; pAlive[i] = 0; pPos[i * 3 + 1] = -100; continue; } }
    else if (y <= -0.9
      || (y < TOI_RIM && Math.hypot(x - toilet.position.x, z - toilet.position.z) < TOI_R)
      || (y < BAG_TOP && Math.hypot(x - bag.position.x, z - bag.position.z) < BAG_R)) { pAlive[i] = 0; pPos[i * 3 + 1] = -100; continue; } /* 倒进容器里的砂别穿过去 */
  }
  if (any) pGeo.attributes.position.needsUpdate = true;
}
function bladeCells(pad = 0) { const out = []; const [gx0, gy0] = worldToGrid(SC.px, SC.pz); const dEff = BD * Math.max(0.3, Math.cos(SC.tilt)); /* 铲面立起来，吃砂的面积变窄 */ const R = (Math.hypot(BW, dEff) / 2 + pad) / CELL; for (let y = Math.max(0, Math.floor(gy0 - R)); y <= Math.min(N - 1, Math.ceil(gy0 + R)); y++) for (let x = Math.max(0, Math.floor(gx0 - R)); x <= Math.min(N - 1, Math.ceil(gx0 + R)); x++) { const [wx, wz] = gridToWorld(x, y); const [lx, lz] = toLocal(wx, wz); const u = lx / (BW / 2 + pad), v = (lz + (BD - dEff) / 2) / (dEff / 2 + pad); /* 以前沿为准往后缩 */ if (Math.abs(u) > 1 || Math.abs(v) > 1) continue; if (Math.max(Math.abs(u), Math.abs(v)) > 0.8 && u * u + v * v > 1.1) continue; out.push(gi(x, y)); } return out; }
function scoopDig(dt) {
  const cells = bladeCells(); if (!cells.length) return;
  let removed = 0; const room = V_CAP - SC.V;
  for (const i of cells) { const target = Math.max(SC.floor, 0.05); if (h[i] > target) { const take = Math.min(h[i] - target, DIG_RATE * dt, Math.max(0, room - removed) / cells.length * 4); h[i] -= take; removed += take; } }
  if (removed > 0) { SC.V += removed * 0.78; dirty = true;
    const inner = new Set(cells); const ring = bladeCells(1.4).filter(i => !inner.has(i));
    const per = removed * 0.22 / Math.max(1, ring.length); for (const i of ring) h[i] += per;
  }
  // 黏在盆底的尿块：铲刃贴到底 + 横向拉过去才算刮一下，要刮好几下才松
  for (const c of clumps) {
    if (!c.stick) continue;
    const [lx, lz] = toLocal(c.x, c.z);
    /* 提示节流和刮擦冷却分开两个计时器：共用会把「使劲刮」提示后紧接着的第一下真刮吃掉 */
    c.scrapeCd = Math.max(0, (c.scrapeCd || 0) - dt); c.msgCd = Math.max(0, (c.msgCd || 0) - dt);
    if (Math.abs(lx) > BW / 2 + 0.5 || Math.abs(lz) > BD / 2 + 0.5) continue;
    const atFloor = SC.floor <= c.y0 + c.r * 0.3;      /* 铲刃真的探到饼底那一层 */
    const speed = Math.hypot(SC.vx, SC.vz);
    if (!atFloor) { if (!c.msgCd) { DISP.msg = '砂还没清干净，铲不到底'; c.msgCd = 0.5; } continue; }
    if (speed < 14) { if (!c.msgCd) { DISP.msg = '黏死在盆底了，得使劲刮'; c.msgCd = 0.5; } continue; }
    if (c.scrapeCd > 0) continue;
    c.stick--; c.scrapeCd = 0.3; SC.shake = Math.min(1, SC.shake + 0.4);
    scrapeBurst(c);
    brush(c.x, c.z, c.r * 1.3, 0.16, (i, a) => { floorTint[i] = Math.max(0, floorTint[i] - a); }); /* 刮一下，底上的黄印淡一点 */
    if (c.cake) c.cake.scale.multiplyScalar(0.94);
    if (c.stick <= 0) { c.stick = 0; DISP.msg = '刮松了！可以端起来了'; if (c.cake) c.cake.material.color.multiplyScalar(1.06); }
    else DISP.msg = `刮下来一点，还黏着（再刮 ${c.stick} 下）`;
  }
  if (SC.digCaught) return; /* 一次铲入最多端起一坨；端着可以再铲下一坨 */
  let best = null, bd = 1e9;
  for (const c of clumps) { if (c.stick > 0) continue; const [lx, lz] = toLocal(c.x, c.z); if (Math.abs(lx) > BW / 2 - 0.5 || Math.abs(lz) > BD / 2 - 0.5) continue; const under = c.buried ? SC.floor <= c.y0 + c.r * 0.45 : SC.floor <= c.mesh.position.y - 0.2; if (!under) continue; const d = lx * lx + lz * lz; if (d < bd) { bd = d; best = c; } }
  if (best) {
    const c = best; const [lx, lz] = toLocal(c.x, c.z); const k = clumps.indexOf(c);
    SC.digCaught = true; clumps.splice(k, 1); clumpGroup.remove(c.mesh);
    const T = POOP_TYPES[c.type]; const holder = new THREE.Group();
    if (c.buried && litter.clumping && !c.wasStuck) { const ball = new THREE.Mesh(sandBall(c.r * 0.95, T.shape === 'none' ? 0.9 : 1), ballMat()); ball.castShadow = true; holder.add(ball); c.ball = ball; c.mesh.position.set(0, c.r * 0.15, 0); holder.add(c.mesh); }
    else if (c.buried) { c.mesh.position.set(0, 0, 0); holder.add(c.mesh); }
    else { c.mesh.position.set(0, 0, 0); holder.add(c.mesh); if (T.stain) stainAt(c.x, c.z, c.r * 1.6, 0.35); }
    c.yOff = 0.35 + c.r * (c.wasStuck ? 0.4 : c.buried ? 0.8 : 0.3); /* 扁饼比砂球薄，按饼厚放，别飘在钢丝上方 */
    holder.position.set(lx + (Math.random() - 0.5), bladeFloorY(lz) + c.yOff, lz); blade.add(holder); c.holder = holder; c.p = { x: holder.position.x, z: lz, vx: 0, vz: 0 }; SC.held.push(c);
    SC.last = T.name; if (T.stain && c.buried) { brush(c.x, c.z, c.r * 1.4, 0.3, (i, a) => { tint[i] = Math.max(0, tint[i] - a); }); }
  }
}
// 防穿模兜底：后沿两角和整根杆，只要横向落在盆壁那圈环里，就必须高过翻边；
// 差多少就把铲口抬多少（连 SC.floor 一起抬，不然会变成悬空削砂）。
// 正常情况靠 SC.steep 立起来就够了，这里只兜角度不够的余量。
const WALL_PROBES = [[-BW / 2, BACK_H, BD / 2], [BW / 2, BACK_H, BD / 2], [-BW / 2, 0, FLAT_Z], [BW / 2, 0, FLAT_Z],
  [0, BACK_H + 2.2, BD / 2 + 2.0], [0, BACK_H + 4.9, BD / 2 + 4.4], [0, BACK_H + 7.5, BD / 2 + 6.8]]; /* 后壁两角、底后两角、整根杆 */
function wallClearLift(t) {
  const ct = Math.cos(t), st = Math.sin(t), cy = Math.cos(YAW), sy = Math.sin(YAW);
  let need = 0;
  for (const [lx, py, pz] of WALL_PROBES) {
    const ly = py * ct - pz * st - st * BD / 2;                 /* blade 绕前沿转 + 位移补偿后的高度 */
    const lz = py * st + pz * ct - (1 - ct) * BD / 2;
    const wx = SC.px + lx * cy + lz * sy, wz = SC.pz - lx * sy + lz * cy;
    const inInner = Math.abs(wx) <= TRAY_W / 2 - 0.3 && Math.abs(wz) <= TRAY_D / 2 - 0.3;
    const inRing = !inInner && Math.abs(wx) <= TRAY_W / 2 + WALL + 3.4 && Math.abs(wz) <= TRAY_D / 2 + WALL + 3.4;
    if (inRing) need = Math.max(need, WALL_H + 1.4 - (SC.y + ly)); /* 翻边顶在 WALL_H+0.9 */
  }
  return need;
}
function updateScoop(dt) {
  if (tool !== 'scoop') { scoop.visible = false; return; }
  if (!hit && !DUMP.on) { scoop.visible = false; return; } /* 还没动过鼠标：别把铲子摆在盆中央半埋着 */
  scoop.visible = true;
  if (DUMP.on) { /* 倒的过程接管铲子，鼠标先别管 */
    dumpStep(dt);
    SC.y = Math.max(SC.y, objClearY(SC.px, SC.pz)); /* 飞过去的路上也别蹭到容器 */
    scoop.position.set(SC.px, SC.y, SC.pz);
    blade.rotation.x = SC.tilt;
    blade.position.set(0, Math.sin(-blade.rotation.x) * BD * 0.5, -(1 - Math.cos(blade.rotation.x)) * BD * 0.5);
    const f0 = Math.min(1, SC.V / V_CAP); pile.visible = f0 > 0.01; pile.scale.set(BW * 0.42 * (0.55 + f0 * 0.45), 0.6 + f0 * 1.9, BD * 0.42 * (0.55 + f0 * 0.45)); updateHeap(f0);
    return;
  }
  if (!hit) return;
  let tx = Math.max(-TRAY_W / 2 - 30, Math.min(TRAY_W / 2 + 40, hit.x)), tz = Math.max(-TRAY_D / 2 - 30, Math.min(TRAY_D / 2 + 30, hit.z));
  /* 马桶水箱是实心的、又高得飞不过去：横向挡在它前面，别让铲子钻进去 */
  if (Math.abs(tx - toilet.position.x) < 9 && tz < toilet.position.z - 3.5) tz = toilet.position.z - 3.5;
  const nx = SC.px + (tx - SC.px) * Math.min(1, dt * 18), nz = SC.pz + (tz - SC.pz) * Math.min(1, dt * 18);
  SC.vx = (nx - SC.px) / Math.max(dt, 1e-3); SC.vz = (nz - SC.pz) / Math.max(dt, 1e-3); SC.px = nx; SC.pz = nz;
  const outsideAll = Math.abs(SC.px) > TRAY_W / 2 + WALL + 4 || Math.abs(SC.pz) > TRAY_D / 2 + WALL + 4; /* 整把铲在盆外的地上 */
  // 手：默认右手斜握；到盆右侧 1/4 换左手（带 4 的回差，别在线上抖）
  if (hand > 0 && SC.px > TRAY_W / 4) hand = -1; else if (hand < 0 && SC.px < TRAY_W / 4 - 4) hand = 1;
  // 贴壁：背贴着最近那面壁，铲口朝盆中心往里推（靠左壁 → 口朝右；铲口方向 = -(sinYAW, cosYAW)）
  let wYaw = 0, wD = 1e9;
  for (const [d, y] of [[TRAY_W / 2 - SC.px, Math.PI / 2], [TRAY_W / 2 + SC.px, -Math.PI / 2], [TRAY_D / 2 - SC.pz, 0], [TRAY_D / 2 + SC.pz, Math.PI]]) if (d < wD) { wD = d; wYaw = y; }
  const near = outsideAll ? 0 : Math.min(1, Math.max(0, (BD * 0.95 - Math.max(0, wD)) / (BD * 0.75)));
  const yawTarget = angLerp(hand * YAW_R, wYaw + hand * 0.3, near); /* 贴上了也留一点手腕角度，不是垂直机器 */
  YAW = angLerp(YAW, yawTarget, Math.min(1, dt * 7)); scoop.rotation.y = YAW;
  const speed = Math.hypot(SC.vx, SC.vz); SC.shake = SC.shake * 0.85 + Math.min(1, speed / 45) * 0.15;
  const [gx, gy] = worldToGrid(SC.px, SC.pz);
  // 铲面四角任一角压到盆壁或盆外 → 抬到盆沿以上，不能铲（碰撞）
  SC.overWall = false; let overhang = 0;
  for (const [cx, cz] of [[-BW / 2, -BD / 2], [BW / 2, -BD / 2], [-BW / 2, BD / 2], [BW / 2, BD / 2]]) { const wx = SC.px + cx * Math.cos(YAW) + cz * Math.sin(YAW), wz = SC.pz - cx * Math.sin(YAW) + cz * Math.cos(YAW); const ox = Math.abs(wx) - (TRAY_W / 2 - 0.8), oz = Math.abs(wz) - (TRAY_D / 2 - 0.8); if (ox > 0 || oz > 0) { SC.overWall = true; overhang = Math.max(overhang, ox, oz); } }
  /* 铲刃前沿中点在盆里就能铲：靠边时铲面立起来往前推 */
  const fx = SC.px + (-BD / 2 + 1.2) * Math.sin(YAW), fz = SC.pz + (-BD / 2 + 1.2) * Math.cos(YAW);
  /* 铲口在盆里 + 铲子中心别整个跑到壁外（不然贴壁时会站在盆沿上隔空削砂、还穿模进壁体） */
  const inside = Math.abs(fx) <= TRAY_W / 2 - 0.6 && Math.abs(fz) <= TRAY_D / 2 - 0.6
    && Math.abs(SC.px) <= TRAY_W / 2 + 0.8 && Math.abs(SC.pz) <= TRAY_D / 2 + 0.8;
  /* 靠墙就立起来：铲口朝内、杆朝墙，越贴墙杆越会撞壁 —— 用角度换深度，
     站得越竖，杆越是往上翘出盆外，铲面才能贴着壁一直挖到底。near 就是贴壁程度 */
  SC.steep = Math.min(1, Math.max(overhang / (BD * 0.8), near));
  const hs = inside ? h[gi(Math.max(0, Math.min(N - 1, Math.round(gx))), Math.max(0, Math.min(N - 1, Math.round(gy))))] : BASE_H;
  if (pressing && outsideAll) { /* 地上铲：贴地，捡散落的 */
    SC.state = 'floor'; SC.y += (0.9 - SC.y) * Math.min(1, dt * 10); SC.tilt += (-0.12 - SC.tilt) * Math.min(1, dt * 8);
    if (!SC.digCaught) for (let k = loose.length - 1; k >= 0; k--) { const c = loose[k]; const [lx, lz] = toLocal(c.holder.position.x, c.holder.position.z); if (Math.abs(lx) > BW / 2 - 0.5 || Math.abs(lz) > BD / 2 - 0.5) continue; loose.splice(k, 1); scene.remove(c.holder); blade.add(c.holder); c.yOff = 0.35 + c.r * 0.3; c.holder.position.set(lx, bladeFloorY(lz) + c.yOff, lz); c.holder.rotation.set(0, 0, 0); c.p = { x: lx, z: lz, vx: 0, vz: 0 }; SC.held.push(c); SC.digCaught = true; SC.last = POOP_TYPES[c.type].name; DISP.msg = '从地上铲起来了'; break; }
  } else if (pressing && inside) {
    /* 从当前高度开始往下扎：入砂前落得快，入砂后砂有阻力、铲上越满越沉不动，一直按住就一路沉到盆底 */
    if (SC.state !== 'dig') { SC.state = 'dig'; SC.floor = Math.max(hs, SC.y - 0.3); SC.hitBottom = false; }
    const above = SC.floor > hs + 0.2;
    SC.floor = Math.max(0.12, SC.floor - SINK_RATE * (above ? 2.2 : 1 - 0.45 * (SC.V / V_CAP)) * dt);
    const tTilt = -0.28 - SC.steep * 0.95; /* 越靠墙越竖，最多约 70° */
    /* SC.y 就是铲口高度（blade.position.y 已经把绕前沿转的位移抵掉了），别再加一次 sin 补偿 */
    SC.y += ((SC.floor + 0.3) - SC.y) * Math.min(1, dt * 14); SC.tilt += (tTilt - SC.tilt) * Math.min(1, dt * 8);
    const lift = wallClearLift(SC.tilt); if (lift > 0) { SC.floor += lift; SC.y += lift; } /* 立起来还不够就抬，别让杆插进盆壁 */
    if (!SC.hitBottom && SC.floor <= 0.2) { SC.hitBottom = true; DISP.msg = '铲到盆底了 —— 横着拉可以刮底'; }
    scoopDig(dt);
  } else {
    SC.state = (SC.V > 1 || SC.held.length) ? 'carry' : 'hover';
    /* 松手就抬回盆口上方：默认铲子是悬在盆之上的，看得见它往下扎的那段行程 */
    /* 悬停高度取三者最高：盆口上方 / 地面 / 袋子马桶顶上 —— 移到容器上方会自己抬起来，不再穿过去 */
    const ty = Math.max(objClearY(SC.px, SC.pz), outsideAll ? 3.5 + (SC.state === 'carry' ? 1 : 0) : HOVER_Y + (SC.state === 'carry' ? 1.5 : 0));
    SC.y += (ty - SC.y) * Math.min(1, dt * 8); SC.tilt += ((SC.state === 'carry' ? 0.2 : -0.06) - SC.tilt) * Math.min(1, dt * 6); /* 端着自然往后仰，东西靠柄那边 */
    if (litter.crumble && SC.shake > 0.45) for (const c of SC.held) if (c.ball && c.ball.scale.x > 0.72) { c.ball.scale.multiplyScalar(1 - dt * litter.crumble * SC.shake * 0.6); SC.V += 0.4; spawnLeak(2, 0.2); }
    /* 筛砂：铲起来是满满一铲（砂+结块+屎），端着不动几乎不漏，得左右晃着筛，松砂才从钢丝缝里掉下去，屎和结块留在条上 */
    if (SC.V > 0.5) { const rate = litter.leak * (0.05 + 5.5 * SC.shake); const dV = Math.min(SC.V, SC.V * rate * dt + 0.08 * dt * litter.leak); SC.V -= dV; const n = Math.min(240, Math.max(1, Math.round(dV / 1.1))); spawnLeak(n, dV / n); } /* 粒数上限太低会让单粒砂量过大，落点戳出一根针 */
    if (SC.V > V_CAP * 0.25 && SC.shake < 0.12) { siftT -= dt; if (siftT <= 0) { DISP.msg = '满满一铲，左右晃一晃把猫砂筛下去'; siftT = 2.2; } } else if (SC.V < V_CAP * 0.08) siftT = 0.8;
  }
  SC.y = Math.max(SC.y, objClearY(SC.px, SC.pz)); /* 兜底：按住往下沉时也不许沉进容器里 */
  scoop.position.set(SC.px, SC.y, SC.pz); blade.rotation.x = SC.tilt + Math.sin(performance.now() / 40) * SC.shake * 0.05;
  blade.position.set(0, Math.sin(-blade.rotation.x) * BD * 0.5, -(1 - Math.cos(blade.rotation.x)) * BD * 0.5); /* 绕前沿转：前沿贴砂，柄抬高 */
  const fill = Math.min(1, SC.V / V_CAP); pile.visible = fill > 0.01; pile.scale.set(BW * 0.42 * (0.55 + fill * 0.45), 0.6 + fill * 1.9, BD * 0.42 * (0.55 + fill * 0.45)); updateHeap(fill);
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
const DISP = { bag: 0, flushed: 0, clogged: 0, flushT: 0, clogT: 0, msg: '', dropped: 0 };
// ---------- 铲上的屎会滚、会掉 ----------
// 铲面倾角 + 铲子加速度的假力推着它在条上滚；撞框边弹一下；速度太大或倾太多就翻过框掉出去
const fallen = [], loose = []; const tmpW = new THREE.Vector3();
let prevVx = 0, prevVz = 0;
function updateHeld(dt) {
  const ax = (SC.vx - prevVx) / Math.max(dt, 1e-3), az = (SC.vz - prevVz) / Math.max(dt, 1e-3); prevVx = SC.vx; prevVz = SC.vz;
  const lax = -(ax * Math.cos(YAW) - az * Math.sin(YAW)) * 0.3, laz = -(ax * Math.sin(YAW) + az * Math.cos(YAW)) * 0.22; /* 假力：铲子往前加速，屎往后滑 */
  const t = blade.rotation.x; const gz = 60 * Math.sin(t); /* 铲面倾角带来的滑动加速度（+z 是柄那边） */
  for (let k = SC.held.length - 1; k >= 0; k--) {
    const c = SC.held[k], q = c.p; if (!q) continue;
    const grip = c.buried && litter.clumping ? 3.5 : 2.0; /* 结团砂壳粗糙，滚得慢；光屎滚得快 */
    q.vx += (lax - q.vx * grip) * dt; q.vz += (gz + laz - q.vz * grip) * dt;
    q.x += q.vx * dt; q.z += q.vz * dt;
    const limX = BW / 2 - c.r * 0.55, limZ = BD / 2 - c.r * 0.55; let off = false;
    /* 簸箕形：两侧和后面都是壁，只有前沿是开口的 —— 侧面要甩得非常狠才翻得出去，后面翻不出去 */
    if (Math.abs(q.x) > limX) { if (Math.abs(q.vx) > 52) off = true; else { q.x = Math.sign(q.x) * limX; q.vx *= -0.4; } }
    if (q.z > limZ) { q.z = limZ; q.vz *= -0.35; }                       /* 后壁：挡住 */
    else if (q.z < -limZ) { const blocked = SC.state === 'dig';          /* 铲砂时前面被砂堵着 */
      if (!blocked && (Math.abs(q.vz) > 42 || t < -0.95)) off = true; else { q.z = -limZ; q.vz *= -0.3; } }
    /* 铲底是弯的（后半段翘起来成后壁）：屎滑到哪儿，就得坐在那个位置的铲底上。
       只改 x/z 不改 y 的话，往后滑就会沉到钢丝下面去 —— 屎一律不漏下去 */
    c.holder.position.x = q.x; c.holder.position.z = q.z; c.holder.position.y = bladeFloorY(q.z) + (c.yOff || 0.9);
    c.holder.rotation.x -= q.vz * dt / Math.max(0.8, c.r); c.holder.rotation.z += q.vx * dt / Math.max(0.8, c.r); /* 滚动 */
    if (off) { /* 掉出去：转成世界坐标自由落体 */
      tmpW.set(q.x, c.holder.position.y, q.z); blade.localToWorld(tmpW);
      /* 局部速度要先过铲面倾角再过 yaw：只转 yaw 的话，倒垃圾翻到 89° 时「顺着铲面往下滑」会被当成水平速度甩出去 */
      const wv = new THREE.Vector3(q.vx, 0, q.vz).applyAxisAngle(new THREE.Vector3(1, 0, 0), t).applyAxisAngle(new THREE.Vector3(0, 1, 0), YAW);
      blade.remove(c.holder); scene.add(c.holder); c.holder.position.copy(tmpW);
      fallen.push({ c, v: wv.add(new THREE.Vector3(SC.vx * 0.3, 1.5, SC.vz * 0.3)) }); SC.held.splice(k, 1); c.p = null; DISP.msg = '掉了一坨';
    }
  }
}
function updateFallen(dt) {
  for (let k = fallen.length - 1; k >= 0; k--) {
    const f = fallen[k], m = f.c.holder; f.v.y -= 60 * dt; m.position.addScaledVector(f.v, dt); m.rotation.x += f.v.z * dt * 0.5; m.rotation.z -= f.v.x * dt * 0.5;
    const inside = Math.abs(m.position.x) <= TRAY_W / 2 - 1 && Math.abs(m.position.z) <= TRAY_D / 2 - 1;
    const onRim = !inside && Math.abs(m.position.x) <= TRAY_W / 2 + WALL + 3 && Math.abs(m.position.z) <= TRAY_D / 2 + WALL + 3;
    let ground = 0; if (inside) { const [gx, gy] = worldToGrid(m.position.x, m.position.z); ground = h[gi(Math.max(0, Math.min(N - 1, Math.round(gx))), Math.max(0, Math.min(N - 1, Math.round(gy))))]; }
    if (onRim && m.position.y <= WALL_H + f.c.r * 0.4 && m.position.y > 2) { /* 砸到盆沿：弹一下往里或往外滚，不停在沿上 */
      const ox = Math.abs(m.position.x) - TRAY_W / 2, oz = Math.abs(m.position.z) - TRAY_D / 2; const outward = Math.max(ox, oz) > WALL * 0.5;
      const dirx = (ox > oz ? Math.sign(m.position.x) : 0) * (outward ? 1 : -1), dirz = (oz >= ox ? Math.sign(m.position.z) : 0) * (outward ? 1 : -1);
      f.v.x = dirx * 9 + (Math.random() - 0.5) * 3; f.v.z = dirz * 9 + (Math.random() - 0.5) * 3; f.v.y = 4; m.position.y = WALL_H + f.c.r * 0.4 + 0.05; continue;
    }
    const sw = swallow(m); /* 掉进袋子/马桶 */
    if (sw) { fallen.splice(k, 1); scene.remove(m); swallowClump(sw, f.c); continue; }
    if (m.position.y <= ground + f.c.r * 0.3) {
      fallen.splice(k, 1); const c = f.c; scene.remove(m);
      if (inside) { /* 回到砂上：变成一坨露在外面的 */ c.buried = false; c.x = m.position.x; c.z = m.position.z; c.mesh.position.set(0, 0, 0); c.mesh.rotation.set(0, Math.random() * 6.28, 0); if (c.ball) { c.mesh.position.y = 0; } clumpGroup.add(m); m.position.set(c.x, ground, c.z); m.rotation.set(0, 0, 0); c.mesh = m; c.holder = null; clumps.push(c); DISP.msg = '掉回砂上了'; }
      else { m.position.y = ground + c.r * 0.3; scene.add(m); c.holder = m; loose.push(c); DISP.dropped++; DISP.msg = '掉到盆外了，去地上铲'; }
    }
  }
}
// ---------- 倒进袋子 / 马桶：飞到容器上方 → 翻过去倒 → 东西自己掉进去 ----------
const BAG_TOP = 8.5 * 1.7, BAG_R = 3.9 * 1.7, TOI_RIM = 9.9 * 2.4, TOI_R = 4.0 * 2.4;
const TANK_TOP = (12.5 + 3.5) * 2.4, TOI_BODY = 11.5, BAG_BODY = 4.6 * 1.7;
/* 铲子不能穿过袋子和马桶：横向进了它们的范围，就得抬到顶上去（+铲面半宽的余量）。
   水箱太高（38）飞不过去，改成横向挡住不让钻进去。 */
function objClearY(px, pz) {
  let need = 0;
  if (Math.hypot(px - bag.position.x, pz - bag.position.z) < BAG_BODY + BW * 0.5) need = Math.max(need, BAG_TOP + 3.2);
  if (Math.hypot(px - toilet.position.x, pz - toilet.position.z) < TOI_BODY + BW * 0.5) need = Math.max(need, TOI_RIM + 3.0);
  return need;
}
const DUMP = { on: false, tgt: null, phase: '', t: 0, had: 0 };
function startDump(where) { if (DUMP.on) return; DUMP.on = true; DUMP.tgt = where; DUMP.phase = 'to'; DUMP.t = 0; DUMP.had = 0; SC.state = 'carry'; pressing = false; }
/* SC.state 必须清掉：留在 'dig' 的话 updateHeld 会一直当「前面被砂堵着」，倒的时候一坨都掉不出来 */
/* 掉落物落进容器口 → 吞掉并记账 */
function swallow(m) {
  if (Math.hypot(m.position.x - bag.position.x, m.position.z - bag.position.z) < BAG_R && m.position.y < BAG_TOP) return 'bag';
  if (Math.hypot(m.position.x - toilet.position.x, m.position.z - toilet.position.z) < TOI_R && m.position.y < TOI_RIM) return 'toilet';
  return null;
}
function swallowClump(where, c) {
  if (where === 'bag') { DISP.bag++; DISP.msg = `${POOP_TYPES[c.type].name}进袋了`; }
  else if (!litter.flushable) { DISP.clogged++; DISP.clogT = 2.5; DISP.msg = litter.noFlush; }
  else { DISP.flushed++; DISP.flushT = 1.4; DISP.msg = `冲走了（${POOP_TYPES[c.type].name}）`; }
}
function dumpStep(dt) {
  const toBag = DUMP.tgt === 'bag';
  const TX = toBag ? bag.position.x : toilet.position.x, TZ = toBag ? bag.position.z : toilet.position.z;
  const TY = (toBag ? BAG_TOP + 6 : TOI_RIM + 5);          /* 铲子要比容器高，倒的时候东西才掉得下去 */
  DUMP.t += dt;
  const k = Math.min(1, dt * 4);
  SC.px += (TX - SC.px) * k; SC.pz += (TZ - SC.pz) * k; SC.y += (TY - SC.y) * k; SC.vx = 0; SC.vz = 0;
  if (DUMP.phase === 'to') {
    SC.tilt += (0.18 - SC.tilt) * Math.min(1, dt * 5);      /* 端平了飞过去，路上别撒 */
    if (Math.hypot(SC.px - TX, SC.pz - TZ) < 2.5 && Math.abs(SC.y - TY) < 2.5) { DUMP.phase = 'tip'; DUMP.t = 0; DUMP.had = SC.held.length; }
  } else if (DUMP.phase === 'tip') {
    SC.tilt += (-1.55 - SC.tilt) * Math.min(1, dt * 3.2);   /* 慢慢翻过去：屎顺着钢丝滑到前沿，自己掉下去 */
    if (SC.V > 0.5) { const dV = Math.min(SC.V, SC.V * 7 * dt + 8 * dt); SC.V -= dV; const n = Math.min(240, Math.max(1, Math.round(dV / 1.1))); spawnLeak(n, dV / n); SC.wasted += dV; }
    if ((!SC.held.length && SC.V < 1 && SC.tilt < -1.2) || DUMP.t > 3.5) { DUMP.phase = 'back'; DUMP.t = 0; if (!DUMP.had) DISP.msg = toBag ? '倒了一铲砂进袋' : '冲了一下'; }
    /* 用倒之前手上有几坨来判，不能用「已经落进容器几坨」—— 屎还要飞 0.5 秒才落到，那时必然还是 0 */
  } else { SC.tilt += (0.12 - SC.tilt) * Math.min(1, dt * 4); if (SC.tilt > -0.05) DUMP.on = false; }
}
// ---------- 端盆滚砂粒：挂在 trayGroup 下，在盆坐标系里顺坡滚 ----------
const RMAX = 1600;
const rPos = new Float32Array(RMAX * 3), rVel = new Float32Array(RMAX * 3), rLife = new Float32Array(RMAX), rAmt = new Float32Array(RMAX); let rHead = 0;
for (let i = 0; i < RMAX; i++) rPos[i * 3 + 1] = -100;
const rGeo = new THREE.BufferGeometry(); rGeo.setAttribute('position', new THREE.BufferAttribute(rPos, 3));
const rMat = new THREE.PointsMaterial({ color: new THREE.Color(litter.color).multiplyScalar(0.92), size: litter.pSize, sizeAttenuation: true, transparent: true, opacity: 0.95, toneMapped: false, depthWrite: false });
const rolls = new THREE.Points(rGeo, rMat); rolls.frustumCulled = false; trayGroup.add(rolls);
function killRolls() { for (let i = 0; i < RMAX; i++) { rLife[i] = 0; rPos[i * 3 + 1] = -100; } rGeo.attributes.position.needsUpdate = true; }
function updateRolls(dt) {
  const lifting = tool === 'lift';
  const drive = Math.min(1, (Math.abs(TILT.x) + Math.abs(TILT.z)) * 1.8 + SHAKE.e * 2.2);
  // 生成：砂在坍落（flowed）且盆在动，才从坡上撒粒；借的砂记账，落定还回去
  if (lifting && drive > 0.18 && flowed > 0.02) {
    const n = Math.min(30, Math.round(3 + drive * 26));
    for (let s = 0; s < n; s++) {
      const lx = (Math.random() - 0.5) * (TRAY_W - 3), lz = (Math.random() - 0.5) * (TRAY_D - 3);
      const [sx, sz] = gradAt(lx, lz); if (Math.hypot(sx, sz) < 0.22) continue; /* 平的地方不滚 */
      const i = rHead; rHead = (rHead + 1) % RMAX;
      if (rLife[i] > 0) { const px = rPos[i * 3], pz = rPos[i * 3 + 2]; const [ggx, ggy] = worldToGrid(px, pz); h[gi(Math.round(ggx), Math.round(ggy))] += rAmt[i]; } /* 被顶掉的旧粒先还砂 */
      const [ggx, ggy] = worldToGrid(lx, lz); const ci = gi(Math.round(ggx), Math.round(ggy));
      const a = Math.min(h[ci], 0.05); h[ci] -= a; rAmt[i] = a; dirty = true;
      rPos[i * 3] = lx; rPos[i * 3 + 1] = hAt(lx, lz) + 0.15; rPos[i * 3 + 2] = lz;
      rVel[i * 3] = -sx * 6 + (Math.random() - 0.5) * 3; rVel[i * 3 + 2] = -sz * 6 + (Math.random() - 0.5) * 3;
      rLife[i] = 0.8 + Math.random() * 1.2;
    }
  }
  let any = false; const damp = Math.pow(0.22, dt);
  for (let i = 0; i < RMAX; i++) {
    if (rLife[i] <= 0) continue; any = true;
    let x = rPos[i * 3], z = rPos[i * 3 + 2];
    const [sx, sz] = gradAt(x, z);
    rVel[i * 3] = (rVel[i * 3] - sx * 150 * dt) * damp;
    rVel[i * 3 + 2] = (rVel[i * 3 + 2] - sz * 150 * dt) * damp;
    x = Math.max(-TRAY_W / 2 + 0.6, Math.min(TRAY_W / 2 - 0.6, x + rVel[i * 3] * dt));
    z = Math.max(-TRAY_D / 2 + 0.6, Math.min(TRAY_D / 2 - 0.6, z + rVel[i * 3 + 2] * dt));
    rPos[i * 3] = x; rPos[i * 3 + 2] = z; rPos[i * 3 + 1] = hAt(x, z) + 0.1 + Math.random() * 0.08;
    rLife[i] -= dt;
    const slow = Math.hypot(rVel[i * 3], rVel[i * 3 + 2]) < 2.5 && Math.hypot(sx, sz) < 0.3;
    if (rLife[i] <= 0 || slow || !lifting) { /* 落定：把借的砂还到落点 */
      const [ggx, ggy] = worldToGrid(x, z); h[gi(Math.round(ggx), Math.round(ggy))] += rAmt[i]; dirty = true;
      rLife[i] = 0; rPos[i * 3 + 1] = -100;
    }
  }
  if (any) rGeo.attributes.position.needsUpdate = true;
}
// 没埋的屎跟着坡往低处滑（埋着的结在砂里不动）
function slideClumps(dt) {
  if (tool !== 'lift') return;
  const go = Math.max(0, Math.abs(TILT.x) + Math.abs(TILT.z) - 0.12) * (1 + SHAKE.e * 1.5); if (go <= 0) return;
  const dxw = -Math.tan(TILT.z), dzw = Math.tan(TILT.x); /* bias 的负梯度 = 下坡方向 */
  for (const c of clumps) {
    if (c.buried) continue;
    c.x = Math.max(-TRAY_W / 2 + c.r + 1, Math.min(TRAY_W / 2 - c.r - 1, c.x + dxw * go * 24 * dt));
    c.z = Math.max(-TRAY_D / 2 + c.r + 1, Math.min(TRAY_D / 2 - c.r - 1, c.z + dzw * go * 24 * dt));
    c.mesh.position.x = c.x; c.mesh.position.z = c.z; c.mesh.rotation.y += go * dt * 3;
  }
}
function updateLift(dt) {
  if (tool !== 'lift') { TILT.tx = 0; TILT.tz = 0; }
  const k = Math.min(1, dt * 6); const ox = TILT.x, oz = TILT.z;
  TILT.x += (TILT.tx - TILT.x) * k; TILT.z += (TILT.tz - TILT.z) * k;
  /* 晃动能量：注入 ∝ 每帧倾角变化（帧率无关），指数衰减。快速来回摇 → 砂被抖松 */
  SHAKE.e = Math.min(1, SHAKE.e * Math.pow(0.03, dt) + (Math.abs(TILT.x - ox) + Math.abs(TILT.z - oz)) * 8);
  trayY += ((tool === 'lift' ? 4 : 0) - trayY) * Math.min(1, dt * 5);
  /* 端在手上不是台钳：晃动往盆体传一点高频颤 */
  const t = performance.now() / 1000, wob = tool === 'lift' ? SHAKE.e * 0.014 : 0;
  trayGroup.rotation.set(TILT.x + Math.sin(t * 31) * wob, 0, TILT.z + Math.sin(t * 26 + 1.7) * wob);
  trayGroup.position.y = trayY;
  if (Math.abs(TILT.x - ox) > 1e-4 || Math.abs(TILT.z - oz) > 1e-4 || (tool === 'lift' && Math.abs(TILT.x) + Math.abs(TILT.z) > 0.01)) updateBias();
  if (tool !== 'lift' && Math.abs(TILT.x) + Math.abs(TILT.z) < 1e-3 && (ox !== 0 || oz !== 0)) { TILT.x = TILT.z = 0; updateBias(); }
  slideClumps(dt);
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
  if (tool === 'scoop') { const rect = cv.getBoundingClientRect(); ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1); ray.setFromCamera(ndc, camera); if (SC.V > 1 || SC.held.length) { if (ray.intersectObject(bag, true).length) { startDump('bag'); return; } if (ray.intersectObject(toilet, true).length) { startDump('toilet'); return; } } }
  if (tool === 'scoop') { SC.digCaught = false; pressing = true; cv.setPointerCapture(e.pointerId); return; }
  if (tool === 'lift') { pressing = true; liftStart = { x: e.clientX, y: e.clientY, tx: TILT.tx, tz: TILT.tz }; cv.setPointerCapture(e.pointerId); return; }
  if (inTray(hit)) { pressing = true; cv.setPointerCapture(e.pointerId); } });
let liftStart = null;
cv.addEventListener('pointermove', e => { hit = pick(e); if (tool === 'lift' && pressing && liftStart) { TILT.tz = Math.max(-0.7, Math.min(0.7, liftStart.tz - (e.clientX - liftStart.x) / 260)); TILT.tx = Math.max(-0.7, Math.min(0.7, liftStart.tx + (e.clientY - liftStart.y) / 260)); } });
cv.addEventListener('pointerup', () => { pressing = false; if (SC.state === 'dig' || SC.state === 'floor') SC.state = 'carry'; });
cv.addEventListener('pointercancel', () => { pressing = false; });
cv.addEventListener('contextmenu', e => e.preventDefault());
// 光标环
const ringGeo = new THREE.RingGeometry(0.9, 1, 48); ringGeo.rotateX(-Math.PI / 2);
cursor = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthTest: false })); cursor.renderOrder = 10; scene.add(cursor);

// UI
document.querySelectorAll('[data-litter]').forEach(b => b.onclick = () => { document.querySelectorAll('[data-litter]').forEach(x => x.classList.toggle('on', x === b)); litter = LITTERS[b.dataset.litter]; sandMat.color.set(litter.color); sandMat.roughness = litter.rough; sandMat.normalMap.dispose(); sandMat.normalMap = grainNormalTexture(litter.grain); sandMat.needsUpdate = true; pileMat.color.set(litter.color); pileMat.normalMap = sandMat.normalMap; pMat.color.set(litter.color); pMat.size = litter.pSize; rMat.color.set(litter.color).multiplyScalar(0.92); rMat.size = litter.pSize; resetSand(); buildPellets(); buildHeap(); buryByCat(4); for (const c of SC.held) blade.remove(c.holder || c.mesh); SC.held = []; SC.V = 0; });
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
resetSand(); buildPellets(); buildHeap(); buryByCat(4);
let last = performance.now(), fpsT = 0, frames = 0;
window.SAND = { h, N, litter: () => litter, slump, reset: resetSand, camera, controls, clumps, bury: buryByCat, SC, bag, toilet, DISP, loose, fallen, scene, get yaw() { return YAW; }, POOP_TYPES, CATS, setCat: k => { cat = CATS[k]; } };
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (pressing && inTray(hit) && tool !== 'scoop' && tool !== 'lift') { if (tool === 'press') press(hit.x, hit.z, brushSize, dt); else if (tool === 'pour') pour(hit.x, hit.z, brushSize, dt); else smooth(hit.x, hit.z, brushSize, dt); }
  slump(tool === 'lift' ? 4 : 2); if (tool !== 'lift') settle(0.03);
  if (dirty) { pushGeometry(); dirty = false; }
  updatePellets(); /* 紧跟 pushGeometry：颗粒和砂面网格读同一份 h，否则遇到单帧尖峰会浮起来一帧 */
  updateClumps();
  updateLift(dt); updateRolls(dt); updateScoop(dt); updateHeld(dt); updateFallen(dt); updateParticles(dt); updateDispose(dt);
  if (hit && tool !== 'scoop') { cursor.visible = inTray(hit); const [gx, gy] = worldToGrid(hit.x, hit.z); const hy = h[gi(Math.round(Math.max(0, Math.min(N - 1, gx))), Math.round(Math.max(0, Math.min(N - 1, gy))))] || 0; cursor.position.set(hit.x, hy + 0.15, hit.z); cursor.scale.setScalar(brushSize); } else cursor.visible = false;
  if (tool === 'scoop') cursor.visible = false;
  controls.update(); renderer.render(scene, camera);
  frames++; fpsT += dt; if (fpsT >= 1) { document.getElementById('fps').textContent = `${frames} fps · 铲上砂 ${Math.round(SC.V)} · 铲上 ${SC.held.length} 坨${SC.last ? '（' + SC.last + '）' : ''} · 袋里 ${DISP.bag} 坨 · 冲走 ${DISP.flushed} · 堵 ${DISP.clogged} 次 · 浪费砂 ${Math.round(SC.wasted)} · 掉地上 ${DISP.dropped}${DISP.msg ? ' · ' + DISP.msg : ''}`; frames = 0; fpsT = 0; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
