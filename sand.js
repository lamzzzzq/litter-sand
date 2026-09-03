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
  bentonite: { name: '膨润土', color: 0xd4c39c, talus: 34, grain: 1.0, rough: 0.95, slumpK: 0.35, fine: true },
  tofu:      { name: '豆腐砂', color: 0xeee5cc, talus: 38, grain: 1.6, rough: 0.9,  slumpK: 0.25, fine: false },
  crystal:   { name: '水晶砂', color: 0xe4eef2, talus: 30, grain: 2.2, rough: 0.35, slumpK: 0.45, fine: false },
  pine:      { name: '松木砂', color: 0xc8a672, talus: 36, grain: 1.8, rough: 0.85, slumpK: 0.3,  fine: false },
};
let litter = LITTERS.bentonite;
let tool = 'press', brushSize = 3;

// ---------- 渲染 ----------
const cv = document.getElementById('cv');
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x2a2118);
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 500);
camera.position.set(0, 60, 40);
const controls = new OrbitControls(camera, cv);
controls.target.set(0, 3, 0); controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minDistance = 25; controls.maxDistance = 120; controls.maxPolarAngle = Math.PI * 0.42; controls.minPolarAngle = 0.15;
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
const plastic = new THREE.MeshPhysicalMaterial({ color: 0x9fb3c8, roughness: 0.45, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.4 });
const plasticIn = new THREE.MeshPhysicalMaterial({ color: 0x8ea3b8, roughness: 0.5, metalness: 0, clearcoat: 0.2, side: THREE.BackSide });
{
  const R = 5;
  const outer = roundRectShape(TRAY_W + WALL * 2 + 2, TRAY_D + WALL * 2 + 2, R + WALL);
  const holePath = roundRectShape(TRAY_W + 0.4, TRAY_D + 0.4, R);
  outer.holes.push(new THREE.Path(holePath.getPoints(24)));
  const wall = new THREE.Mesh(new THREE.ExtrudeGeometry(outer, { depth: WALL_H, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.5, bevelSegments: 3, curveSegments: 24 }), plastic);
  wall.rotation.x = -Math.PI / 2; wall.position.y = 0; wall.castShadow = true; wall.receiveShadow = true; scene.add(wall);
  // 翻边
  const lipOuter = roundRectShape(TRAY_W + WALL * 2 + 6, TRAY_D + WALL * 2 + 6, R + WALL + 2);
  lipOuter.holes.push(new THREE.Path(roundRectShape(TRAY_W + 0.4, TRAY_D + 0.4, R).getPoints(24)));
  const lip = new THREE.Mesh(new THREE.ExtrudeGeometry(lipOuter, { depth: 1.1, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.35, bevelSegments: 2, curveSegments: 24 }), plastic);
  lip.rotation.x = -Math.PI / 2; lip.position.y = WALL_H - 0.2; lip.castShadow = true; lip.receiveShadow = true; scene.add(lip);
  // 盆底
  const floorM = new THREE.Mesh(new THREE.ExtrudeGeometry(roundRectShape(TRAY_W + WALL * 2 + 2, TRAY_D + WALL * 2 + 2, R + WALL), { depth: 1.2, bevelEnabled: false }), plastic);
  floorM.rotation.x = -Math.PI / 2; floorM.position.y = -1.2; floorM.receiveShadow = true; scene.add(floorM);
  // 内壁（反面，压暗）
  const inner = new THREE.Mesh(new THREE.ExtrudeGeometry(roundRectShape(TRAY_W + 0.4, TRAY_D + 0.4, R), { depth: WALL_H, bevelEnabled: false, curveSegments: 24 }), plasticIn);
  inner.rotation.x = -Math.PI / 2; inner.receiveShadow = true; scene.add(inner);
}
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x3b3128, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -1; ground.receiveShadow = true; scene.add(ground);

// ---------- 高度场 ----------
const h = new Float32Array(N * N), tmp = new Float32Array(N * N), jit = new Float32Array(N * N);
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
const sandMat = new THREE.MeshStandardMaterial({ color: litter.color, roughness: litter.rough, metalness: 0, normalMap: grainNormalTexture(litter.grain), normalScale: new THREE.Vector2(0.6, 0.6) });
const sand = new THREE.Mesh(sandGeo, sandMat); sand.castShadow = true; sand.receiveShadow = true; scene.add(sand);
let dirty = true;

