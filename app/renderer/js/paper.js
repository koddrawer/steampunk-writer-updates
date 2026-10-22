// Tờ giấy: canvas mực (ink) cuộn theo giấy + shader trộn mực lên vân giấy.
import * as THREE from 'three';
import { G } from './machine.js';

export class Paper {
  constructor(machine, { pxPerM = 1600, inkColor = '#1d140c' } = {}) {
    this.m = machine;
    this.ppm = pxPerM;
    this.W = Math.round(G.SHEET_W * pxPerM);
    this.H = Math.round(machine.sheetLen * pxPerM);
    this.cv = document.createElement('canvas'); this.cv.width = this.W; this.cv.height = this.H;
    this.ctx = this.cv.getContext('2d', { willReadFrequently: false });
    this.ctx.lineCap = 'round'; this.ctx.lineJoin = 'round';
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 8;
    this.tex.generateMipmaps = true; this.tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.dirty = false; this.lastUpload = 0;
    this.shiftRem = 0;          // phần lẻ (m) chưa dịch trên canvas
    this.s = 0;                 // tổng quãng giấy đã chạy
    this.setInk(inkColor);
  }
  setInk(c) { this.ink = c; if (this.uniforms) this.uniforms.inkTint.value.set(c); }

  material(diffuse, normal, sheetLen, opts = {}) {
    const tile = 0.45;                                     // kích thước 1 ô vân giấy (m)
    this.grainTex = makePaperGrain();
    const mat = new THREE.MeshStandardMaterial({ color: opts.tint || 0xf3e6cc, roughness: 0.93, side: THREE.DoubleSide,
      map: diffuse ? diffuse.clone() : null, normalMap: normal ? normal.clone() : null, normalScale: new THREE.Vector2(0.55, 0.55) });
    for (const t of [mat.map, mat.normalMap]) if (t) { t.repeat.set(G.SHEET_W / tile, sheetLen / tile); t.needsUpdate = true; }
    this.tile = tile; this.sheetLen = sheetLen; this.mat = mat;
    const gTile = 0.32;
    const U = this.uniforms = { inkMap: { value: this.tex }, inkShift: { value: 0 }, inkTint: { value: new THREE.Color(this.ink) },
      grainMap: { value: this.grainTex }, grainRep: { value: new THREE.Vector2(G.SHEET_W / gTile, sheetLen / gTile) }, grainOff: { value: 0 },
      grainAmt: { value: opts.grain ?? 1 } };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = 'varying vec2 vInkUv;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n vInkUv = uv;');
      sh.fragmentShader = 'uniform sampler2D inkMap; uniform float inkShift; uniform vec3 inkTint; varying vec2 vInkUv;\n' +
        'uniform sampler2D grainMap; uniform vec2 grainRep; uniform float grainOff; uniform float grainAmt;\n' + sh.fragmentShader
        .replace('#include <map_fragment>', `#include <map_fragment>
          vec4 gr = texture2D(grainMap, vec2(vInkUv.x * grainRep.x, vInkUv.y * grainRep.y + grainOff));
          diffuseColor.rgb *= mix(vec3(1.0), gr.rgb * 1.18, grainAmt);
          vec4 inkS = texture2D(inkMap, vec2(vInkUv.x, vInkUv.y + inkShift));
          float inkA = inkS.a * mix(1.0, smoothstep(0.15, 0.75, gr.a) * 0.35 + 0.65, grainAmt);
          diffuseColor.rgb = mix(diffuseColor.rgb, inkS.rgb, inkA * 0.95);`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor * (0.9 + 0.2 * gr.a), 0.42, inkA * 0.8);`);
    };
    return mat;
  }

  // toạ độ bed (Blender x,y) -> pixel canvas
  toPx(x, y) {
    const a = this.m.arcAt(y) - this.shiftRem;
    return [(x - G.SHEET_X0) / G.SHEET_W * this.W, a * this.ppm];
  }

  drawSeg(x0, y0, x1, y1, widthM, style, alpha = 1) {
    const c = this.ctx; c.globalAlpha = alpha;
    const [ax, ay] = this.toPx(x0, y0), [bx, by] = this.toPx(x1, y1);
    c.lineWidth = Math.max(0.8, widthM * this.ppm);
    c.strokeStyle = style || this.ink;
    c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
    c.globalAlpha = 1;
    this.dirty = true;
  }

  // Lớp "in nền": vẽ nét bằng pattern ảnh (chỉ lộ ảnh nơi ngòi bút quét qua)
  makePattern(imgCanvas, x0, yTop, wM, hM) {
    const pat = this.ctx.createPattern(imgCanvas, 'no-repeat');
    const [px, py] = this.toPx(x0, yTop);
    const sx = wM * this.ppm / imgCanvas.width, sy = hM * this.ppm / imgCanvas.height;
    pat.setTransform(new DOMMatrix().translate(px, py).scale(sx, sy));
    return { pat, refresh: () => { const [qx, qy] = this.toPx(x0, yTop); pat.setTransform(new DOMMatrix().translate(qx, qy).scale(sx, sy)); } };
  }

  // giấy chạy thêm ds (m): dịch nội dung canvas xuống (về phía cuộn trước)
  advance(ds) {
    this.s += ds;
    this.shiftRem += ds;
    const px = Math.floor(this.shiftRem * this.ppm);
    if (px >= 1) {
      const c = this.ctx;
      c.save(); c.globalCompositeOperation = 'copy';
      c.drawImage(this.cv, 0, 0, this.W, this.H - px, 0, px, this.W, this.H - px);
      c.restore();
      c.clearRect(0, 0, this.W, px);
      this.shiftRem -= px / this.ppm;
      this.dirty = true;
    }
    this.syncUniforms();
  }
  syncUniforms() {
    if (this.uniforms) { this.uniforms.inkShift.value = this.shiftRem / this.sheetLen; this.uniforms.grainOff.value = this.s / 0.32; }
    const off = this.s / this.tile;
    if (this.mat) for (const t of [this.mat.map, this.mat.normalMap]) if (t) t.offset.y = off;
  }
  clear() { this.ctx.clearRect(0, 0, this.W, this.H); this.dirty = true; }

  upload(now, minInterval = 33) {
    if (this.dirty && now - this.lastUpload >= minInterval) { this.tex.needsUpdate = true; this.dirty = false; this.lastUpload = now; }
  }
}

// Vân giấy thủ công (lặp liền): sợi giấy, lốm đốm, đốm ố – tạo một lần bằng canvas
export function makePaperGrain(size = 1024) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const c = cv.getContext('2d');
  c.fillStyle = 'rgb(214,203,180)'; c.fillRect(0, 0, size, size);
  const rnd = (() => { let s = 1234567; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const wrap = (fn) => { for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) { c.save(); c.translate(dx, dy); fn(); c.restore(); } };
  // lốm đốm tông màu lớn
  for (let i = 0; i < 90; i++) {
    const x = rnd() * size, y = rnd() * size, r = 30 + rnd() * 140, l = rnd() < 0.5;
    wrap(() => { const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, l ? 'rgba(255,250,236,0.05)' : 'rgba(150,120,80,0.035)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); });
  }
  // sợi giấy
  c.lineCap = 'round';
  for (let i = 0; i < 4200; i++) {
    const x = rnd() * size, y = rnd() * size, L = 6 + rnd() * 34, a = rnd() * Math.PI * 2, b = (rnd() - 0.5) * 0.8;
    const l = rnd() < 0.6;
    c.strokeStyle = l ? `rgba(255,252,240,${0.08 + rnd() * 0.12})` : `rgba(110,85,55,${0.05 + rnd() * 0.09})`;
    c.lineWidth = 0.5 + rnd() * 1.1;
    wrap(() => { c.beginPath(); c.moveTo(x, y);
      c.quadraticCurveTo(x + Math.cos(a + b) * L * 0.5, y + Math.sin(a + b) * L * 0.5, x + Math.cos(a) * L, y + Math.sin(a) * L); c.stroke(); });
  }
  // đốm li ti + vài vết ố
  for (let i = 0; i < 4200; i++) { c.fillStyle = `rgba(90,70,45,${rnd() * 0.18})`; c.fillRect(rnd() * size, rnd() * size, 1, 1); }
  for (let i = 0; i < 10; i++) {
    const x = rnd() * size, y = rnd() * size, r = 4 + rnd() * 14;
    wrap(() => { const g = c.createRadialGradient(x, y, r * 0.2, x, y, r); g.addColorStop(0, 'rgba(140,100,55,0.10)'); g.addColorStop(0.8, 'rgba(140,100,55,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); });
  }
  // kênh alpha = độ thấm mực (vân sợi), dùng cho mực loang không đều
  const d = c.getImageData(0, 0, size, size); const a = d.data;
  for (let i = 0; i < a.length; i += 4) { const lum = (a[i] + a[i + 1] + a[i + 2]) / 765; a[i + 3] = Math.max(0, Math.min(255, (lum - 0.62) * 900 + 140 + (rnd() - 0.5) * 70)); }
  c.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.premultiplyAlpha = false;
  return t;
}
