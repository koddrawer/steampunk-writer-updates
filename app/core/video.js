// Lịch phát video popup: idle khi vắng, chào khi có người vào, cảm ơn khi có quà – có giới hạn tần suất.
const fs = require('fs');
const path = require('path');
const CAT_VI = { idle: 'Idle', greet: 'Chào', thanks: 'Cảm ơn' };
const PRIORITY = { idle: 0, greet: 1, thanks: 2 };

class VideoScheduler {
  constructor(getCfg, popup, mediaUrl, onStatus, log) {
    Object.assign(this, { cfg: getCfg, popup, mediaUrl, onStatus, log });
    this.cur = null; this.paused = false; this.displayOk = false;
    this.lastPlay = { idle: 0, greet: 0, thanks: 0 };
    this.lastIdleEnd = 0; this.lastActivity = Date.now();
    this.pending = { greet: 0, thanks: 0 }; this.pendingSince = { greet: 0, thanks: 0 };
    this.seq = { idle: -1, greet: -1, thanks: -1 }; this.lastFile = {};
    this.counts = { idle: 0, greet: 0, thanks: 0 };
    this.timer = setInterval(() => this.tick(), 400);
  }
  kick() { this.tick(); }
  // màn hiển thị (nơi chứa khung video) vừa tải xong / bị đóng
  displayReady() { this.displayOk = true; this.cur = null; this.tick(); }
  displayGone() { this.displayOk = false; this.cur = null; this.emit(); }
  setPaused(v) { this.paused = !!v; if (this.paused) this.stopNow(); this.emit(); }

  onActivity() { this.lastActivity = Date.now(); }
  onJoin() {
    this.lastActivity = Date.now();
    if (!this.pending.greet) this.pendingSince.greet = Date.now();
    this.pending.greet++;
    const g = this.cfg().video.greet;
    if (this.cur && this.cur.cat === 'idle' && g.interruptIdle && this.ready('greet') && this.pending.greet >= (g.minJoins || 1)) this.tryPlay('greet', true);
    else this.tick();
  }
  onGift(g) {
    this.lastActivity = Date.now();
    const v = this.cfg().video.thanks;
    const total = (g.diamonds || 0) * (g.count || 1);
    if (total < (v.minDiamonds ?? 1)) return;
    if (!this.pending.thanks) this.pendingSince.thanks = Date.now();
    this.pending.thanks++;
    if (this.cur && this.cur.cat !== 'thanks' && v.interrupt && this.ready('thanks')) this.tryPlay('thanks', true);
    else this.tick();
  }

