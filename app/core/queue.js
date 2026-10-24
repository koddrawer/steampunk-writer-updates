// Hàng đợi viết: người tặng quà ưu tiên trước, sau đó tới tên người vào phòng.
class JobQueue {
  constructor(getCfg, onChange, onAbort) {
    this.cfg = getCfg; this.onChange = onChange; this.onAbort = onAbort || (() => { });
    this.lastActivity = Date.now(); this.lastQuoteEnd = 0; this.quoteIdx = -1; this.recentQuotes = [];
    this.donors = []; this.names = []; this.seen = new Map(); this.current = null; this.paused = false; this.nextId = 1;
    this.stats = { written: 0, donors: 0, dropped: 0 };
  }
  label(u, mode) {
    const nick = (u.nickname || '').trim(), id = (u.uniqueId || '').trim();
    return mode === 'uniqueId' ? (id || nick) : (nick || id);
  }
  activity() { this.lastActivity = Date.now(); }
  // ngắt câu quote đang viết dở khi có người thật cần viết
  interruptQuote() {
    const q = this.cfg().writer.quotes || {};
    if (this.current && this.current.type === 'quote' && q.interrupt !== false) this.onAbort();
  }
  fillTemplate(source, name, extra = {}) {
    const t = ((this.cfg().writer.names.templates || {})[source] || '{name}').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    const tpl = t.length ? t[Math.floor(Math.random() * t.length)] : '{name}';
    return tpl.replace(/\{name\}/g, name).replace(/\{comment\}/g, (extra.comment || '').slice(0, 80))
      .replace(/\{likes\}/g, extra.likes || '').replace(/\{id\}/g, extra.id || '').replace(/\s+/g, ' ').trim();
  }
  addName(u, source, force, extra = {}) {
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
    const name = [...this.label(u, c.display)].slice(0, c.maxChars || 18).join('');
    const text = this.fillTemplate(source, name, { ...extra, id: u.uniqueId });
    this.names.push({ id: this.nextId++, type: 'name', key, name, text, alt: u.uniqueId, source, t: now });
    this.interruptQuote();
    const max = c.maxQueue || 40;
    while (this.names.length > max) { this.names.shift(); this.stats.dropped++; }   // bỏ người cũ nhất, giữ người mới vào
    this.onChange();
  }
  // viết nội dung bình luận (mỗi bình luận là một dòng mới, có lọc từ cấm và giãn cách theo người)
  addComment(u, comment, force) {
    const n = this.cfg().writer.names; const c = n.comments || {};
    if (!force && (!c.enabled || !n.enabled)) return false;
    let text = String(comment || '').replace(/\s+/g, ' ').trim();
    if ([...text].length < (c.minChars ?? 2)) return false;
    const low = text.toLowerCase();
    if ((c.blockWords || []).some(w => w && low.includes(String(w).toLowerCase()))) return false;
    const key = (u.uniqueId || u.nickname || '').toLowerCase(); if (!key) return false;
    const now = Date.now(); this.cmtSeen = this.cmtSeen || new Map();
    if (!force && now - (this.cmtSeen.get(key) || 0) < (c.cooldownSec ?? 20) * 1000) return false;
    if (this.names.filter(j => j.key === key && j.source === 'comment').length >= 2) return false;
    this.cmtSeen.set(key, now);
    const max = c.maxChars || 80; if ([...text].length > max) text = [...text].slice(0, max).join('').trim() + '…';
    const name = [...this.label(u, n.display)].slice(0, n.maxChars || 18).join('');
    const out = c.format === 'comment' ? text : c.format === 'comment_name' ? `“${text}” — ${name}` : `${name}: ${text}`;
    this.names.push({ id: this.nextId++, type: 'name', key, name, text: out, alt: u.uniqueId, source: 'comment', t: now });
    this.interruptQuote();
    while (this.names.length > (n.maxQueue || 40)) { this.names.shift(); this.stats.dropped++; }
    this.onChange();
    return true;
  }
  // ---- tặng quà nhỏ + bình luận: giữ người tặng chờ bình luận trong waitSec giây
  addDonor(g, force) {
    const gc = this.cfg().writer.giftComment || {};
    const key0 = (g.user.uniqueId || g.user.nickname || '').toLowerCase();
    const total0 = (g.diamonds || 0) * (g.count || 1);
    this.waiting = this.waiting || new Map();
    const w = this.waiting.get(key0);
    if (w) {                                                       // tặng thêm trong lúc chờ
      w.total += total0; w.g = { ...g, count: (w.g.count || 1) + (g.count || 1) };
      if (w.total > (gc.maxDiamonds ?? 1)) { this.releaseWaiting(key0); }   // vượt ngưỡng -> thành donate thường
      return;
    }
    if (!force && gc.enabled && key0 && total0 >= (gc.minDiamonds ?? 1) && total0 <= (gc.maxDiamonds ?? 1)) {
      const t = setTimeout(() => this.releaseWaiting(key0), Math.max(3, gc.waitSec ?? 30) * 1000);
      this.waiting.set(key0, { g, total: total0, t, since: Date.now() });
      this.onChange(); return;
    }
    return this.pushDonor(g, force);
  }
  releaseWaiting(key) {
    const w = this.waiting && this.waiting.get(key); if (!w) return;
    clearTimeout(w.t); this.waiting.delete(key);
    this.pushDonor({ ...w.g, totalOverride: w.total }, false);
  }
  giftComment(u, comment) {
    const key = (u.uniqueId || u.nickname || '').toLowerCase();
    const w = this.waiting && this.waiting.get(key); if (!w) return false;
    let text = String(comment || '').replace(/\s+/g, ' ').trim(); if (!text) return false;
    clearTimeout(w.t); this.waiting.delete(key);
    const gc = this.cfg().writer.giftComment || {}; const n = this.cfg().writer.names;
    const max = gc.maxChars || 80; if ([...text].length > max) text = [...text].slice(0, max).join('').trim() + '…';
    const name = [...this.label(u, n.display)].slice(0, n.maxChars || 18).join('');
    const out = (gc.format || '{name}: {comment}').replace(/\{name\}/g, name).replace(/\{comment\}/g, text).replace(/\{gift\}/g, w.g.gift || '').trim();
    this.names = this.names.filter(j => j.key !== key);
    this.names.unshift({ id: this.nextId++, type: 'name', key, name, text: out, alt: u.uniqueId, source: 'giftComment', t: Date.now() });
    this.interruptQuote(); this.onChange();
    return true;
  }
  pushDonor(g, force) {
    const c = this.cfg().writer.donors;
    const total = g.totalOverride ?? (g.diamonds || 0) * (g.count || 1);
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
    this.interruptQuote();
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
    if (!j && !this.donors.length) j = this.makeQuote(false);
    if (j) { j.startedAt = Date.now(); this.current = j; this.onChange(); }
    return j;
  }
  // khi vắng (không ai vào/bình luận/tặng quà): viết câu trích dẫn
  makeQuote(force) {
    const q = this.cfg().writer.quotes || {}; const now = Date.now();
    if (!force && (!q.enabled || now - this.lastActivity < (q.afterSec ?? 20) * 1000 || now - this.lastQuoteEnd < (q.gapSec ?? 8) * 1000)) return null;
    const lang = q.language || 'both';
    const list = [...(lang !== 'en' ? q.list || [] : []), ...(lang !== 'vi' ? q.listEn || [] : [])].map(x => String(x).trim()).filter(Boolean);
    if (!list.length) return null;
    let i;
    if (q.random !== false) {
      const pool = list.map((_, k) => k).filter(k => !this.recentQuotes.includes(k));
      i = (pool.length ? pool : list.map((_, k) => k))[Math.floor(Math.random() * (pool.length || list.length))];
    } else { this.quoteIdx = (this.quoteIdx + 1) % list.length; i = this.quoteIdx; }
    this.recentQuotes.push(i); while (this.recentQuotes.length > Math.min(8, Math.floor(list.length / 2))) this.recentQuotes.shift();
    const [text, author] = list[i].split(/\s+[—–-]{1,2}\s+(?=[^—–-]*$)/);
    return { id: this.nextId++, type: 'quote', name: '“' + text.slice(0, 24) + '…”', text: text.trim(), author: (author || '').trim(), t: now };
  }
  forceQuote() { if (this.current) return false; this.lastActivity = 0; this.lastQuoteEnd = 0; this.onChange(); return true; }
  done(j) {
    if (this.current && this.current.type === 'quote') this.lastQuoteEnd = Date.now();
    if (this.current && j && this.current.id === j.id) {
      if (!j.skipped) { this.stats.written++; if (this.current.type === 'donor') this.stats.donors++; }
      this.current = null; this.onChange();
    } else if (!j) { this.current = null; this.onChange(); }
  }
  requeueCurrent() { const j = this.current; if (!j) return; this.current = null; (j.type === 'donor' ? this.donors : this.names).unshift(j); this.onChange(); }
  remove(id) { this.donors = this.donors.filter(j => j.id !== id); this.names = this.names.filter(j => j.id !== id); this.onChange(); }
  clear(which) { if (!which || which === 'names') this.names = []; if (!which || which === 'donors') this.donors = []; this.onChange(); }
  setPaused(v) { this.paused = !!v; this.onChange(); }
  snapshot() { return { waiting: [...(this.waiting || new Map()).entries()].map(([k, w]) => ({ key: k, name: this.label(w.g.user, 'nickname'), left: Math.max(0, Math.ceil(((this.cfg().writer.giftComment?.waitSec ?? 30) * 1000 - (Date.now() - w.since)) / 1000)) })), donors: this.donors, names: this.names, current: this.current, paused: this.paused, stats: this.stats }; }
}
module.exports = { JobQueue };
