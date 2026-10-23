// Màn hiển thị 9:16: dựng cảnh, nhận lệnh từ core, chạy máy viết, khung video nổi.
import * as THREE from 'three';
import { OrbitControls } from '../lib/addons/controls/OrbitControls.js';
import { RoomEnvironment } from '../lib/addons/environments/RoomEnvironment.js';
import { EffectComposer } from '../lib/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../lib/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../lib/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../lib/addons/postprocessing/OutputPass.js';
import { Machine, G, b2t } from './machine.js';
import { Paper } from './paper.js';
import { Writer } from './writer.js';
import { loadChain } from './text.js';
import { VideoBox } from './videobox.js';

const api = window.api;
const $ = (id) => document.getElementById(id);
const errBox = $('err');
window.addEventListener('error', e => { errBox.textContent = String(e.message || e); });
window.addEventListener('unhandledrejection', e => { errBox.textContent = String(e.reason && e.reason.stack || e.reason); });

let cfg = await api.getConfig();
const getCfg = () => cfg;

// ---------- renderer / cảnh
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

// ---- đèn: 2 bộ (điện ảnh / studio sáng)
const L = {
  hemi: new THREE.HemisphereLight(0xfff2dd, 0x2a1d12, 0.5),
  key: new THREE.DirectionalLight(0xffe7c4, 2.6),
  spot: new THREE.SpotLight(0xffc68a, 40, 0, 0.6, 0.75, 2),
  rim: new THREE.DirectionalLight(0xbcd2ff, 0.9),
  glow: new THREE.PointLight(0xff9448, 1.6, 3.5, 2),
};
L.key.position.set(-1.6, 3.2, 2.4); L.key.target.position.set(0.1, 0.3, 0);
L.spot.position.set(-1.05, 2.95, 1.35); L.spot.target.position.set(-0.17, 0.3, -0.05);
L.rim.position.set(1.6, 1.8, -2.4);
L.glow.position.set(1.25, 1.05, 0.55);
for (const l of [L.key, L.spot]) {
  l.castShadow = true; l.shadow.mapSize.set(2048, 2048); l.shadow.bias = -0.0004; l.shadow.normalBias = 0.01;
}
Object.assign(L.key.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 0.5, far: 8 });
L.spot.shadow.camera.near = 0.5; L.spot.shadow.camera.far = 8; L.spot.shadow.radius = 4;
scene.add(L.hemi, L.key, L.key.target, L.spot, L.spot.target, L.rim, L.glow);

const floorShadow = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.ShadowMaterial({ opacity: 0.28 }));
const table = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardMaterial({ color: 0x2a1d14, roughness: 0.78, metalness: 0 }));
for (const f of [floorShadow, table]) { f.rotation.x = -Math.PI / 2; f.position.y = -0.006; f.receiveShadow = true; scene.add(f); }

const camera = new THREE.PerspectiveCamera(32, 9 / 16, 0.05, 60);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08; controls.screenSpacePanning = true;

// ---- hậu kỳ: bloom nhẹ trên ánh kim
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.35, 0.45, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const DEFAULT_CAMS = {
  main:  { pos: [-0.16, 1.95, 1.42], target: [-0.16, 0.34, -0.02], fov: 46 },
  donor: { pos: [-0.17, 1.55, 0.95], target: [-0.17, 0.30, 0.20], fov: 30 },
  quote: { pos: [-0.17, 2.6, 1.25], target: [-0.17, 0.30, -0.05], fov: 55 },
};
const camOf = (name) => (cfg.display.cameras && cfg.display.cameras[name]) || DEFAULT_CAMS[name];
function applyCam(c) { camera.position.fromArray(c.pos); controls.target.fromArray(c.target); camera.fov = c.fov || 34; camera.updateProjectionMatrix(); controls.update(); }
let tween = null, camMode = 'main';
function tweenCam(c, sec = 1.6) {
  tween = { t: 0, T: sec, p0: camera.position.clone(), t0: controls.target.clone(), f0: camera.fov,
    p1: new THREE.Vector3().fromArray(c.pos), t1: new THREE.Vector3().fromArray(c.target), f1: c.fov || camera.fov };
}
function goCam(mode, sec) { camMode = mode; followOff = 0; tweenCam(camOf(mode), sec); }
applyCam(camOf('main'));

