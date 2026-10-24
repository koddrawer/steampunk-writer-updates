// Bộ lập kế hoạch nét + điều khiển chuyển động ngòi bút (nhấc/hạ bút, di chuyển, kéo giấy).
import { G } from './machine.js';
import { layoutText, textToStrokes, strokesLength, sanitize, hasRenderable, wrapText, sortLTR } from './text.js';
import { buildBadge, TEMPLATES } from './badge.js';
import { processFrame, placeName } from './frameimg.js';

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

  // một dòng chữ trên một hàng mới (giấy cuộn lên 1 dòng)
  newRow(rowH, cap) {
    this.advanceFor(rowH, cap * 0.4);
    this.rowOpen = true; this.rowH = rowH; this.xCur = G.SHEET_X0 + 0.03; this.contentHigh = YTOP;
  }
  writeInline(L, cap, c, x) {
    const base = YTOP - cap * 1.45; const ox = x - L.bbox.x0;
    const jitter = (Math.random() - 0.5) * cap * 0.06;
    const nib = (c.nibMm || 1.6) / 1000;
    const strokes = textToStrokes(L, { nib, fill: c.fill || 'hatch', place: ([px, py]) => [px + ox, py + base + jitter] });
    this.queueStrokes(strokes, nib, c.speed || 0.35, c.maxSec || 8, null, 'keep');
  }

  async planName(job) {
    const c = this.cfg().writer.names;
    const chain = await this.fonts.chain(c.fontId);
    let text = sanitize(chain, job.text || job.name, 160);
    if (!text || !hasRenderable(chain, text)) text = sanitize(chain, job.alt || '', c.maxChars || 20);
    if (!text) return false;
    const cap = (c.sizeCm || 3.5) / 100;
    const probe = layoutText(chain, 'H', 1); let em = cap / (probe.capHeight || 0.7);
    const margin = 0.03, maxW = G.SHEET_W - 2 * margin;
    const rowH = cap * 2.1;
    let L = layoutText(chain, text, em);
    if (L.width <= maxW) {
      // ngắn: viết nối tiếp trên cùng hàng, hết chỗ thì sang hàng mới
      const gap = em * 0.55;
      if (!this.rowOpen || this.xCur + L.width > G.SHEET_X1 - margin || Math.abs(this.rowH - rowH) > 1e-4) this.newRow(rowH, cap);
      this.writeInline(L, cap, c, this.xCur);
      this.xCur += L.width + gap;
      return true;
    }
    // dài: ngắt thành nhiều dòng (tối đa 3), mỗi dòng một hàng
    let lines = wrapText(chain, text, em, maxW);
    while (lines.length > 3 && em > cap * 0.6) { em *= 0.85; lines = wrapText(chain, text, em, maxW); }
    const capL = cap * em / (cap / (probe.capHeight || 0.7));
    for (const ln of lines.slice(0, 4)) {
      let LL = layoutText(chain, ln, em);
      if (LL.width > maxW) LL = layoutText(chain, ln, em * maxW / LL.width);
      this.newRow(capL * 2.1, capL);
      this.writeInline(LL, capL, c, G.SHEET_X0 + margin);
    }
    this.rowOpen = false;
    return true;
  }

  // câu trích dẫn khi vắng: khối chữ căn giữa, nhiều dòng, tên tác giả bên dưới
  async planQuote(job) {
    const c = this.cfg().writer.quotes || {};
    const chain = await this.fonts.chain(c.fontId);
    const text = sanitize(chain, job.text, 400); if (!text) return false;
    const author = job.author ? sanitize(chain, job.author, 60) : '';
    const probe = layoutText(chain, 'H', 1); const capR = probe.capHeight || 0.7;
    const avail = YTOP - Y_MIN - 0.02, maxW = G.SHEET_W * ((c.widthPct || 84) / 100);
    let cap = (c.sizeCm || 5) / 100, acap = (c.authorSizeCm || 2.8) / 100, lines, H;
    for (let k = 0; k < 12; k++) {
      lines = wrapText(chain, text, cap / capR, maxW);
      H = lines.length * cap * 1.9 + (author ? acap * 2.4 : 0) + (c.divider !== false ? 0.035 : 0);
      if (H <= avail) break; cap *= 0.88; acap *= 0.92;
    }
    this.rowOpen = false;
    // quote trước vừa viết xong: cuộn cho khuất hẳn qua trục trước rồi mới viết quote mới
    if (c.clearPrev !== false && this.lastType === 'quote' && this.contentHigh !== -Infinity) {
      const d = (this.contentHigh - G.FR_Y) + G.FR_R * 2.7 + 0.03;
      if (d > 0) this.steps.push({ k: 'advance', d, speed: c.clearFeedSpeed || 0.35, clear: true });
      this.contentHigh = -Infinity;
    }
    this.advanceFor(H, 0.045);
    this.contentHigh = YTOP;
    const cx = (G.SHEET_X0 + G.SHEET_X1) / 2;
    const nib = (c.nibMm || 1.8) / 1000;
    const all = [];
    let y = YTOP - cap * 1.35;
    let blockR = cx;
    for (const ln of lines) {
      const L = layoutText(chain, ln, cap / capR); const ox = cx - L.width / 2 - L.bbox.x0 * 0, oy = y;
      blockR = Math.max(blockR, cx + L.width / 2);
      all.push(...textToStrokes(L, { nib, fill: c.fill || 'hatch', place: ([px, py]) => [px + ox, py + oy] }));
      y -= cap * 1.9;
    }
    if (author) {
      const La = layoutText(chain, '— ' + author, acap / capR); const ay = y + cap * 1.9 - cap * 0.55 - acap * 1.6;
      const ox = blockR - La.width;
      all.push(...textToStrokes(La, { nib: nib * 0.85, fill: c.fill || 'hatch', place: ([px, py]) => [px + ox, py + ay] }));
      y = ay - acap * 0.8;
    }
    this.queueStrokes(all, nib, c.speed || 0.4, c.maxSec || 35, null, 'keep');
    if (c.divider !== false) {
      const dy = y + cap * 1.9 - cap * 0.6 - 0.02; const w = Math.min(0.18, maxW * 0.25);
      const dia = [[cx - 0.008, dy], [cx, dy + 0.006], [cx + 0.008, dy], [cx, dy - 0.006], [cx - 0.008, dy]];
      this.queueStrokes([[[cx - w, dy], [cx - 0.014, dy]], dia, [[cx + 0.014, dy], [cx + w, dy]]], nib * 0.7, c.speed || 0.4, 0, null, 'keep');
    }
    return true;
  }

  // Dừng câu quote đang viết dở: nhấc bút, cuộn giấy cho chữ dở chạy khuất qua trục trước, rồi mới viết tên
  // viết xong: chữ ánh vàng lên rồi về lại màu mực
  afterJob(job) {
    const box = this.p.trackStop ? this.p.trackStop() : null;
    if (job) this.lastType = job.__aborted ? null : job.type;
    const g = this.cfg().writer.glow || {};
    if (!job || job.__aborted || !box || !g.enabled) return;
    const kind = job.type === 'donor' ? 'donor' : job.type === 'quote' ? 'quote' : job.source === 'comment' || job.source === 'giftComment' ? 'comment' : 'name';
    if ((g.types || {})[kind] === false) return;
    this.p.glow(box, { sec: g.sec ?? 1.8, color: g.color || '#ffc94a', strength: g.strength ?? 1 });
  }
  abort() {
    if (!this.busy || this.aborting) return;
    if (this.planning) { this.abortPending = true; return; }
    if (this.job) this.job.__aborted = true;
    if (!this.inked) { this.step = null; this.steps = [{ k: 'done' }]; this.restoreLayout(); return; }   // chưa kịp viết chữ nào
    this.aborting = true;
    const q = this.cfg().writer.quotes || {};
    const d = (YTOP - G.FR_Y) + G.FR_R * 2.7 + 0.03;      // từ mép trên vùng viết, qua đỉnh trục trước, quấn xuống khuất
    this.step = null;
    this.steps = [{ k: 'advance', d, speed: q.clearFeedSpeed || 0.35 },
      { k: 'call', fn: () => { this.contentHigh = -Infinity; this.rowOpen = false; this.aborting = false; } }, { k: 'done' }];
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
    const bg = this.pickBackground(job);
    const nibName = (c.nibMm || 3) / 1000, nibDeco = (c.decoNibMm || 1.4) / 1000;
    const place = ([x, y]) => [cx + x, cy + y];
    this.hooks.onDonorStart && this.hooks.onDonorStart({ cx, cy, W, H });

    if (!bg || bg.type === 'template') {
      const tpl = bg && TEMPLATES[bg.template] ? bg.template : 'seal';
      const b = buildBadge(tpl, { W, H, chains: { name: nameChain, deco: decoChain }, name,
        top: fill(bg?.top ?? c.topText), bottom: fill(bg?.bottom ?? c.bottomText), small: fill(bg?.small ?? c.smallText), nibName, nibDeco });
      this.queueStrokes(b.deco.map(s => s.map(place)), nibDeco, c.decoSpeed || 0.6, 0, null, 'ltr');
      this.queueStrokes(b.names.map(s => s.map(place)), nibName, c.speed || 0.45, 0, null, 'keep');
    } else {
      // khung ảnh của người dùng: vẽ lại nét hoa văn bằng bút, viết tên vào vùng khung xanh lá
      let fr = null;
      try { fr = await processFrame(window.api && window.api.mediaUrl ? window.api.mediaUrl(bg.file) : bg.file, { sens: (bg.sens ?? 50) / 100, clearBox: bg.clearBox !== false, ink: this.p.ink }); } catch (e) { console.warn('khung ảnh lỗi', e); }
      let box = null;
      if (fr) {
        const s = Math.min((G.SHEET_W - 0.06) / fr.w, H / fr.h);        // theo đúng tỉ lệ ảnh khung
        const toM = ([x, y]) => [cx + (x - fr.w / 2) * s, cy + (fr.h / 2 - y) * s];
        const px2m = s;
        // ngòi bút đi theo đường giữa của từng nét hoa văn; mực đổ ra đúng hình nét trong ảnh (không lem ra ngoài)
        const [ax, ay] = toM([0, 0]);
        let pat = null;
        const style = () => { if (!pat) pat = this.p.makePattern(fr.inkCanvas, ax, ay, fr.w * s, fr.h * s); return pat.pat; };
        const steps = sortStrokes(fr.strokes).map(st => ({ pts: st.pts.map(toM), nib: (st.width + 2.5) * px2m }));
        const travelK = 2.2, sp = c.decoSpeed || 0.7;
        for (const st of steps) this.steps.push({ k: 'stroke', pts: clampPts(st.pts), nib: st.nib, speed: sp, travel: sp * travelK, zv: 0.22, mc: 0.04, style });
        // tên: tự dàn theo hình vùng xanh (chữ nhật / vòng cung / sóng / to nhỏ không đều)
        const pn = placeName(nameChain, name, fr, { pad: (bg.namePad ?? 8) / 100, mode: bg.nameMode || 'auto' });
        const nibM = Math.min(nibName, Math.max(0.0008, pn.nib * s));
        box = { strokes: pn.strokes.map(st => st.map(toM)), nib: nibM };
      }
      let strokes, nib;
      if (box && box.strokes) { strokes = box.strokes; nib = box.nib; }
      else {
        const bx = { cx, cy: cy + ((bg.nameYOffset ?? 0) / 100) * H, w: W * (bg.nameWidth ?? 70) / 100, h: H * 0.3 };
        const pad = (bg.namePad ?? 8) / 100;
        const L1 = layoutText(nameChain, name, 1);
        const bh1 = (L1.bbox.y1 - L1.bbox.y0) || 1, bw1 = (L1.bbox.x1 - L1.bbox.x0) || 1;
        const em = Math.min(bx.w * (1 - 2 * pad) / bw1, bx.h * (1 - 2 * pad) / bh1);
        const L = layoutText(nameChain, name, em);
        const ox = bx.cx - (L.bbox.x0 + L.bbox.x1) / 2, oy = bx.cy - (L.bbox.y0 + L.bbox.y1) / 2;
        nib = Math.min(nibName, Math.max(0.0008, em * 0.045));
        strokes = textToStrokes(L, { nib, fill: 'hatch', place: ([x, y]) => [x + ox, y + oy] });
      }
      this.queueStrokes(strokes, nib, c.speed || 0.45, 0, null, 'keep');
    }
    this.steps.push({ k: 'call', fn: () => this.hooks.onDonorEnd && this.hooks.onDonorEnd() });
    return true;
  }

  pickBackground(job) {
    const c = this.cfg();
    // bậc donate: chọn bậc cao nhất mà tổng xu đạt tới, lấy ngẫu nhiên 1 logo trong bậc đó
    if ((c.writer.donors.bgMode || 'tiers') === 'tiers') {
      const total = job ? (job.total ?? (job.diamonds || 0) * (job.count || 1)) : 0;
      const tiers = (c.writer.donors.tiers || []).filter(t => t.enabled !== false).sort((a, b) => (b.min || 0) - (a.min || 0));
      const tier = tiers.find(t => total >= (t.min || 0)) || tiers[tiers.length - 1];
      if (tier) {
        const opts = (tier.bgs || []).map(id => (c.backgrounds || []).find(b => b.id === id)).filter(Boolean);
        if (opts.length) { this.lastTier = tier.name; return opts[Math.floor(Math.random() * opts.length)]; }
      }
    }
    const list = (c.backgrounds || []).filter(b => b.enabled !== false);
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

  queueStrokes(strokes, nib, speed, maxSec, style, order = 'ltr') {
    strokes = strokes.filter(s => s.length > 1).map(s => s.map(([x, y]) => [Math.min(G.SHEET_X1 - 0.004, Math.max(G.SHEET_X0 + 0.004, x)), Math.min(YTOP + 0.02, Math.max(Y_MIN, y))]));
    if (!strokes.length) return;
    const ordered = order === 'opt' ? optimizeOrder(strokes, [this.planPen?.[0] ?? this.pen.x, this.planPen?.[1] ?? this.pen.y]) : order === 'ltr' ? sortLTR(strokes) : strokes;
    const travelK = 2.2;
    for (const s of ordered) this.steps.push({ k: 'stroke', pts: s, nib, speed, travel: speed * travelK, zv: 0.22, mc: 0.04, style });
    this.planPen = ordered[ordered.length - 1][ordered[ordered.length - 1].length - 1];
  }

  async start(job) {
    this.saved = { contentHigh: this.contentHigh, rowOpen: this.rowOpen, xCur: this.xCur, rowH: this.rowH }; this.advanced = 0;
    this.p.trackStart && this.p.trackStart();
    this.job = job; this.busy = true; this.steps = []; this.inked = false; this.planning = true; this.abortPending = false;
    let ok = false;
    try { ok = job.type === 'donor' ? await this.planDonor(job) : job.type === 'quote' ? await this.planQuote(job) : await this.planName(job); }
    catch (e) { console.error('plan lỗi', e); }
    this.planning = false;
    if (!ok) { this.busy = false; this.job = null; return false; }
    if (this.abortPending) { this.abortPending = false; this.steps = [{ k: 'done' }]; this.restoreLayout(); this.hooks.onJobStart && this.hooks.onJobStart(job); return true; }
    const W = this.cfg().writer;
    const sec = job.type === 'donor' ? W.donors.maxSec : job.type === 'quote' ? W.quotes?.maxSec : (job.source === 'comment' || job.source === 'giftComment') ? (W.names.comments?.maxSec ?? W.names.maxSec) : W.names.maxSec;
    this.fitTime(sec);
    this.steps.push({ k: 'done' });
    this.hooks.onJobStart && this.hooks.onJobStart(job);
    return true;
  }

  // Ước lượng thời gian vẽ của toàn bộ nét (giống hệt cách bộ chạy di chuyển bút),
  // rồi tăng tốc đều tất cả để viết xong trong <= sec giây (tối đa 10 giây).
  estimate(strokes) {
    let x = this.pen.x, y = this.pen.y, down = this.pen.z < G.PAPER_Z + 0.001, t = 0;
    for (const st of strokes) {
      const [sx, sy] = st.pts[0]; const d = Math.hypot(sx - x, sy - y);
      if (!(d < st.nib * 0.6 && down)) {
        const lift = d < 0.012 ? 0.0025 : d < 0.05 ? 0.006 : LIFT;
        t += (down ? lift : 0) / st.zv + lift / st.zv + d / st.travel + st.mc;
      }
      for (let i = 1; i < st.pts.length; i++) t += Math.hypot(st.pts[i][0] - st.pts[i - 1][0], st.pts[i][1] - st.pts[i - 1][1]) / st.speed;
      [x, y] = st.pts[st.pts.length - 1]; down = true;
    }
    return t;
  }
  fitTime(sec) {
    const limit = Math.min(10, Math.max(1, +sec || 10));
    // cuộn giấy trước khi viết cũng tính vào thời gian: tối đa 25% quỹ thời gian
    const feed = this.cfg().writer.paper?.feedSpeed || 0.12;
    let advT = 0;
    for (const st of this.steps.filter(s => s.k === 'advance' && !s.clear)) {
      const T0 = st.d / (st.speed || feed) + 0.3, cap = Math.max(0.8, limit * 0.25);
      if (T0 > cap) st.speed = st.d / (cap - 0.3);
      advT += Math.min(T0, cap);
    }
    const strokes = this.steps.filter(s => s.k === 'stroke'); if (!strokes.length) return;
    const t = this.estimate(strokes);
    const k = t / (Math.max(limit * 0.5, limit - advT) * 0.96);
    if (k > 1) for (const st of strokes) { st.speed *= k; st.travel *= k; st.zv *= k; st.mc /= k; }
    this.lastEstimate = Math.min(t, limit);
  }

  // huỷ bố cục đã lập cho việc bị bỏ (chỉ tính phần giấy thực sự đã cuộn)
  restoreLayout() {
    const sv = this.saved; if (!sv) return;
    this.contentHigh = sv.contentHigh === -Infinity ? -Infinity : sv.contentHigh - this.advanced;
    this.rowOpen = this.advanced > 0 ? false : sv.rowOpen; this.xCur = sv.xCur; this.rowH = sv.rowH;
  }
  clearPaper() { this.p.clear(); this.contentHigh = -Infinity; this.rowOpen = false; }

  // ---------------- chuyển động (gọi mỗi khung hình)
  tick(dt) {
    this.p.updateGlow && this.p.updateGlow(dt);
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
          if (!st.mv) { const d = Math.hypot(tx - this.pen.x, ty - this.pen.y); st.mv = { x0: this.pen.x, y0: this.pen.y, T: d / st.travel + (st.mc ?? 0.04), t: 0 }; }
          const mv = st.mv; const use = Math.min(budget, mv.T - mv.t); mv.t += use; budget -= use;
          const u = mv.t / mv.T, e = u * u * (3 - 2 * u);
          this.pen.x = mv.x0 + (tx - mv.x0) * e; this.pen.y = mv.y0 + (ty - mv.y0) * e;
          if (mv.t >= mv.T - 1e-9) st.phase = 'lower';
          continue;
        }
        if (st.phase === 'lower') { budget = this.zTo(st, G.PAPER_Z + 0.0003, budget, st.zv); if (this.pen.z <= G.PAPER_Z + 0.0003 + 1e-6) { st.phase = 'draw'; st.i = 1; } continue; }
        if (st.phase === 'draw') {
          const style = typeof st.style === 'function' ? st.style() : st.style;
          this.inked = true;
          if (st.alpha === undefined) st.alpha = st.style ? 1 : 0.8 + Math.random() * 0.2;   // độ đậm mực thay đổi nhẹ giữa các nét
          let dist = budget * st.speed;
          while (dist > 0 && st.i < st.pts.length) {
            const [tx, ty] = st.pts[st.i]; const dx = tx - this.pen.x, dy = ty - this.pen.y; const d = Math.hypot(dx, dy);
            if (d <= dist) { this.p.drawSeg(this.pen.x, this.pen.y, tx, ty, st.nib, style, st.alpha); this.pen.x = tx; this.pen.y = ty; dist -= d; st.i++; }
            else { const nx = this.pen.x + dx / d * dist, ny = this.pen.y + dy / d * dist; this.p.drawSeg(this.pen.x, this.pen.y, nx, ny, st.nib, style, st.alpha); this.pen.x = nx; this.pen.y = ny; dist = 0; }
          }
          budget = dist / st.speed;
          if (st.i >= st.pts.length) this.step = null; else budget = 0;
          continue;
        }
      } else if (st.k === 'advance') {
        if (this.pen.z < G.PAPER_Z + LIFT) { budget = this.zTo(st, G.PAPER_Z + LIFT, budget, 0.16); continue; }
        if (!st.T) { st.T = st.d / (st.speed || feed) + 0.3; st.t = 0; st.done = 0; }
        const use = Math.min(budget, st.T - st.t); st.t += use; budget -= use;
        const u = st.t / st.T, e = u * u * (3 - 2 * u); const target = st.d * e; const ds = target - st.done; st.done = target;
        if (ds > 0) { this.p.advance(ds); this.m.setPaperS(this.p.s); this.advanced += ds; }
        if (st.t >= st.T - 1e-9) this.step = null;
      } else if (st.k === 'call') { st.fn(); this.step = null; }
      else if (st.k === 'wait') { st.t = (st.t || 0) + budget; budget = 0; if (st.t >= st.T) this.step = null; }
      else if (st.k === 'done') { this.afterJob(this.job); this.step = null; this.busy = false; const j = this.job; this.job = null; this.planPen = null; this.hooks.onJobDone && this.hooks.onJobDone(j); break; }
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

// nét khung: trái -> phải theo mép trái, đảo chiều nét hở để bắt đầu từ đầu bên trái
function sortStrokes(strokes) {
  return strokes.map(s => (s.pts[0][0] <= s.pts[s.pts.length - 1][0] ? s : { ...s, pts: s.pts.slice().reverse() }))
    .sort((a, b) => Math.min(...a.pts.map(p => p[0])) - Math.min(...b.pts.map(p => p[0])));
}
function clampPts(pts) { return pts.map(([x, y]) => [Math.min(G.SHEET_X1 - 0.004, Math.max(G.SHEET_X0 + 0.004, x)), Math.min(YTOP + 0.02, Math.max(Y_MIN, y))]); }
function hexToRgb(h) { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); const n = m ? parseInt(m[1], 16) : 0x1d140c; return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
