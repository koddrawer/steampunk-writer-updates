// Khung phát video nằm TRONG cửa sổ hiển thị: kéo thả/đổi cỡ, không ra ngoài khung.
// - 2 trình phát luân phiên: video mới chỉ hiện khi đã có khung hình đầu -> không nháy đen
// - tự cân cỡ nhân vật: đo khung bao nhân vật của từng video rồi phóng/thu để nhân vật cùng cỡ, cùng chỗ đứng
export class VideoBox {
  constructor(el, video, api, getCfg) {
    Object.assign(this, { el, api, cfg: getCfg });
    const v2 = video.cloneNode(); v2.removeAttribute('id'); el.insertBefore(v2, video.nextSibling);
    this.vs = [video, v2]; this.front = 0;
    for (const v of this.vs) { v.playsInline = true; v.preload = 'auto'; v.style.opacity = '0'; v.style.transition = 'opacity 0ms'; v.style.objectFit = 'fill'; v.style.inset = 'auto'; }
    this.cur = null; this.mode = 'hide'; this.token = 0; this.fit = {}; this.onCat = null;
    this.box = { ...(getCfg().display.videoBox || { x: 0.56, y: 0.04, w: 0.40, h: 0.3 }) };
    el.style.overflow = 'hidden';
    this.layout();
    window.addEventListener('resize', () => this.layout());
    // kéo / đổi cỡ
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation(); el.setPointerCapture(e.pointerId);
      const W = window.innerWidth, H = window.innerHeight;
      this.drag = { h: e.target.dataset.h || 'move', x: e.clientX / W, y: e.clientY / H, b: { ...this.box } };
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      const W = window.innerWidth, H = window.innerHeight; const d = this.drag;
      const dx = e.clientX / W - d.x, dy = e.clientY / H - d.y; const b = { ...d.b }; const MIN = 0.1;
      if (d.h === 'move') { b.x += dx; b.y += dy; }
      else {
        if (d.h.includes('l')) { b.x = Math.min(d.b.x + d.b.w - MIN, d.b.x + dx); b.w = d.b.w + (d.b.x - b.x); }
        if (d.h.includes('r')) b.w = Math.max(MIN, d.b.w + dx);
        if (d.h.includes('t')) { b.y = Math.min(d.b.y + d.b.h - MIN, d.b.y + dy); b.h = d.b.h + (d.b.y - b.y); }
        if (d.h.includes('b')) b.h = Math.max(MIN, d.b.h + dy);
      }
      this.box = this.clamp(b); this.place();
    });
    const up = () => { if (!this.drag) return; this.drag = null; this.api.setConfig({ display: { videoBox: this.box } }); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => e.stopPropagation());
    for (const [i, v] of this.vs.entries()) {
      v.addEventListener('ended', () => { if (i === this.front && this.cur) { const c = this.cur; this.cur = null; this.emitCat(); api.send('video:ended', { url: c.url }); } });
      v.addEventListener('error', () => { if (i === this.loading && this.pend) { const p = this.pend; this.pend = null; api.send('video:error', { url: p.url }); } });
    }
    api.on('video:play', (m) => this.play(m));
    api.on('video:stop', () => { this.token++; this.pend = null; this.cur = null; for (const v of this.vs) { v.pause(); v.style.opacity = '0'; } this.refresh(); this.emitCat(); });
    api.on('video:blank', (m) => {
      this.mode = m.mode;
      // chờ một chút: nếu có video kế tiếp ngay thì không ẩn (tránh nháy)
      clearTimeout(this.blankT);
      this.blankT = setTimeout(() => {
        if (this.cur || this.pend) return;
        if (m.mode === 'black') for (const v of this.vs) v.style.opacity = '0';
        this.refresh(); this.emitCat();
      }, 350);
    });
    api.on('video:refit', () => { this.fit = {}; this.refit = true; this.analyzeAll().then(() => { this.refit = false; if (this.cur) this.applyFit(this.vs[this.front], this.cur.file); }); });
    // phân tích sẵn các video để lần phát đầu đã cân đúng cỡ
    setTimeout(() => this.analyzeAll(), 1500);
  }
  clamp(b) {
    b.w = Math.min(1, Math.max(0.1, b.w)); b.h = Math.min(1, Math.max(0.1, b.h));
    b.x = Math.min(1 - b.w, Math.max(0, b.x)); b.y = Math.min(1 - b.h, Math.max(0, b.y));
    return b;
  }
  place() {
    const s = this.el.style; const b = this.box;
    s.left = (b.x * 100) + '%'; s.top = (b.y * 100) + '%'; s.width = (b.w * 100) + '%'; s.height = (b.h * 100) + '%';
    for (const [i, v] of this.vs.entries()) if (v.videoWidth) this.applyFit(v, v.__file);
  }
  layout() {
    const c = this.cfg();
    if (!this.drag && c.display.videoBox) this.box = this.clamp({ ...c.display.videoBox });
    this.el.style.background = c.video.boxBg || '#000';
    this.mode = c.video.whenNone || 'hide';
    this.place(); this.refresh();
  }

  // ---------- phát video không nháy
  play(m) {
    clearTimeout(this.blankT);
    const tok = ++this.token;
    const back = 1 - this.front; const v = this.vs[back];
    this.loading = back; this.pend = m;
    v.pause(); v.style.transition = 'opacity 0ms'; v.style.opacity = '0';
    v.loop = !!m.loop; v.volume = Math.max(0, Math.min(1, m.volume ?? 1)); v.muted = false; v.__file = m.file;
    v.src = m.url; v.load();
    const go = () => {
      if (tok !== this.token) return;
      this.applyFit(v, m.file);
      v.play().catch(() => { v.muted = true; return v.play(); }).catch(err => { if (tok === this.token) { this.pend = null; this.api.send('video:error', { url: m.url, err: String(err) }); } });
      const show = () => {
        if (tok !== this.token) return;
        const old = this.vs[this.front]; const fade = this.cfg().video.crossfadeMs ?? 220;
        v.style.zIndex = '2'; old.style.zIndex = '1';
        v.style.transition = `opacity ${fade}ms linear`; v.style.opacity = '1';
        setTimeout(() => { if (tok !== this.token) return; old.pause(); old.style.transition = 'opacity 0ms'; old.style.opacity = '0'; }, fade + 30);
        this.front = back; this.cur = m; this.pend = null; this.refresh(); this.emitCat();
      };
      if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(() => show()); else v.addEventListener('playing', show, { once: true });
      if (!this.fit[m.file] && !(this.cfg().video.fitData || {})[m.file]) this.analyze(m.url, m.file);
    };
    if (v.readyState >= 2) go(); else v.addEventListener('loadeddata', go, { once: true });
    this.refresh();
  }
  emitCat() { this.onCat && this.onCat(this.cur ? this.cur.cat : null); }
  refresh() {
    const edit = !!this.cfg().video.editFrame;
    const show = !!this.cur || !!this.pend || edit || this.mode === 'black' || this.mode === 'last';
    this.el.classList.toggle('on', show);
    this.el.classList.toggle('edit', edit);
    this.el.classList.toggle('empty', !this.cur && !this.pend);
  }

  // ---------- tự cân cỡ nhân vật
  fitOf(file) { return this.fit[file] || (this.refit ? null : (this.cfg().video.fitData || {})[file]); }
  applyFit(v, file) {
    const c = this.cfg().video;
    const bw = this.el.clientWidth || 1, bh = this.el.clientHeight || 1, vw = v.videoWidth || 16, vh = v.videoHeight || 9;
    const sc0 = c.fit === 'cover' ? Math.max(bw / vw, bh / vh) : c.fit === 'fill' ? 0 : Math.min(bw / vw, bh / vh);
    let dw = vw * sc0, dh = vh * sc0, ox = (bw - dw) / 2, oy = (bh - dh) / 2;
    if (c.fit === 'fill') { dw = bw; dh = bh; ox = 0; oy = 0; }
    Object.assign(v.style, { left: ox + 'px', top: oy + 'px', width: dw + 'px', height: dh + 'px', transformOrigin: '0 0', transform: 'none' });
    const f = this.fitOf(file);
    if (!c.autoScale || !f || f.none) return;
    // cỡ đích: % chiều cao khung do người dùng chọn, hoặc trung vị của tất cả video
    const files = new Set(Object.values(c.categories || {}).flatMap(x => x.files || []));
    const all = [...files].map(f => this.fitOf(f)).filter(x => x && !x.none);
    const contain = (x) => { const s0 = Math.min(bw / (x.ar * 100), bh / 100); return { dh: 100 * s0, dw: x.ar * 100 * s0 }; };
    const med = (arr) => { const a = arr.slice().sort((p, q) => p - q); return a.length ? a[Math.floor(a.length / 2)] : 0; };
    const T = c.charSize > 0 ? c.charSize / 100 * bh : med(all.map(x => x.h * contain(x).dh)) || f.h * dh;
    const Ay = med(all.map(x => { const k = contain(x); return (bh - k.dh) / 2 + x.bottom * k.dh; })) || oy + f.bottom * dh;
    const Ax = med(all.map(x => { const k = contain(x); return (bw - k.dw) / 2 + x.cx * k.dw; })) || ox + f.cx * dw;
    const s = Math.min(2.5, Math.max(0.5, T / Math.max(1, f.h * dh)));
    const px = f.cx * dw, py = f.bottom * dh;
    const tx = (Ax - ox) - s * px, ty = (Math.min(bh, Ay) - oy) - s * py;
    v.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
  }
  // đo khung bao nhân vật: điểm ảnh khác màu nền (lấy theo viền khung hình), ở 2 thời điểm
  analyze(url, file) {
    if (!file || this.analyzing?.has(file)) return Promise.resolve();
    (this.analyzing = this.analyzing || new Set()).add(file);
    return new Promise((resolve) => {
      const v = document.createElement('video'); v.crossOrigin = 'anonymous'; v.muted = true; v.preload = 'auto'; v.src = url;
      const W = 128; let H = 72; const cv = document.createElement('canvas'); const x = cv.getContext('2d', { willReadFrequently: true });
      const fg = []; const times = [];
      const done = (data) => { this.fit[file] = data; this.api.send('video:fit', { file, data }); v.removeAttribute('src'); v.load(); resolve(data);
        if (this.cur && this.cur.file === file) this.applyFit(this.vs[this.front], file); };
      v.addEventListener('error', () => done({ none: true }), { once: true });
      v.addEventListener('loadedmetadata', () => {
        H = Math.max(8, Math.round(W * v.videoHeight / v.videoWidth)); cv.width = W; cv.height = H;
        const d = v.duration || 2; times.push(Math.min(d * 0.25, 1.2), Math.min(d * 0.6, 3));
        v.currentTime = times.shift();
      }, { once: true });
      v.addEventListener('seeked', function onSeek() {
        try { x.drawImage(v, 0, 0, W, H); fg.push(x.getImageData(0, 0, W, H).data); } catch { v.removeEventListener('seeked', onSeek); done({ none: true }); return; }
        if (times.length) { v.currentTime = times.shift(); return; }
        v.removeEventListener('seeked', onSeek);
        done(measure(fg, W, H, v.videoWidth / v.videoHeight));
      });
    });
  }
  async analyzeAll() {
    const c = this.cfg().video; const files = Object.values(c.categories || {}).flatMap(x => x.files || []);
    for (const f of files) if (!this.fitOf(f)) await this.analyze(this.api.mediaUrl(f), f);
  }
}