// ---------- 结块（屎 + 砂壳）：埋在砂里，挖到就露出来 ----------
const clumps = [];
const clumpGroup = new THREE.Group(); scene.add(clumpGroup);
function lumpyGeo(r) { const g = new THREE.IcosahedronGeometry(r, 4); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const k = 1 + (Math.random() - 0.5) * 0.14; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.8, p.getZ(i) * k); } g.computeVertexNormals(); return g; }
const poopMat = new THREE.MeshStandardMaterial({ color: 0x5a3418, roughness: 0.75 });
function makeClump(r) {
  const g = new THREE.Group();
  const shellMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(litter.color).multiplyScalar(0.72), roughness: 1, normalMap: sandMat.normalMap, normalScale: new THREE.Vector2(1.2, 1.2) });
  const shell = new THREE.Mesh(lumpyGeo(r), shellMat); shell.castShadow = true; shell.receiveShadow = true; g.add(shell);
  // 露出砂壳的屎
  for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(r * (0.42 - i * 0.08), 16, 12), poopMat); b.position.set((Math.random() - 0.5) * r * 0.9, r * (0.25 + i * 0.28), (Math.random() - 0.5) * r * 0.9); b.scale.y = 0.8; b.castShadow = true; g.add(b); }
  return g;
}
function bury(x, z, depth) {
  const r = 1.6 + Math.random() * 1.2;
  const m = makeClump(r); const [gx, gy] = worldToGrid(x, z); const hs = h[gi(Math.round(gx), Math.round(gy))];
  const y0 = hs - depth - r * 1.15; // 最高的那颗屎也埋在砂面以下 depth 处
  m.position.set(x, y0, z); m.rotation.y = Math.random() * 6.28; clumpGroup.add(m);
  clumps.push({ mesh: m, x, z, r, y0 });
  brush(x, z, r * 2.6, 0.28 + depth * 0.35, (i, a) => { h[i] += a; }); // 鼓包：找的破绽 [调]
}
function buryRandom(n = 3) { for (let k = 0; k < n; k++) bury((Math.random() - 0.5) * (TRAY_W - 12), (Math.random() - 0.5) * (TRAY_D - 12), 0.4 + Math.random() * 1.2); dirty = true; }
function clearClumps() { for (const c of clumps) clumpGroup.remove(c.mesh); clumps.length = 0; }
function updateClumps() { for (const c of clumps) { const [gx, gy] = worldToGrid(c.x, c.z); const hs = h[gi(Math.round(gx), Math.round(gy))]; c.mesh.position.y = Math.min(c.y0, hs - c.r * 0.9); } } // 底下的砂被挖走就往下沉

function pushGeometry() {
  for (let i = 0; i < N * N; i++) pos.setY(i, h[i]);
  pos.needsUpdate = true; sandGeo.computeVertexNormals(); sandGeo.computeBoundingSphere();
}
// 世界坐标 → 格子
function worldToGrid(x, z) { const ix = (x + TRAY_W / 2) / TRAY_W * (N - 1); let iy = (z + TRAY_D / 2) / TRAY_D * (N - 1); if (row0z > 0) iy = (N - 1) - iy; return [ix, iy]; }

