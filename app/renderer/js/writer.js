// Bộ lập kế hoạch nét + điều khiển chuyển động ngòi bút (nhấc/hạ bút, di chuyển, kéo giấy).
import { G } from './machine.js';
import { layoutText, textToStrokes, strokesLength, sanitize, hasRenderable, loadChain, hatch } from './text.js';
import { buildBadge, TEMPLATES } from './badge.js';

const LIFT = 0.012;          // nhấc bút 12 mm
const PARK = { x: G.SHEET_X1 - 0.06, y: -0.22 };
const YTOP = -0.035;         // mép trên vùng viết (phía cuộn giấy)
const Y_MIN = G.FR_Y + 0.025;

function optimizeOrder(strokes, start) {
  // tham lam: luôn chọn nét có đầu gần nhất, cho phép đảo chiều nét hở
  const left = strokes.slice(); const out = []; let cur = start || [0, 0];
  while (left.length) {
    let bi = 0, bd = Infinity, rev = false;
    for (let i = 0; i < left.length; i++) {
      const s = left[i]; const a = s[0], b = s[s.length - 1];
      const da = (a[0] - cur[0]) ** 2 + (a[1] - cur[1]) ** 2; if (da < bd) { bd = da; bi = i; rev = false; }
      const closed = Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-5;
      if (!closed) { const db = (b[0] - cur[0]) ** 2 + (b[1] - cur[1]) ** 2; if (db < bd) { bd = db; bi = i; rev = true; } }
    }
    let s = left.splice(bi, 1)[0]; if (rev) s = s.slice().reverse();
    out.push(s); cur = s[s.length - 1];
  }
  return out;
}

export class Writer {
  constructor(machine, paper, fonts, cfgGetter, hooks = {}) {
    this.m = machine; this.p = paper; this.fonts = fonts; this.cfg = cfgGetter; this.hooks = hooks;
    this.pen = { x: PARK.x, y: PARK.y, z: G.PAPER_Z + 0.05 };
    this.steps = []; this.step = null;
    this.contentHigh = -Infinity; this.rowOpen = false; this.xCur = 0; this.rowH = 0;
    this.busy = false; this.idleT = 0; this.job = null; this.imageCache = new Map();
  }

  // ---------------- lập kế hoạch
  advanceFor(h, gap) {
    const need = this.contentHigh === -Infinity ? 0 : this.contentHigh - (YTOP - h - gap);
    const d = Math.max(0, need);
    if (d > 0) { this.steps.push({ k: 'advance', d }); this.contentHigh -= d; }
  }

  async planName(job) {
    const c = this.cfg().writer.names;
    const chain = await this.fonts.chain(c.fontId);
    let text = sanitize(chain, job.name, c.maxChars || 20);
    if (!text || !hasRenderable(chain, text)) text = sanitize(chain, job.alt || '', c.maxChars || 20);
    if (!text) return false;
    const cap = (c.sizeCm || 3.5) / 100;
    const probe = layoutText(chain, 'H', 1); const em = cap / (probe.capHeight || 0.7);
    let L = layoutText(chain, text, em);
    const margin = 0.03, gap = em * 0.55, maxW = G.SHEET_W - 2 * margin;
    if (L.width > maxW) L = layoutText(chain, text, em * maxW / L.width);
    const rowH = cap * 2.1;
    if (!this.rowOpen || this.xCur + L.width > G.SHEET_X1 - margin || Math.abs(this.rowH - rowH) > 1e-4) {
      this.advanceFor(rowH, cap * 0.4);
      this.rowOpen = true; this.rowH = rowH; this.xCur = G.SHEET_X0 + margin; this.contentHigh = YTOP;
    }
    const base = YTOP - cap * 1.45; const ox = this.xCur - L.bbox.x0;
    const jitter = (Math.random() - 0.5) * cap * 0.06;
    const strokes = textToStrokes(L, { nib: (c.nibMm || 1.6) / 1000, fill: c.fill || 'hatch', hatchAngle: 0.45,
      place: ([x, y]) => [x + ox, y + base + jitter] });
    this.xCur += L.width + gap;
    this.queueStrokes(strokes, (c.nibMm || 1.6) / 1000, c.speed || 0.35, c.maxSec || 8, null);
    return true;
  }