  files(cat) {
    const c = this.cfg().video.categories[cat];
    if (!c || c.enabled === false) return [];
    return (c.files || []).filter(f => { try { return fs.existsSync(f); } catch { return false; } });
  }
  ready(cat) {
    const v = this.cfg().video;
    if (this.paused || !this.files(cat).length) return false;
    const cd = cat === 'idle' ? 0 : (v[cat].cooldownSec ?? 0) * 1000;
    return Date.now() - this.lastPlay[cat] >= cd;
  }
  pick(cat) {
    const list = this.files(cat); if (!list.length) return null;
    const c = this.cfg().video.categories[cat];
    if (c.random !== false) {
      let i = Math.floor(Math.random() * list.length);
      if (list.length > 1 && list[i] === this.lastFile[cat]) i = (i + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length;
      return list[i];
    }
    this.seq[cat] = (this.seq[cat] + 1) % list.length; return list[this.seq[cat]];
  }
  tryPlay(cat, interrupt) {
    const v = this.cfg().video;
    if (!this.displayOk) return false;
    if (cat !== 'idle') {
      const chance = v[cat].chance ?? 100;
      this.pending[cat] = 0;
      if (Math.random() * 100 >= chance) { this.log('video', `Bỏ qua video ${CAT_VI[cat]} (tỉ lệ ${chance}%)`); this.lastPlay[cat] = Date.now(); return false; }
    }
    const file = this.pick(cat); if (!file) return false;
    if (this.cur && !interrupt) return false;
    if (this.cur) this.log('video', `Ngắt ${CAT_VI[this.cur.cat]} để phát ${CAT_VI[cat]}`);
    this.play(cat, file);
    return true;
  }
  play(cat, file) {
    const v = this.cfg().video;
    this.cur = { cat, file, t: Date.now() }; this.lastPlay[cat] = Date.now(); this.lastFile[cat] = file; this.counts[cat]++;
    this.popup.play(this.mediaUrl(file), { file, volume: v.volume ?? 1, fit: v.fit || 'contain', cat, loop: false });
    this.log('video', `▶ ${CAT_VI[cat]}: ${path.basename(file)}`);
    this.emit();
  }
  ended() {
    if (!this.cur) return;
    if (this.cur.cat === 'idle') this.lastIdleEnd = Date.now();
    else this.resumeIdle = true;                  // vừa chào/cảm ơn xong -> nối idle ngay, không chờ
    this.cur = null; this.emit();
    this.tick();
    if (!this.cur) this.popup.idle();
  }
  playNow(cat, file) {
    if (!this.displayOk) return false;
    file = file || this.pick(cat); if (!file) return false;
    if (cat !== 'idle') this.pending[cat] = 0;
    this.play(cat, file); return true;
  }
  stopNow() { if (!this.cur) return; this.popup.stop(); this.cur = null; this.popup.idle(); this.emit(); }

  tick() {
    const now = Date.now(); const v = this.cfg().video;
    if (this.cur && now - this.cur.t > 15 * 60000) { this.cur = null; }           // chống treo
    // quà/chào chờ quá lâu thì bỏ (tránh phát muộn khi đã hết người)
    for (const c of ['greet', 'thanks']) if (this.pending[c] && now - this.pendingSince[c] > Math.max(120000, (v[c].cooldownSec || 0) * 2000)) this.pending[c] = 0;
    if (!this.displayOk || this.paused || this.cur) return this.emit(true);
    if (this.pending.thanks && this.ready('thanks')) { if (this.tryPlay('thanks')) return; }
    if (this.pending.greet >= (v.greet.minJoins || 1) && this.ready('greet')) { if (this.tryPlay('greet')) return; }
    // phát liên tục: hễ không có video chào/cảm ơn là quay lại idle ngay (không chờ)
    const resume = this.resumeIdle; this.resumeIdle = false;
    const quiet = v.idle.loop || resume ? true : now - this.lastActivity >= (v.idle.afterSec ?? 25) * 1000;
    const gap = v.idle.loop || resume ? 0 : (v.idle.gapSec ?? 45) * 1000;
    if (quiet && now - this.lastIdleEnd >= gap && this.ready('idle')) this.tryPlay('idle');
    this.emit(true);
  }
  status() {
    const v = this.cfg().video; const now = Date.now();
    const left = (cat) => Math.max(0, Math.ceil(((v[cat]?.cooldownSec || 0) * 1000 - (now - this.lastPlay[cat])) / 1000));
    return { cur: this.cur && { cat: this.cur.cat, file: path.basename(this.cur.file) }, paused: this.paused, pending: this.pending,
      cooldown: { greet: left('greet'), thanks: left('thanks') }, quietSec: Math.floor((now - this.lastActivity) / 1000),
      idleIn: v.idle.loop ? 0 : Math.max(0, Math.ceil(Math.max((v.idle.afterSec ?? 25) * 1000 - (now - this.lastActivity), (v.idle.loop ? 0 : (v.idle.gapSec ?? 45) * 1000) - (now - this.lastIdleEnd)) / 1000)),
      counts: this.counts };
  }
  emit(throttle) {
    const now = Date.now(); if (throttle && now - (this._e || 0) < 900) return; this._e = now;
    this.onStatus(this.status());
  }
}
module.exports = { VideoScheduler };