// nền gradient tối kiểu sân khấu (vẽ bằng canvas)
function gradientBg(hex) {
  const c = new THREE.Color(hex);
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128; const x = cv.getContext('2d');
  const g = x.createRadialGradient(32, 52, 4, 32, 64, 90);
  const css = (k) => `rgb(${Math.round(Math.min(1, c.r * k) * 255)},${Math.round(Math.min(1, c.g * k) * 255)},${Math.round(Math.min(1, c.b * k) * 255)})`;
  g.addColorStop(0, css(1.35)); g.addColorStop(0.55, css(0.75)); g.addColorStop(1, css(0.18));
  x.fillStyle = g; x.fillRect(0, 0, 64, 128);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function applyDisplayCfg() {
  const d = cfg.display;
  const cine = (d.lighting || 'cinematic') === 'cinematic';
  renderer.setPixelRatio((window.devicePixelRatio || 1) * (d.renderScale || 1));
  resize();
  const k = d.keyLight ?? 1;
  L.hemi.intensity = cine ? 0.1 : 0.5;
  L.key.visible = !cine; L.key.intensity = 2.6 * k;
  L.spot.visible = cine; L.spot.intensity = 40 * k;
  L.rim.intensity = cine ? 1.5 : 0.9;
  L.glow.visible = cine;
  scene.environmentIntensity = cine ? 0.32 : 0.9;
  floorShadow.visible = !cine; table.visible = cine && d.table !== false;
  floorShadow.material.opacity = d.floorShadow ?? 0.28;
  if (d.bgImage) {
    new THREE.TextureLoader().load(api.mediaUrl(d.bgImage), t => { t.colorSpace = THREE.SRGBColorSpace; scene.background = t; });
  } else scene.background = cine ? gradientBg(d.bgColor || '#2a2018') : new THREE.Color(d.bgColor || '#efe9df');
  renderer.toneMappingExposure = d.exposure ?? (cine ? 1.05 : 1.0);
  bloom.strength = d.bloom ?? (cine ? 0.35 : 0);
  $('vig').style.opacity = String(d.vignette ?? (cine ? 0.6 : 0));
  controls.enabled = d.mouseCamera !== false;
  document.body.classList.toggle('drag', !!d.dragWindow);
}
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false); composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
applyDisplayCfg();

// ---------- font
const FALLBACK = ['playfair-display-vietnamese-700-normal.woff', 'dancing-script-vietnamese-700-normal.woff', 'playfair-display-latin-ext-700-normal.woff', 'playfair-display-latin-700-normal.woff'].map(f => '../assets/fonts/' + f);
const fonts = {
  cache: new Map(),
  urlsFor(id) {
    const f = (cfg.fonts || []).find(x => x.id === id) || (cfg.fonts || [])[0];
    if (!f) return FALLBACK;
    const own = f.builtin ? f.files.map(x => '../assets/fonts/' + x) : [api.mediaUrl(f.file)];
    return [...own, ...FALLBACK];
  },
  async chain(id) {
    const urls = this.urlsFor(id); const k = urls.join('|');
    if (!this.cache.has(k)) this.cache.set(k, loadChain(urls));
    return this.cache.get(k);
  },
};

// ---------- máy
const bar = $('bar').firstElementChild;
const machine = await new Machine(scene, '../assets/').load(p => { bar.style.width = Math.round(p * 100) + '%'; });
const paper = new Paper(machine, { pxPerM: cfg.writer.paper?.pxPerM || 1600, inkColor: cfg.writer.paper?.inkColor || '#1d140c' });
machine.attachPaper(paper, { tint: cfg.writer.paper?.tint || '#f3e6cc', grain: cfg.writer.paper?.grain ?? 1 });
// cuộn giấy dùng cùng vân giấy
{
  const rm = machine.mats.PaperRoll; const gt = paper.grainTex.clone(); gt.repeat.set(4, 1.2); gt.needsUpdate = true;
  rm.map = gt; rm.color.set(cfg.writer.paper?.tint || '#f3e6cc'); rm.needsUpdate = true;
}

let donorActive = false;
const writer = new Writer(machine, paper, fonts, getCfg, {
  onDonorStart: () => { donorActive = true; if (cfg.display.donorZoom !== false) goCam('donor', 1.8); },
  onDonorEnd: () => {
    setTimeout(() => { donorActive = false; if (cfg.display.donorZoom !== false) goCam('main', 2.0); }, (cfg.display.donorHoldSec ?? 4) * 1000);
  },
  onJobStart: (job) => {
    if (job.type === 'quote') { if (cfg.display.quoteCam !== false && camMode !== 'quote') goCam('quote', 2.4); }
    else if (camMode === 'quote' && !(job.type === 'donor' && cfg.display.donorZoom !== false)) goCam('main', 1.6);
  },
  onJobDone: (job) => { api.send('display:jobDone', job && { id: job.id, type: job.type, name: job.name }); report(); },
});
$('loading').classList.add('hide');
api.send('display:ready', {});

// ---------- khung video nổi (chỉ di chuyển trong cửa sổ này)
const vbox = new VideoBox($('vbox'), $('vid'), api, getCfg);