  async planDonor(job) {
    const c = this.cfg().writer.donors; const all = this.cfg();
    this.rowOpen = false;
    const H = Math.min((c.badgeHeightCm || 34) / 100, YTOP - Y_MIN - 0.01);
    const W = Math.min(G.SHEET_W - 0.06, H * (c.aspect || 1.7));
    this.advanceFor(H, 0.025);
    const cx = (G.SHEET_X0 + G.SHEET_X1) / 2 + (c.offsetXcm || 0) / 100, cy = YTOP - H / 2;
    this.contentHigh = YTOP;
    const nameChain = await this.fonts.chain(c.fontId);
    const decoChain = await this.fonts.chain(c.decoFontId || c.fontId);
    const name = sanitize(nameChain, job.name, c.maxChars || 22) || sanitize(nameChain, job.alt || '', 22) || 'Cảm ơn';
    const fill = (t) => (t || '').replace(/\{gift\}/g, job.gift || 'Gift').replace(/\{count\}/g, job.count || 1)
      .replace(/\{coins\}/g, job.diamonds || 0).replace(/\{year\}/g, new Date().getFullYear()).replace(/\{name\}/g, name)
      .replace(/\{date\}/g, new Date().toLocaleDateString('vi-VN'));
    const bg = this.pickBackground();
    const nibName = (c.nibMm || 3) / 1000, nibDeco = (c.decoNibMm || 1.4) / 1000;
    const place = ([x, y]) => [cx + x, cy + y];
    this.hooks.onDonorStart && this.hooks.onDonorStart({ cx, cy, W, H });

    if (!bg || bg.type === 'template') {
      const tpl = bg && TEMPLATES[bg.template] ? bg.template : 'seal';
      const b = buildBadge(tpl, { W, H, chains: { name: nameChain, deco: decoChain }, name,
        top: fill(bg?.top ?? c.topText), bottom: fill(bg?.bottom ?? c.bottomText), small: fill(bg?.small ?? c.smallText), nibName, nibDeco });
      this.queueStrokes(b.deco.map(s => s.map(place)), nibDeco, c.decoSpeed || 0.6, (c.maxSec || 30) * 0.55, null);
      this.queueStrokes(b.names.map(s => s.map(place)), nibName, c.speed || 0.45, (c.maxSec || 30) * 0.45, null);
    } else {
      const img = await this.loadInkImage(bg.file, !!bg.keepColors);
      if (img) {
        const ar = img.width / img.height; let w = W, h = W / ar; if (h > H) { h = H; w = H * ar; }
        const x0 = cx - w / 2, yT = cy + h / 2;
        const nib = (c.revealNibMm || 7) / 1000, rows = [];
        const pxH = img.height; const step = nib * 0.85;
        let dir = 1;
        for (let yy = yT - step / 2; yy > yT - h; yy -= step) {
          const r = Math.min(pxH - 1, Math.floor((yT - yy) / h * pxH));
          const spans = img.spans[r] || [];
          const segs = spans.map(([a, b]) => [[x0 + a / img.width * w - nib * 0.3, yy], [x0 + b / img.width * w + nib * 0.3, yy]]);
          if (dir < 0) segs.reverse().forEach(s => s.reverse());
          rows.push(...segs); if (segs.length) dir = -dir;
        }
        let pat = null;
        const style = () => { if (!pat) pat = this.p.makePattern(img.canvas, x0, yT, w, h); return pat.pat; };
        this.queueStrokes(rows, nib, c.revealSpeed || 1.2, (c.maxSec || 30) * 0.5, style, false);
      }
      const ny = cy + ((bg.nameYOffset ?? 0) / 100) * H;
      const em0 = layoutText(nameChain, name, 1);
      const em = Math.min((W * (bg.nameWidth ?? 70) / 100) / (em0.width || 1), (H * 0.28) / (em0.capHeight || 0.7));
      const L = layoutText(nameChain, name, em); const ox = cx - (L.bbox.x0 + L.bbox.x1) / 2, oy = ny - L.capHeight / 2;
      const strokes = textToStrokes(L, { nib: nibName, fill: 'hatch', place: ([x, y]) => [x + ox, y + oy] });
      this.queueStrokes(strokes, nibName, c.speed || 0.45, (c.maxSec || 30) * 0.45, null);
    }
    this.steps.push({ k: 'call', fn: () => this.hooks.onDonorEnd && this.hooks.onDonorEnd() });
    return true;
  }

  pickBackground() {
    const c = this.cfg(); const list = (c.backgrounds || []).filter(b => b.enabled !== false);
    if (!list.length) return null;
    const mode = c.writer.donors.bgMode || 'random';
    if (mode === 'fixed') return list.find(b => b.id === c.writer.donors.bgFixed) || list[0];
    if (mode === 'sequential') { this.bgIdx = ((this.bgIdx ?? -1) + 1) % list.length; return list[this.bgIdx]; }
    let i = Math.floor(Math.random() * list.length); if (list.length > 1 && i === this.lastBg) i = (i + 1) % list.length;
    this.lastBg = i; return list[i];
  }

