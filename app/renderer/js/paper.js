// Tờ giấy: canvas mực (ink) cuộn theo giấy + shader trộn mực lên vân giấy.
import * as THREE from 'three';
import { G } from './machine.js';

export class Paper {
  constructor(machine, { pxPerM = 1600, inkColor = '#1d140c' } = {}) {
    this.m = machine;
    this.ppm = pxPerM;
    this.W = Math.round(G.SHEET_W * pxPerM);
    // canvas mực chỉ phủ phần giấy từ trên vùng viết tới hết (đỡ tốn bộ nhớ với bàn viết dài)
    this.inkStart = machine.inkStart || 0; this.inkLen = machine.sheetLen - this.inkStart;
    this.H = Math.round(this.inkLen * pxPerM);
    this.cv = document.createElement('canvas'); this.cv.width = this.W; this.cv.height = this.H;
    this.ctx = this.cv.getContext('2d', { willReadFrequently: false });
    this.ctx.lineCap = 'round'; this.ctx.lineJoin = 'round';
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 8;
    this.tex.flipY = false;     // hàng 0 của texture = hàng trên cùng canvas (để tải từng vùng nhỏ)
    this.dirtyR = null; this.fullDirty = true; this.renderer = null;
    this.shiftMaxPx = 160;      // dồn phần dịch giấy vào shader, chỉ dịch canvas thật khi quá ngưỡng (đỡ tải lại cả texture)
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
    const U = this.uniforms = { inkMap: { value: this.tex }, inkShift: { value: 0 }, inkScale: { value: sheetLen / this.inkLen }, inkOff: { value: this.inkStart / this.inkLen }, inkTint: { value: new THREE.Color(this.ink) },
      grainMap: { value: this.grainTex }, grainRep: { value: new THREE.Vector2(G.SHEET_W / gTile, sheetLen / gTile) }, grainOff: { value: 0 },
      grainAmt: { value: opts.grain ?? 1 },
      glowRect: { value: new THREE.Vector4(0, 0, 0, 0) }, glowT: { value: -1 }, glowCol: { value: new THREE.Color('#ffc94a') }, glowAmt: { value: 1 } };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = 'varying vec2 vInkUv;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n vInkUv = uv;');
      sh.fragmentShader = 'uniform sampler2D inkMap; uniform float inkShift; uniform float inkScale; uniform float inkOff; uniform vec3 inkTint; varying vec2 vInkUv;\n' +
        'uniform sampler2D grainMap; uniform vec2 grainRep; uniform float grainOff; uniform float grainAmt;\n' +
        'vec3 vGlowE = vec3(0.0);\n' + 'uniform vec4 glowRect; uniform float glowT; uniform vec3 glowCol; uniform float glowAmt;\n' + sh.fragmentShader
        .replace('#include <map_fragment>', `#include <map_fragment>
          vec4 gr = texture2D(grainMap, vec2(vInkUv.x * grainRep.x, vInkUv.y * grainRep.y + grainOff));
          diffuseColor.rgb *= mix(vec3(1.0), gr.rgb * 1.18, grainAmt);
          vec2 iuv0 = vec2(vInkUv.x, (1.0 - vInkUv.y) * inkScale - inkOff - inkShift);
          vec4 inkS = texture2D(inkMap, iuv0);
          inkS.a *= step(0.0, iuv0.y);
          float inkA = inkS.a * mix(1.0, smoothstep(0.15, 0.75, gr.a) * 0.35 + 0.65, grainAmt);
          diffuseColor.rgb = mix(diffuseColor.rgb, inkS.rgb, inkA * 0.95);
          // hiệu ứng ánh vàng sau khi viết xong: chữ chuyển sang vàng kim, có vệt sáng quét trái -> phải rồi tắt dần
          if (glowT >= 0.0) {
            vec2 iuv = iuv0;
            vec2 m2 = smoothstep(glowRect.xy - 0.02, glowRect.xy, iuv) * (1.0 - smoothstep(glowRect.zw, glowRect.zw + 0.02, iuv));
            float inR = m2.x * m2.y;
            float gt = clamp(glowT, 0.0, 1.0);
            float env = smoothstep(0.0, 0.12, gt) * (1.0 - smoothstep(0.65, 1.0, gt));      // sáng nhanh, giữ, tắt dần
            float bx = mix(glowRect.x - 0.05, glowRect.z + 0.05, smoothstep(0.05, 0.75, gt));
            float band = exp(-pow((vInkUv.x - bx) / 0.03, 2.0));                            // vệt sáng quét trái -> phải
            float halo = texture2D(inkMap, iuv, 4.0).a;                                     // quầng sáng mờ quanh nét chữ
            float gk = inR * inkA * glowAmt;
            diffuseColor.rgb = mix(diffuseColor.rgb, glowCol * vec3(0.62, 0.40, 0.10), min(1.0, gk * env * 1.4));
            vGlowE = glowCol * env * glowAmt * inR * (inkA * (0.05 + band * 1.0) + halo * 0.22 * (0.4 + band));
          }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += vGlowE;`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor * (0.9 + 0.2 * gr.a), 0.42, inkA * 0.8);`);
    };
    return mat;
  }

  // toạ độ bed (Blender x,y) -> pixel canvas
  toPx(x, y) {
    const a = this.m.arcAt(y) - this.inkStart - this.shiftRem;
    return [(x - G.SHEET_X0) / G.SHEET_W * this.W, a * this.ppm];
  }

  drawSeg(x0, y0, x1, y1, widthM, style, alpha = 1) {
    const c = this.ctx; c.globalAlpha = alpha;
    const [ax, ay] = this.toPx(x0, y0), [bx, by] = this.toPx(x1, y1);
    c.lineWidth = Math.max(0.8, widthM * this.ppm);
    c.strokeStyle = style || this.ink;
    c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
    c.globalAlpha = 1;
    const r = c.lineWidth / 2 + 2;
    const b = this.bb; if (b) {
      b.x0 = Math.min(b.x0, ax - r, bx - r); b.x1 = Math.max(b.x1, ax + r, bx + r); b.y0 = Math.min(b.y0, ay - r, by - r); b.y1 = Math.max(b.y1, ay + r, by + r); }
    const d = this.dirtyR || (this.dirtyR = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
    d.x0 = Math.min(d.x0, ax - r, bx - r); d.x1 = Math.max(d.x1, ax + r, bx + r); d.y0 = Math.min(d.y0, ay - r, by - r); d.y1 = Math.max(d.y1, ay + r, by + r);
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
    if (px >= this.shiftMaxPx) this.flushShift(); else this.syncUniforms();
  }
  // dịch thật nội dung canvas (gộp nhiều bước nhỏ thành 1 lần)
  flushShift() {
    const px = Math.floor(this.shiftRem * this.ppm);
    if (px >= 1) {
      const c = this.ctx;
      c.save(); c.globalCompositeOperation = 'copy';
      c.drawImage(this.cv, 0, 0, this.W, this.H - px, 0, px, this.W, this.H - px);
      c.restore();
      c.clearRect(0, 0, this.W, px);
      this.shiftRem -= px / this.ppm;
      for (const b of [this.bb, this.glowBox, this.lastBox]) if (b) { b.y0 += px; b.y1 += px; }
      this.dirty = true; this.fullDirty = true;
    }
    this.syncUniforms();
  }
  syncUniforms() {
    if (this.uniforms) { this.uniforms.inkShift.value = this.shiftRem / this.inkLen; this.uniforms.grainOff.value = this.s / 0.32; }
    const off = this.s / this.tile;
    if (this.mat) for (const t of [this.mat.map, this.mat.normalMap]) if (t) t.offset.y = off;
  }
  clear() { this.ctx.clearRect(0, 0, this.W, this.H); this.dirty = true; this.fullDirty = true; this.glowBox = null; this.lastBox = null; if (this.uniforms) this.uniforms.glowT.value = -1; }

  // ghi lại vùng mực của một lượt viết (để làm hiệu ứng ánh vàng)
  trackStart() { this.bb = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }; }
  trackStop() { const b = this.bb; this.bb = null; const ok = b && b.x1 > b.x0 ? b : null; if (ok) this.lastBox = { ...ok }; return ok; }
  glow(box, { sec = 1.8, color = '#ffc94a', strength = 1 } = {}) {
    if (!box || !this.uniforms) return;
    this.glowBox = { ...box }; this.glowAge = 0; this.glowSec = Math.max(0.3, sec);
    this.uniforms.glowCol.value.set(color); this.uniforms.glowAmt.value = strength;
  }
  updateGlow(dt) {
    const U = this.uniforms; if (!U) return;
    this.glowAge = (this.glowAge || 0) + dt;
    const g = this.glowBox; if (!g) { U.glowT.value = -1; return; }
    const t = this.glowAge / this.glowSec;
    if (t >= 1) { this.glowBox = null; U.glowT.value = -1; return; }
    U.glowT.value = t;
    // canvas px -> toạ độ texture (CanvasTexture lật trục dọc)
    const fy = (y) => this.tex.flipY ? 1 - y / this.H : y / this.H;
    U.glowRect.value.set(g.x0 / this.W, Math.min(fy(g.y0), fy(g.y1)), g.x1 / this.W, Math.max(fy(g.y0), fy(g.y1)));
  }

  upload(now, minInterval = 33) {
    if (!this.dirty || now - this.lastUpload < minInterval) return;
    this.lastUpload = now; this.dirty = false;
    const d = this.dirtyR; this.dirtyR = null;
    if (this.fullDirty || !d || !this.subUpload(d)) { this.tex.needsUpdate = true; this.fullDirty = false; }
  }
  // tải riêng vùng vừa vẽ lên GPU (WebGL2), thay vì cả tấm canvas lớn
  subUpload(d) {
    const R = this.renderer; if (!R || !R.capabilities.isWebGL2) return false;
    const props = R.properties.get(this.tex); const glTex = props && props.__webglTexture;
    if (!glTex || props.__version !== this.tex.version) return false;
    const x = Math.max(0, Math.floor(d.x0)), y = Math.max(0, Math.floor(d.y0));
    const w = Math.min(this.W, Math.ceil(d.x1)) - x, h = Math.min(this.H, Math.ceil(d.y1)) - y;
    if (w <= 0 || h <= 0) return true;
    if (w * h > this.W * this.H * 0.5) return false;
    const gl = R.getContext();
    try {
      R.state.bindTexture(gl.TEXTURE_2D, glTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, this.W); gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, x); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, y);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, this.cv);
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0); gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
      if (this.tex.generateMipmaps) gl.generateMipmap(gl.TEXTURE_2D);
      return true;
    } catch (e) {
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0); gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
      return false;
    }
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
