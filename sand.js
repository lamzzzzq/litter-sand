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
camera.position.set(0, 58, 34);
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

// 盆
const trayMat = new THREE.MeshStandardMaterial({ color: 0x7a8aa0, roughness: 0.6, metalness: 0.05 });
const floor = new THREE.Mesh(new THREE.BoxGeometry(TRAY_W + WALL * 2, 1, TRAY_D + WALL * 2), trayMat); floor.position.y = -0.5; floor.receiveShadow = true; scene.add(floor);
for (const [x, z, w, d] of [[0, -TRAY_D / 2 - WALL / 2, TRAY_W + WALL * 2, WALL], [0, TRAY_D / 2 + WALL / 2, TRAY_W + WALL * 2, WALL], [-TRAY_W / 2 - WALL / 2, 0, WALL, TRAY_D], [TRAY_W / 2 + WALL / 2, 0, WALL, TRAY_D]]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_H, d), trayMat); m.position.set(x, WALL_H / 2, z); m.castShadow = true; m.receiveShadow = true; scene.add(m);
}
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x3b3128, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -1; ground.receiveShadow = true; scene.add(ground);

// ---------- 高度场 ----------
const h = new Float32Array(N * N), tmp = new Float32Array(N * N);
const gi = (ix, iy) => iy * N + ix;
function resetSand() { for (let i = 0; i < h.length; i++) h[i] = BASE_H + (Math.random() - 0.5) * 0.12; dirty = true; }

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
function pushGeometry() {
  for (let i = 0; i < N * N; i++) pos.setY(i, h[i]);
  pos.needsUpdate = true; sandGeo.computeVertexNormals(); sandGeo.computeBoundingSphere();
}
// 世界坐标 → 格子
function worldToGrid(x, z) { const ix = (x + TRAY_W / 2) / TRAY_W * (N - 1); let iy = (z + TRAY_D / 2) / TRAY_D * (N - 1); if (row0z > 0) iy = (N - 1) - iy; return [ix, iy]; }

// ---------- 砂的物理 ----------
// 休止角坍落：相邻高差超过 tan(角)·格宽 的部分，按 slumpK 往低处流。每帧跑 2 遍。[调]
function slump(iter = 2) {
  const T = Math.tan(litter.talus * Math.PI / 180) * CELL, k = litter.slumpK;
  let moved = 0;
  for (let it = 0; it < iter; it++) {
    tmp.fill(0);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = gi(x, y), hi = h[i];
      if (x < N - 1) { const j = i + 1, d = hi - h[j]; if (d > T) { const m = (d - T) * k * 0.5; tmp[i] -= m; tmp[j] += m; } else if (d < -T) { const m = (-d - T) * k * 0.5; tmp[i] += m; tmp[j] -= m; } }
      if (y < N - 1) { const j = i + N, d = hi - h[j]; if (d > T) { const m = (d - T) * k * 0.5; tmp[i] -= m; tmp[j] += m; } else if (d < -T) { const m = (-d - T) * k * 0.5; tmp[i] += m; tmp[j] -= m; } }
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
function pour(cx, cz, r, dt) { brush(cx, cz, r * 0.8, 7 * dt, (i, a) => { h[i] += a; }); }
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
document.querySelectorAll('[data-litter]').forEach(b => b.onclick = () => { document.querySelectorAll('[data-litter]').forEach(x => x.classList.toggle('on', x === b)); litter = LITTERS[b.dataset.litter]; sandMat.color.set(litter.color); sandMat.roughness = litter.rough; sandMat.normalMap.dispose(); sandMat.normalMap = grainNormalTexture(litter.grain); sandMat.needsUpdate = true; });
document.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => { document.querySelectorAll('[data-tool]').forEach(x => x.classList.toggle('on', x === b)); tool = b.dataset.tool; });
document.getElementById('size').oninput = e => { brushSize = +e.target.value; };
document.getElementById('reset').onclick = resetSand;
document.getElementById('flat').onclick = flattenAll;
window.addEventListener('keydown', e => { if (e.shiftKey) tool = 'pour'; });
window.addEventListener('keyup', e => { if (!e.shiftKey && tool === 'pour' && document.querySelector('[data-tool].on').dataset.tool !== 'pour') tool = document.querySelector('[data-tool].on').dataset.tool; });

function resize() { const w = innerWidth, hh = innerHeight; renderer.setSize(w, hh, false); camera.aspect = w / hh; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

// ---------- 主循环 ----------
resetSand();
let last = performance.now(), fpsT = 0, frames = 0;
window.SAND = { h, N, litter: () => litter, slump, reset: resetSand, camera, controls };
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (pressing && inTray(hit)) { if (tool === 'press') press(hit.x, hit.z, brushSize, dt); else if (tool === 'pour') pour(hit.x, hit.z, brushSize, dt); else smooth(hit.x, hit.z, brushSize, dt); }
  slump(2);
  if (dirty) { pushGeometry(); dirty = false; }
  if (hit) { cursor.visible = inTray(hit); const [gx, gy] = worldToGrid(hit.x, hit.z); const hy = h[gi(Math.round(Math.max(0, Math.min(N - 1, gx))), Math.round(Math.max(0, Math.min(N - 1, gy))))] || 0; cursor.position.set(hit.x, hy + 0.15, hit.z); cursor.scale.setScalar(brushSize); } else cursor.visible = false;
  controls.update(); renderer.render(scene, camera);
  frames++; fpsT += dt; if (fpsT >= 1) { document.getElementById('fps').textContent = `${frames} fps · ${N}×${N}`; frames = 0; fpsT = 0; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