  // ảnh logo -> lớp mực (độ tối thành độ đậm mực), kèm danh sách đoạn có nội dung theo từng hàng
  async loadInkImage(url, keepColors) {
    const key = url + '|' + keepColors;
    if (this.imageCache.has(key)) return this.imageCache.get(key);
    const im = new Image(); im.crossOrigin = 'anonymous'; im.src = url;
    try { await im.decode(); } catch (e) { console.warn('logo lỗi', url, e); return null; }
    const maxPx = 1400; const k = Math.min(1, maxPx / Math.max(im.width, im.height));
    const cv = document.createElement('canvas'); cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
    const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0, cv.width, cv.height);
    const d = cx.getImageData(0, 0, cv.width, cv.height); const a = d.data;
    const ink = hexToRgb(this.p.ink);
    for (let i = 0; i < a.length; i += 4) {
      const lum = (0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2]) / 255;
      if (keepColors) continue;
      const al = a[i + 3] / 255 * Math.pow(Math.max(0, 1 - lum), 0.8);
      a[i] = ink[0]; a[i + 1] = ink[1]; a[i + 2] = ink[2]; a[i + 3] = Math.round(al * 255);
    }
    cx.putImageData(d, 0, 0);
    const spans = [];
    for (let y = 0; y < cv.height; y++) {
      const row = []; let st = -1;
      for (let x = 0; x < cv.width; x++) {
        const on = a[(y * cv.width + x) * 4 + 3] > 20;
        if (on && st < 0) st = x; if (!on && st >= 0) { row.push([st, x]); st = -1; }
      }
      if (st >= 0) row.push([st, cv.width]);
      // gộp các khe nhỏ để bút không nhấc liên tục
      const merged = []; for (const s of row) { const l = merged[merged.length - 1]; if (l && s[0] - l[1] < cv.width * 0.03) l[1] = s[1]; else merged.push(s.slice()); }
      spans.push(merged);
    }
    const res = { canvas: cv, width: cv.width, height: cv.height, spans };
    this.imageCache.set(key, res); return res;
  }

  queueStrokes(strokes, nib, speed, maxSec, style, optimize = true) {
    strokes = strokes.filter(s => s.length > 1).map(s => s.map(([x, y]) => [Math.min(G.SHEET_X1 - 0.004, Math.max(G.SHEET_X0 + 0.004, x)), Math.min(YTOP + 0.02, Math.max(Y_MIN, y))]));
    if (!strokes.length) return;
    const ordered = optimize ? optimizeOrder(strokes, [this.planPen?.[0] ?? this.pen.x, this.planPen?.[1] ?? this.pen.y]) : strokes;
    const L = strokesLength(ordered);
    const g = this.cfg().writer;
    const travelK = 2.2;
    let t = L.draw / speed + L.travel / (speed * travelK) + L.count * 0.1;
    const k = maxSec > 0 && t > maxSec ? Math.min(g.maxSpeedup || 4, t / maxSec) : 1;
    for (const s of ordered) this.steps.push({ k: 'stroke', pts: s, nib, speed: speed * k, travel: speed * k * travelK, zv: 0.22 * k, style });
    this.planPen = ordered[ordered.length - 1][ordered[ordered.length - 1].length - 1];
  }

  async start(job) {
    this.job = job; this.busy = true; this.steps = [];
    let ok = false;
    try { ok = job.type === 'donor' ? await this.planDonor(job) : await this.planName(job); }
    catch (e) { console.error('plan lỗi', e); }
    if (!ok) { this.busy = false; this.job = null; return false; }
    this.steps.push({ k: 'done' });
    return true;
  }

  clearPaper() { this.p.clear(); this.contentHigh = -Infinity; this.rowOpen = false; }

  // ---------------- chuyển động (gọi mỗi khung hình)
  tick(dt) {
    const feed = this.cfg().writer.paper?.feedSpeed || 0.12;
    let budget = dt;
    let guard = 0;
    while (budget > 1e-6 && guard++ < 5000) {
      if (!this.step) {
        this.step = this.steps.shift() || null;
        if (!this.step) break;
        this.prep(this.step);
      }
      const st = this.step;
      if (st.k === 'stroke') {
        // giai đoạn: nhấc -> di chuyển -> hạ -> vẽ
        if (st.phase === 'lift') { budget = this.zTo(st, G.PAPER_Z + st.lift, budget, st.zv); if (this.pen.z >= G.PAPER_Z + st.lift - 1e-6) st.phase = 'move'; continue; }
        if (st.phase === 'move') {
          const [tx, ty] = st.pts[0];
          if (!st.mv) { const d = Math.hypot(tx - this.pen.x, ty - this.pen.y); st.mv = { x0: this.pen.x, y0: this.pen.y, T: d / st.travel + 0.04, t: 0 }; }
          const mv = st.mv; const use = Math.min(budget, mv.T - mv.t); mv.t += use; budget -= use;
          const u = mv.t / mv.T, e = u * u * (3 - 2 * u);
          this.pen.x = mv.x0 + (tx - mv.x0) * e; this.pen.y = mv.y0 + (ty - mv.y0) * e;
          if (mv.t >= mv.T - 1e-9) st.phase = 'lower';
          continue;
        }
        if (st.phase === 'lower') { budget = this.zTo(st, G.PAPER_Z + 0.0003, budget, st.zv); if (this.pen.z <= G.PAPER_Z + 0.0003 + 1e-6) { st.phase = 'draw'; st.i = 1; } continue; }
        if (st.phase === 'draw') {
          const style = typeof st.style === 'function' ? st.style() : st.style;
          let dist = budget * st.speed;
          while (dist > 0 && st.i < st.pts.length) {
            const [tx, ty] = st.pts[st.i]; const dx = tx - this.pen.x, dy = ty - this.pen.y; const d = Math.hypot(dx, dy);
            if (d <= dist) { this.p.drawSeg(this.pen.x, this.pen.y, tx, ty, st.nib, style); this.pen.x = tx; this.pen.y = ty; dist -= d; st.i++; }
            else { const nx = this.pen.x + dx / d * dist, ny = this.pen.y + dy / d * dist; this.p.drawSeg(this.pen.x, this.pen.y, nx, ny, st.nib, style); this.pen.x = nx; this.pen.y = ny; dist = 0; }
          }
          budget = dist / st.speed;
          if (st.i >= st.pts.length) this.step = null; else budget = 0;
          continue;
        }
      } else if (st.k === 'advance') {
        if (this.pen.z < G.PAPER_Z + LIFT) { budget = this.zTo(st, G.PAPER_Z + LIFT, budget, 0.16); continue; }
        if (!st.T) { st.T = st.d / feed + 0.3; st.t = 0; st.done = 0; }
        const use = Math.min(budget, st.T - st.t); st.t += use; budget -= use;
        const u = st.t / st.T, e = u * u * (3 - 2 * u); const target = st.d * e; const ds = target - st.done; st.done = target;
        if (ds > 0) { this.p.advance(ds); this.m.setPaperS(this.p.s); }
        if (st.t >= st.T - 1e-9) this.step = null;
      } else if (st.k === 'call') { st.fn(); this.step = null; }
      else if (st.k === 'wait') { st.t = (st.t || 0) + budget; budget = 0; if (st.t >= st.T) this.step = null; }
      else if (st.k === 'done') { this.step = null; this.busy = false; const j = this.job; this.job = null; this.planPen = null; this.hooks.onJobDone && this.hooks.onJobDone(j); break; }
    }
    // khi rảnh: đưa bút về vị trí đỗ, lắc nhẹ cho tự nhiên
    if (!this.busy && !this.step && !this.steps.length) {
      this.idleT += dt;
      if (this.idleT > 1.2) {
        const k = 1 - Math.exp(-dt * 1.6);
        const t = performance.now() / 1000;
        const tx = PARK.x + Math.sin(t * 0.4) * 0.01, ty = PARK.y + Math.sin(t * 0.27) * 0.008, tz = G.PAPER_Z + 0.06 + Math.sin(t * 0.6) * 0.004;
        this.pen.x += (tx - this.pen.x) * k; this.pen.y += (ty - this.pen.y) * k; this.pen.z += (tz - this.pen.z) * k;
      } else if (this.pen.z < G.PAPER_Z + LIFT) this.pen.z = Math.min(G.PAPER_Z + LIFT, this.pen.z + dt * 0.16);
    } else this.idleT = 0;
    this.m.setPen(this.pen.x, this.pen.y, this.pen.z);
  }
  prep(st) {
    if (st.k !== 'stroke') return;
    const [x, y] = st.pts[0]; const d = Math.hypot(x - this.pen.x, y - this.pen.y);
    st.lift = d < 0.012 ? 0.0025 : d < 0.05 ? 0.006 : LIFT;          // bước ngắn chỉ nhấc bút nhẹ
    const near = d < st.nib * 0.6 && this.pen.z < G.PAPER_Z + 0.001;
    st.phase = near ? 'draw' : (this.pen.z < G.PAPER_Z + st.lift - 1e-6 ? 'lift' : 'move'); st.i = 1;
  }
  zTo(st, z, budget, v) {
    const d = z - this.pen.z; const need = Math.abs(d) / v;
    if (need <= budget) { this.pen.z = z; return budget - need; }
    this.pen.z += Math.sign(d) * v * budget; return 0;
  }
}

function hexToRgb(h) { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); const n = m ? parseInt(m[1], 16) : 0x1d140c; return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
