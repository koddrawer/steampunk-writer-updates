// Màn hiển thị 9:16: dựng cảnh, nhận lệnh từ core, chạy máy viết.
import * as THREE from 'three';
import { OrbitControls } from '../lib/addons/controls/OrbitControls.js';
import { RoomEnvironment } from '../lib/addons/environments/RoomEnvironment.js';
import { Machine, G, b2t } from './machine.js';
import { Paper } from './paper.js';
import { Writer } from './writer.js';
import { loadChain } from './text.js';

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
scene.environmentIntensity = 0.9;

const hemi = new THREE.HemisphereLight(0xfff2dd, 0x2a1d12, 0.5); scene.add(hemi);
const key = new THREE.DirectionalLight(0xffe7c4, 2.6); key.position.set(-1.6, 3.2, 2.4); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 0.5, far: 8 });
key.shadow.bias = -0.0004; key.shadow.normalBias = 0.01; key.target.position.set(0.1, 0.3, 0); scene.add(key, key.target);
const rim = new THREE.DirectionalLight(0xbcd2ff, 0.9); rim.position.set(1.5, 2.0, -2.5); scene.add(rim);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.ShadowMaterial({ opacity: 0.28 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -0.006; floor.receiveShadow = true; scene.add(floor);

const camera = new THREE.PerspectiveCamera(32, 9 / 16, 0.05, 60);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08; controls.screenSpacePanning = true;

const DEFAULT_CAMS = {
  main:  { pos: [-0.16, 1.95, 1.42], target: [-0.16, 0.34, -0.02], fov: 46 },
  donor: { pos: [-0.17, 1.55, 0.95], target: [-0.17, 0.30, 0.20], fov: 30 },
};
const camOf = (name) => (cfg.display.cameras && cfg.display.cameras[name]) || DEFAULT_CAMS[name];
function applyCam(c) { camera.position.fromArray(c.pos); controls.target.fromArray(c.target); camera.fov = c.fov || 34; camera.updateProjectionMatrix(); controls.update(); }
let tween = null;
function tweenCam(c, sec = 1.6) {
  tween = { t: 0, T: sec, p0: camera.position.clone(), t0: controls.target.clone(), f0: camera.fov,
    p1: new THREE.Vector3().fromArray(c.pos), t1: new THREE.Vector3().fromArray(c.target), f1: c.fov || camera.fov };
}
applyCam(camOf('main'));

function applyDisplayCfg() {
  const d = cfg.display;
  renderer.setPixelRatio((window.devicePixelRatio || 1) * (d.renderScale || 1));
  resize();
  if (d.bgImage) {
    new THREE.TextureLoader().load(api.mediaUrl(d.bgImage), t => { t.colorSpace = THREE.SRGBColorSpace; scene.background = t; });
  } else scene.background = new THREE.Color(d.bgColor || '#efe9df');
  floor.material.opacity = d.floorShadow ?? 0.28;
  renderer.toneMappingExposure = d.exposure ?? 1.0;
  controls.enabled = d.mouseCamera !== false;
  document.body.classList.toggle('drag', !!d.dragWindow);
}
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
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
machine.attachPaper(paper);

let donorActive = false;
const writer = new Writer(machine, paper, fonts, getCfg, {
  onDonorStart: () => { donorActive = true; if (cfg.display.donorZoom !== false) tweenCam(camOf('donor'), 1.8); },
  onDonorEnd: () => {
    setTimeout(() => { donorActive = false; if (cfg.display.donorZoom !== false) tweenCam(camOf('main'), 2.0); }, (cfg.display.donorHoldSec ?? 4) * 1000);
  },
  onJobDone: (job) => { api.send('display:jobDone', job && { id: job.id, type: job.type, name: job.name }); report(); },
});
$('loading').classList.add('hide');
api.send('display:ready', {});

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
  const oldInk = cfg.writer.paper?.inkColor; cfg = c; applyDisplayCfg();
  if (c.writer.paper?.inkColor && c.writer.paper.inkColor !== oldInk) { paper.setInk(c.writer.paper.inkColor); writer.imageCache.clear(); }
  fonts.cache.clear();
});
api.on('display:cmd', (m) => {
  if (m.cmd === 'clearPaper') writer.clearPaper();
  if (m.cmd === 'camera') tweenCam(camOf(m.name || 'main'), m.sec ?? 1.2);
  if (m.cmd === 'resetCamera') { const c = DEFAULT_CAMS[m.name || 'main']; tweenCam(c, 1); api.send('display:camera', { name: m.name || 'main', cam: null }); }
  if (m.cmd === 'saveCamera') api.send('display:camera', { name: m.name || 'main', cam: { pos: camera.position.toArray().map(r4), target: controls.target.toArray().map(r4), fov: camera.fov } });
});
const r4 = v => Math.round(v * 1e4) / 1e4;

// camera bám theo ngòi bút theo chiều ngang (khung dọc 9:16 hẹp hơn khổ giấy)
let followOff = 0;
function followPen(dt) {
  const f = (cfg.display.followPen ?? 60) / 100;
  if (tween || donorActive) return;
  const want = f * (writer.pen.x - (G.SHEET_X0 + G.SHEET_X1) / 2) * (writer.busy ? 1 : 0.6);
  const nxt = followOff + (want - followOff) * (1 - Math.exp(-dt * 1.2));
  const d = nxt - followOff; followOff = nxt;
  camera.position.x += d; controls.target.x += d;
}

// ---------- vòng lặp
const clock = new THREE.Clock();
let fpsT = 0, frames = 0;
function frame(dtIn) {
  const dt = dtIn ?? Math.min(clock.getDelta(), 0.05);
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
  renderer.render(scene, camera);
  if (!writer.busy && performance.now() - lastAsk > 400) pull();
  frames++; fpsT += dt; if (fpsT > 2) { api.send('display:fps', Math.round(frames / fpsT)); frames = 0; fpsT = 0; }
}
if (!window.__manual) renderer.setAnimationLoop(() => frame());

// tiện cho kiểm thử
window.__sw = { machine, paper, writer, camera, controls, scene, renderer, G, b2t, applyCam,
  // kiểm thử: chạy mô phỏng không render
  async sim(sec, dt = 1 / 30) { const n = Math.round(sec / dt); const sl = (ms) => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < n; i++) {
      let g = 0; while (asking && g++ < 500) await sl(10);
      writer.tick(dt); if (!writer.busy && !writer.steps.length) pull();
      if (i % 20 === 0) await sl(0);
      if (tween) { tween.t = tween.T; } followPen(dt); }
    machine.update(); paper.tex.needsUpdate = true; },
  snap() { controls.update(); renderer.render(scene, camera); return canvas.toDataURL('image/jpeg', 0.9); } };
