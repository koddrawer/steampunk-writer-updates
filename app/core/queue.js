// Hàng đợi viết: người tặng quà ưu tiên trước, sau đó tới tên người vào phòng.
class JobQueue {
  constructor(getCfg, onChange) {
    this.cfg = getCfg; this.onChange = onChange;
    this.donors = []; this.names = []; this.seen = new Map(); this.current = null; this.paused = false; this.nextId = 1;
    this.stats = { written: 0, donors: 0, dropped: 0 };
  }
  label(u, mode) {
    const nick = (u.nickname || '').trim(), id = (u.uniqueId || '').trim();
    return mode === 'uniqueId' ? (id || nick) : (nick || id);
  }
  addName(u, source, force) {
    const c = this.cfg().writer.names;
    if (!c.enabled && !force) return;
    const key = (u.uniqueId || u.nickname || '').toLowerCase();
    if (!key) return;
    const now = Date.now();
    const last = this.seen.get(key);
    if (!force && last && now - last < (c.dedupeMin ?? 30) * 60000) return;
    if (this.names.some(j => j.key === key)) return;
    this.seen.set(key, now);
    if (this.seen.size > 5000) { const old = [...this.seen.entries()].sort((a, b) => a[1] - b[1]).slice(0, 1000); old.forEach(([k]) => this.seen.delete(k)); }
    this.names.push({ id: this.nextId++, type: 'name', key, name: this.label(u, c.display), alt: u.uniqueId, source, t: now });
    const max = c.maxQueue || 40;
    while (this.names.length > max) { this.names.shift(); this.stats.dropped++; }   // bỏ người cũ nhất, giữ người mới vào
    this.onChange();
  }
  addDonor(g, force) {
    const c = this.cfg().writer.donors;
    const total = (g.diamonds || 0) * (g.count || 1);
    if (!force && (!c.enabled || total < (c.minDiamonds ?? 1))) return;
    const key = (g.user.uniqueId || g.user.nickname || '').toLowerCase();
    const now = Date.now();
    // gộp quà liên tiếp của cùng một người (chưa bắt đầu viết)
    const ex = this.donors.find(j => j.key === key && now - j.t < (c.mergeSec ?? 6) * 1000);
    if (ex) {
      if (ex.gift === g.gift) ex.count += g.count || 1; else { ex.gift = g.gift; ex.count = g.count || 1; }
      ex.diamonds = Math.max(ex.diamonds, g.diamonds || 0); ex.total += total; ex.t = now; this.onChange(); return;
    }
    this.donors.push({ id: this.nextId++, type: 'donor', key, name: this.label(g.user, c.display), alt: g.user.uniqueId,
      gift: g.gift, count: g.count || 1, diamonds: g.diamonds || 0, total, t: now });
    const max = c.maxQueue || 30;
    while (this.donors.length > max) { this.donors.shift(); this.stats.dropped++; }
    // người tặng quà không cần viết lại tên nhỏ nữa
    this.names = this.names.filter(j => j.key !== key);
    this.onChange();
  }
  next() {
    if (this.current && Date.now() - this.current.startedAt > 180000) this.current = null;   // an toàn: màn hiển thị bị tải lại giữa chừng
    if (this.paused || this.current) return null;
    const c = this.cfg().writer;
    let j = null;
    // chờ hết thời gian gộp quà trước khi viết người tặng
    const ready = this.donors.findIndex(d => Date.now() - d.t >= Math.min(2500, (c.donors.mergeSec ?? 6) * 1000 * 0.4));
    if (ready >= 0) j = this.donors.splice(ready, 1)[0];
    else if (!(c.names.skipWhenDonors && this.donors.length)) j = this.names.shift() || null;
    if (j) { j.startedAt = Date.now(); this.current = j; this.onChange(); }
    return j;
  }
  done(j) {
    if (this.current && j && this.current.id === j.id) {
      if (!j.skipped) { this.stats.written++; if (this.current.type === 'donor') this.stats.donors++; }
      this.current = null; this.onChange();
    } else if (!j) { this.current = null; this.onChange(); }
  }
  requeueCurrent() { const j = this.current; if (!j) return; this.current = null; (j.type === 'donor' ? this.donors : this.names).unshift(j); this.onChange(); }
  remove(id) { this.donors = this.donors.filter(j => j.id !== id); this.names = this.names.filter(j => j.id !== id); this.onChange(); }
  clear(which) { if (!which || which === 'names') this.names = []; if (!which || which === 'donors') this.donors = []; this.onChange(); }
  setPaused(v) { this.paused = !!v; this.onChange(); }
  snapshot() { return { donors: this.donors, names: this.names, current: this.current, paused: this.paused, stats: this.stats }; }
}
module.exports = { JobQueue };
