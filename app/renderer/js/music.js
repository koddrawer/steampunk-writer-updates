// Nhạc nền: 2 trình phát luân phiên để chuyển bài mượt (crossfade), trộn bài, tự giảm âm khi phát video chào/cảm ơn.
export class Music {
  constructor(a1, a2, api, getCfg) {
    Object.assign(this, { api, cfg: getCfg });
    this.as = [a1, a2]; this.front = 0; this.idx = -1; this.order = []; this.history = [];
    this.paused = false; this.duckCat = null; this.gain = [0, 0]; this.fading = null; this.err = 0;
    for (const [i, a] of this.as.entries()) {
      a.volume = 0;
      a.addEventListener('ended', () => { if (i === this.front) this.next(); });
      a.addEventListener('error', () => { if (i === this.front && a.src) { this.err++; if (this.err < 5) setTimeout(() => this.next(), 500); } });
    }
    api.on('music:cmd', ({ cmd, arg }) => {
      if (cmd === 'next') this.next(true);
      else if (cmd === 'prev') this.prev();
      else if (cmd === 'pause') { this.paused = true; for (const a of this.as) a.pause(); this.fading = null; this.report(); }
      else if (cmd === 'play') { this.paused = false; if (this.cur()?.src) this.cur().play().catch(() => {}); else this.next(); this.report(); }
      else if (cmd === 'track') this.playFile(arg);
    });
    this.lastTick = performance.now();
    setInterval(() => this.tick(), 50);
    setInterval(() => this.report(), 2000);
    this.sync();
  }
  cur() { return this.as[this.front]; }
  files() { return (this.cfg().music?.files || []).slice(); }
  // gọi khi cấu hình đổi
  sync() {
    const m = this.cfg().music || {}; const list = this.files();
    if (!m.enabled || !list.length) { for (const a of this.as) { a.pause(); } this.stoppedByCfg = true; this.report(); return; }
    const c = this.cur();
    if (c.__file && !list.includes(c.__file)) { this.next(); return; }       // bài đang phát bị xoá
    if (this.stoppedByCfg || !c.src) { this.stoppedByCfg = false; if (!this.paused) { if (c.src && c.__file) c.play().catch(() => {}); else this.next(); } }
  }
  pickNext() {
    const list = this.files(); if (!list.length) return null;
    if (this.cfg().music.shuffle) {
      if (!this.order.length || this.order.some(f => !list.includes(f))) {
        this.order = list.slice().sort(() => Math.random() - 0.5);
        const last = this.cur().__file;
        if (this.order.length > 1 && this.order[0] === last) this.order.push(this.order.shift());
      }
      return this.order.shift();
    }
    const i = list.indexOf(this.cur().__file); return list[(i + 1) % list.length];
  }
  next(manual) {
    const f = this.pickNext(); if (!f) return;
    if (this.cur().__file) this.history.push(this.cur().__file); if (this.history.length > 50) this.history.shift();
    this.playFile(f, manual);
  }
  prev() { const f = this.history.pop(); if (f) this.playFile(f, true); else this.playFile(this.cur().__file || this.pickNext(), true); }
  playFile(f) {
    const m = this.cfg().music || {}; if (!f) return;
    const back = 1 - this.front; const a = this.as[back];
    a.pause(); a.__file = f; a.src = this.api.mediaUrl(f); a.currentTime = 0; this.gain[back] = 0; a.volume = 0;
    this.paused = false; this.switching = true;
    const tok = this.tok = (this.tok || 0) + 1; let swapped = false;
    const swap = () => {
      if (swapped || tok !== this.tok) return; swapped = true;
      this.err = 0; this.switching = false;
      const old = this.front; this.front = back;
      this.fading = { t0: performance.now(), T: Math.max(0.05, m.crossfadeSec ?? 3), from: old };
      this.report();
    };
    a.addEventListener('playing', swap, { once: true });
    const p = a.play(); if (p) p.then(swap).catch(() => { if (swapped || tok !== this.tok) return; this.switching = false; this.err++; if (this.err < 5) setTimeout(() => this.next(), 800); });
  }
  duck(cat) { this.duckCat = cat; }
  target() {
    const m = this.cfg().music || {}; let v = Math.max(0, Math.min(1, m.volume ?? 0.35));
    if (m.duck !== false && this.duckCat && (m.duckCats || ['greet', 'thanks']).includes(this.duckCat)) v *= (m.duckPct ?? 25) / 100;
    return v;
  }
  tick() {
    const now = performance.now(); const dt = Math.min(1, (now - this.lastTick) / 1000); this.lastTick = now;
    const m = this.cfg().music || {}; const tgt = this.target();
    const f = this.fading;
    if (f) {
      const u = Math.min(1, (now - f.t0) / 1000 / f.T);
      this.gain[this.front] = u; this.gain[f.from] = Math.min(this.gain[f.from], 1 - u);
      if (u >= 1) { const o = this.as[f.from]; o.pause(); this.gain[f.from] = 0; this.fading = null; }
    } else this.gain[this.front] = 1;
    // nhỏ dần trước khi hết bài -> nối bài mượt
    const c = this.cur(); const xf = m.crossfadeSec ?? 3;
    if (!f && !this.switching && c.duration && isFinite(c.duration) && c.duration > xf * 3 && c.duration - c.currentTime < xf && !c.paused && this.files().length > 1) this.next();
    // âm lượng mượt (giảm/tăng khi duck)
    this.vol = this.vol ?? tgt; this.vol += (tgt - this.vol) * (1 - Math.exp(-dt * 4));
    for (const [i, a] of this.as.entries()) a.volume = Math.max(0, Math.min(1, this.vol * this.gain[i]));
  }
  report() {
    const c = this.cur(); const m = this.cfg().music || {};
    this.api.send('music:status', { file: c.__file || null, playing: !!c.__file && !c.paused && !!m.enabled, paused: this.paused,
      t: Math.floor(c.currentTime || 0), dur: Math.floor(isFinite(c.duration) ? c.duration : 0), ducked: this.target() < (m.volume ?? 0.35) - 1e-3 });
  }
}