function measure(frames, W, H, ar) {
  const N = W * H; const mask = new Uint8Array(N);
  for (const d of frames) {
    // màu nền = trung vị các điểm viền
    const rs = [], gs = [], bs = [];
    for (let x = 0; x < W; x++) for (const y of [0, H - 1]) { const i = (y * W + x) * 4; rs.push(d[i]); gs.push(d[i + 1]); bs.push(d[i + 2]); }
    for (let y = 0; y < H; y++) for (const x of [0, W - 1]) { const i = (y * W + x) * 4; rs.push(d[i]); gs.push(d[i + 1]); bs.push(d[i + 2]); }
    const md = (a) => a.sort((p, q) => p - q)[a.length >> 1];
    const R = md(rs), Gc = md(gs), B = md(bs);
    for (let i = 0; i < N; i++) { const k = i * 4; if (Math.abs(d[k] - R) + Math.abs(d[k + 1] - Gc) + Math.abs(d[k + 2] - B) > 70) mask[i] = 1; }
  }
  // khối lớn nhất
  const seen = new Uint8Array(N); let best = null;
  for (let s = 0; s < N; s++) {
    if (!mask[s] || seen[s]) continue;
    const st = [s]; seen[s] = 1; const c = { n: 0, x0: W, y0: H, x1: 0, y1: 0 };
    while (st.length) { const i = st.pop(); const x = i % W, y = (i / W) | 0; c.n++;
      if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < N && mask[j] && !seen[j] && Math.abs((j % W) - x) <= 1) { seen[j] = 1; st.push(j); } }
    if (!best || c.n > best.n) best = c;
  }
  if (!best || best.n < N * 0.02) return { none: true, ar };
  const bwF = (best.x1 - best.x0 + 1) / W, bhF = (best.y1 - best.y0 + 1) / H;
  if (bwF * bhF > 0.9) return { none: true, ar };                // nền phức tạp, không đo được
  return { cx: (best.x0 + best.x1 + 1) / 2 / W, bottom: (best.y1 + 1) / H, top: best.y0 / H, h: bhF, ar };
}
