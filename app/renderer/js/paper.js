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

  material(diffuse, normal, sheetLen) {
    const tile = 0.45;                                     // kích thước 1 ô vân giấy (m)
    const mat = new THREE.MeshStandardMaterial({ color: 0xf4ead5, roughness: 0.92, side: THREE.DoubleSide,
      map: diffuse ? diffuse.clone() : null, normalMap: normal ? normal.clone() : null, normalScale: new THREE.Vector2(0.35, 0.35) });
    for (const t of [mat.map, mat.normalMap]) if (t) { t.repeat.set(G.SHEET_W / tile, sheetLen / tile); t.needsUpdate = true; }
    this.tile = tile; this.sheetLen = sheetLen; this.mat = mat;
    const U = this.uniforms = { inkMap: { value: this.tex }, inkShift: { value: 0 }, inkTint: { value: new THREE.Color(this.ink) } };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = 'varying vec2 vInkUv;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n vInkUv = uv;');
      sh.fragmentShader = 'uniform sampler2D inkMap; uniform float inkShift; uniform vec3 inkTint; varying vec2 vInkUv;\n' + sh.fragmentShader
        .replace('#include <map_fragment>', `#include <map_fragment>
          vec4 inkS = texture2D(inkMap, vec2(vInkUv.x, vInkUv.y + inkShift));
          float inkA = inkS.a;
          diffuseColor.rgb = mix(diffuseColor.rgb, inkS.rgb, inkA*0.96);`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.45, inkA*0.8);`);
    };
    return mat;
  }

  // toạ độ bed (Blender x,y) -> pixel canvas
  toPx(x, y) {
    const a = this.m.arcAt(y) - this.shiftRem;
    return [(x - G.SHEET_X0) / G.SHEET_W * this.W, a * this.ppm];
  }

  drawSeg(x0, y0, x1, y1, widthM, style) {
    const c = this.ctx;
    const [ax, ay] = this.toPx(x0, y0), [bx, by] = this.toPx(x1, y1);
    c.lineWidth = Math.max(0.8, widthM * this.ppm);
    c.strokeStyle = style || this.ink;
    c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
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
    if (this.uniforms) this.uniforms.inkShift.value = this.shiftRem / this.sheetLen;
    const off = this.s / this.tile;
    if (this.mat) for (const t of [this.mat.map, this.mat.normalMap]) if (t) t.offset.y = off;
  }
  clear() { this.ctx.clearRect(0, 0, this.W, this.H); this.dirty = true; }

  upload(now, minInterval = 33) {
    if (this.dirty && now - this.lastUpload >= minInterval) { this.tex.needsUpdate = true; this.dirty = false; this.lastUpload = now; }
  }
}
