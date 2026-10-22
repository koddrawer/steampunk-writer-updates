// Khung phát video nằm TRONG cửa sổ hiển thị: kéo thả/đổi cỡ, không ra ngoài khung.
export class VideoBox {
  constructor(el, video, api, getCfg) {
    Object.assign(this, { el, v: video, api, cfg: getCfg });
    this.cur = null; this.mode = 'hide';
    this.box = { ...(getCfg().display.videoBox || { x: 0.56, y: 0.04, w: 0.40, h: 0.3 }) };
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
    // phát
    video.addEventListener('ended', () => { if (this.cur) api.send('video:ended', { url: this.cur.url }); this.cur = null; this.refresh(); });
    video.addEventListener('error', () => { if (this.cur) api.send('video:error', { url: this.cur.url }); this.cur = null; this.refresh(); });
    api.on('video:play', (m) => this.play(m));
    api.on('video:stop', () => { this.v.pause(); this.v.removeAttribute('src'); this.v.load(); this.cur = null; this.refresh(); });
    api.on('video:blank', (m) => { this.mode = m.mode; if (m.mode === 'black') { this.v.pause(); this.v.removeAttribute('src'); this.v.load(); } else if (m.mode === 'last') this.v.pause(); this.refresh(); });
  }
  clamp(b) {
    b.w = Math.min(1, Math.max(0.1, b.w)); b.h = Math.min(1, Math.max(0.1, b.h));
    b.x = Math.min(1 - b.w, Math.max(0, b.x)); b.y = Math.min(1 - b.h, Math.max(0, b.y));
    return b;
  }
  place() {
    const s = this.el.style; const b = this.box;
    s.left = (b.x * 100) + '%'; s.top = (b.y * 100) + '%'; s.width = (b.w * 100) + '%'; s.height = (b.h * 100) + '%';
  }
  layout() {
    const c = this.cfg();
    if (!this.drag && c.display.videoBox) this.box = this.clamp({ ...c.display.videoBox });
    this.v.style.objectFit = c.video.fit || 'contain';
    this.el.style.background = c.video.fit === 'cover' ? '#000' : (c.video.boxBg || '#000');
    this.mode = c.video.whenNone || 'hide';
    this.place(); this.refresh();
  }
  play(m) {
    this.cur = m; this.v.loop = !!m.loop; this.v.volume = Math.max(0, Math.min(1, m.volume ?? 1)); this.v.muted = false;
    this.v.src = m.url;
    this.v.play().catch(err => { this.v.muted = true; this.v.play().catch(() => { this.api.send('video:error', { url: m.url, err: String(err) }); this.cur = null; this.refresh(); }); });
    this.refresh();
  }
  refresh() {
    const edit = !!this.cfg().video.editFrame;
    const show = !!this.cur || edit || this.mode === 'black' || this.mode === 'last';
    this.el.classList.toggle('on', show);
    this.el.classList.toggle('edit', edit);
    this.el.classList.toggle('empty', !this.cur);
  }
}