// ---------- 砂的物理 ----------
// 休止角坍落：八邻居（对角线距离 √2 格），相邻高差超过 tan(角)·距离 的部分按 slumpK 往低处流，带一点随机让堆变圆。每帧 2 遍。[调]
const NB = [[1, 0, 1], [0, 1, 1], [1, 1, Math.SQRT2], [-1, 1, Math.SQRT2]];
function slump(iter = 2) {
  const T0 = Math.tan(litter.talus * Math.PI / 180) * CELL, k = litter.slumpK;
  let moved = 0;
  for (let it = 0; it < iter; it++) {
    tmp.fill(0);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = gi(x, y), hi = h[i];
      for (const [dx, dy, dist] of NB) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || nx >= N || ny >= N) continue;
        const j = gi(nx, ny), T = T0 * dist * jit[i], d = hi - h[j];
        if (d > T) { const m = (d - T) * k * 0.25 / dist; tmp[i] -= m; tmp[j] += m; }
        else if (d < -T) { const m = (-d - T) * k * 0.25 / dist; tmp[i] += m; tmp[j] -= m; }
      }
    }
    for (let i = 0; i < h.length; i++) { if (tmp[i] !== 0) { h[i] += tmp[i]; moved += Math.abs(tmp[i]); if (h[i] < 0) h[i] = 0; } }
    if (moved < 1e-4) break;
  }
  if (moved > 1e-3) dirty = true;
}
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
  brush(cx, cz, r, 9 * dt, (i, a) => { const take = Math.min(h[i], a); h[i] -= take; removed += take; });
  if (removed > 0) { const ring = []; brush(cx, cz, r * 1.9, 1, (i, w, x, y) => { const d = Math.hypot(x - worldToGrid(cx, cz)[0], y - worldToGrid(cx, cz)[1]) * CELL; if (d > r * 0.85) ring.push(i); }); const per = removed * 0.4 / Math.max(1, ring.length); for (const i of ring) h[i] += per; }
}
function pour(cx, cz, r, dt) { const jx = (Math.random() - 0.5) * r * 0.6, jz = (Math.random() - 0.5) * r * 0.6; brush(cx + jx, cz + jz, r * 0.7, 9 * dt, (i, a) => { h[i] += a * (0.8 + 0.4 * Math.random()); }); }
function smooth(cx, cz, r, dt) {
  brush(cx, cz, r, Math.min(1, 6 * dt), (i, a, x, y) => { if (x <= 0 || y <= 0 || x >= N - 1 || y >= N - 1) return; const avg = (h[i - 1] + h[i + 1] + h[i - N] + h[i + N]) * 0.25; h[i] += (avg - h[i]) * a; });
}
function flattenAll() { let m = 0; for (let i = 0; i < h.length; i++) m += h[i]; m /= h.length; for (let i = 0; i < h.length; i++) h[i] = m + (Math.random() - 0.5) * 0.05; dirty = true; }

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
cv.addEventListener('pointerdown', e => { if (e.button !== 0) return; hit = pick(e); if (inTray(hit)) { pressing = true; cv.setPointerCapture(e.pointerId); } });
cv.addEventListener('pointermove', e => { hit = pick(e); });
cv.addEventListener('pointerup', () => { pressing = false; });
cv.addEventListener('pointercancel', () => { pressing = false; });
cv.addEventListener('contextmenu', e => e.preventDefault());
// 光标环
const ringGeo = new THREE.RingGeometry(0.9, 1, 48); ringGeo.rotateX(-Math.PI / 2);
cursor = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthTest: false })); cursor.renderOrder = 10; scene.add(cursor);

// UI
document.querySelectorAll('[data-litter]').forEach(b => b.onclick = () => { document.querySelectorAll('[data-litter]').forEach(x => x.classList.toggle('on', x === b)); litter = LITTERS[b.dataset.litter]; sandMat.color.set(litter.color); sandMat.roughness = litter.rough; sandMat.normalMap.dispose(); sandMat.normalMap = grainNormalTexture(litter.grain); sandMat.needsUpdate = true; for (const c of clumps) { const sh = c.mesh.children[0]; sh.material.normalMap = sandMat.normalMap; sh.material.color.set(litter.color).multiplyScalar(0.72); sh.material.needsUpdate = true; } });
document.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => { document.querySelectorAll('[data-tool]').forEach(x => x.classList.toggle('on', x === b)); tool = b.dataset.tool; });
document.getElementById('size').oninput = e => { brushSize = +e.target.value; };
document.getElementById('reset').onclick = () => { resetSand(); buryRandom(3); };
document.getElementById('bury').onclick = () => { buryRandom(1); };
document.getElementById('flat').onclick = flattenAll;
window.addEventListener('keydown', e => { if (e.shiftKey) tool = 'pour'; });
window.addEventListener('keyup', e => { if (!e.shiftKey && tool === 'pour' && document.querySelector('[data-tool].on').dataset.tool !== 'pour') tool = document.querySelector('[data-tool].on').dataset.tool; });

function resize() { const w = innerWidth, hh = innerHeight; renderer.setSize(w, hh, false); camera.aspect = w / hh; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

// ---------- 主循环 ----------
resetSand(); buryRandom(3);
let last = performance.now(), fpsT = 0, frames = 0;
window.SAND = { h, N, litter: () => litter, slump, reset: resetSand, camera, controls, clumps, bury: buryRandom };
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (pressing && inTray(hit)) { if (tool === 'press') press(hit.x, hit.z, brushSize, dt); else if (tool === 'pour') pour(hit.x, hit.z, brushSize, dt); else smooth(hit.x, hit.z, brushSize, dt); }
  slump(2);
  if (dirty) { pushGeometry(); dirty = false; }
  updateClumps();
  if (hit) { cursor.visible = inTray(hit); const [gx, gy] = worldToGrid(hit.x, hit.z); const hy = h[gi(Math.round(Math.max(0, Math.min(N - 1, gx))), Math.round(Math.max(0, Math.min(N - 1, gy))))] || 0; cursor.position.set(hit.x, hy + 0.15, hit.z); cursor.scale.setScalar(brushSize); } else cursor.visible = false;
  controls.update(); renderer.render(scene, camera);
  frames++; fpsT += dt; if (fpsT >= 1) { document.getElementById('fps').textContent = `${frames} fps · ${N}×${N}`; frames = 0; fpsT = 0; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