// ---------- hàng đợi việc (core giữ hàng đợi, màn hiển thị xin việc khi rảnh)
let asking = false, lastAsk = 0;
async function pull() {
  if (writer.busy || asking) return;
  if (donorActive && cfg.display.donorZoom !== false) return;    // chờ camera quay lại
  asking = true; lastAsk = performance.now();
  try {
    const job = await api.invoke('job:next');
    if (job) { const ok = await writer.start(job); report(); if (!ok) api.send('display:jobDone', { id: job.id, skipped: true }); }
  } finally { asking = false; }
}
function report() { api.send('display:status', { busy: writer.busy, job: writer.job && { type: writer.job.type, name: writer.job.name } }); }
api.on('job:available', () => pull());

api.on('config', (c) => {
  const old = cfg; cfg = c; applyDisplayCfg(); vbox.layout();
  const op = old.writer.paper || {}, np = c.writer.paper || {};
  if (np.inkColor && np.inkColor !== op.inkColor) { paper.setInk(np.inkColor); writer.imageCache.clear(); }
  if (np.tint !== op.tint && paper.mat) { paper.mat.color.set(np.tint || '#f3e6cc'); machine.mats.PaperRoll.color.set(np.tint || '#f3e6cc'); }
  if (np.grain !== op.grain && paper.uniforms) paper.uniforms.grainAmt.value = np.grain ?? 1;
  fonts.cache.clear();
});
api.on('display:cmd', (m) => {
  if (m.cmd === 'clearPaper') writer.clearPaper();
  if (m.cmd === 'abortJob') writer.abort();
  if (m.cmd === 'camera') goCam(m.name || 'main', m.sec ?? 1.2);
  if (m.cmd === 'resetCamera') { const n = m.name || 'main'; camMode = n; tweenCam(DEFAULT_CAMS[n], 1); api.send('display:camera', { name: n, cam: null }); }
  if (m.cmd === 'saveCamera') api.send('display:camera', { name: m.name || 'main', cam: { pos: camera.position.toArray().map(r4), target: controls.target.toArray().map(r4), fov: camera.fov } });
});
const r4 = v => Math.round(v * 1e4) / 1e4;

// camera bám theo ngòi bút theo chiều ngang (khung dọc 9:16 hẹp hơn khổ giấy)
let followOff = 0;
function followPen(dt) {
  const f = (cfg.display.followPen ?? 60) / 100;
  if (tween || donorActive || camMode !== 'main') return;
  const want = f * (writer.pen.x - (G.SHEET_X0 + G.SHEET_X1) / 2) * (writer.busy ? 1 : 0.6);
  const nxt = followOff + (want - followOff) * (1 - Math.exp(-dt * 1.2));
  const d = nxt - followOff; followOff = nxt;
  camera.position.x += d; controls.target.x += d;
}
function render() { if (bloom.strength > 0.001) composer.render(); else renderer.render(scene, camera); }

// ---------- vòng lặp
const clock = new THREE.Clock();
let fpsT = 0, frames = 0;
function frame(dtIn) {
  const raw = clock.getDelta();
  const dt = dtIn ?? Math.min(raw, 0.1);
  writer.tick(dt);
  machine.update();
  paper.upload(performance.now());
  if (tween) {
    tween.t += dt; const u = Math.min(1, tween.t / tween.T), e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    camera.position.lerpVectors(tween.p0, tween.p1, e); controls.target.lerpVectors(tween.t0, tween.t1, e);
    camera.fov = tween.f0 + (tween.f1 - tween.f0) * e; camera.updateProjectionMatrix();
    if (u >= 1) tween = null;
  }
  followPen(dt);
  controls.update();
  render();
  if (!writer.busy && performance.now() - lastAsk > 400) pull();
  frames++; fpsT += raw; if (fpsT > 2) { api.send('display:fps', Math.round(frames / fpsT)); frames = 0; fpsT = 0; }
}
if (!window.__manual) renderer.setAnimationLoop(() => frame());

// tiện cho kiểm thử
window.__sw = { machine, paper, writer, camera, controls, scene, renderer, G, b2t, applyCam, goCam, vbox,
  get camMode() { return camMode; },
  async sim(sec, dt = 1 / 30) { const n = Math.round(sec / dt); const sl = (ms) => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < n; i++) {
      let g = 0; while (asking && g++ < 500) await sl(10);
      writer.tick(dt); if (!writer.busy && !writer.steps.length) pull();
      if (i % 20 === 0) await sl(0);
      if (tween) { tween.t = tween.T; camera.position.copy(tween.p1); controls.target.copy(tween.t1); camera.fov = tween.f1; camera.updateProjectionMatrix(); tween = null; }
      followPen(dt); }
    machine.update(); paper.tex.needsUpdate = true; },
  snap() { controls.update(); render(); return canvas.toDataURL('image/jpeg', 0.9); } };
