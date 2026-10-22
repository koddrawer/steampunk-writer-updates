// Kết nối TikTok LIVE (tiktok-live-connector) + chuẩn hoá sự kiện, tự kết nối lại.
class TikTok {
  constructor(req, getCfg, on) {
    this.req = req; this.cfg = getCfg; this.on = on;
    this.conn = null; this.manual = false; this.retry = 0; this.timer = null;
    this.status = { state: 'disconnected', message: 'Chưa kết nối', username: '', viewers: 0 };
  }
  set(s) { this.status = { ...this.status, ...s }; this.on.status(this.status); }
  user(d) {
    const u = d.user || d;
    return { uniqueId: u.uniqueId || u.displayId || '', nickname: u.nickname || u.nickName || '', avatar: (u.profilePicture && (u.profilePicture.url || u.profilePicture.urls || [])[0]) || u.profilePictureUrl || '' };
  }
  async connect(username) {
    username = String(username || this.cfg().tiktok.username || '').trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?tiktok\.com\/@/, '').replace(/\/live.*$/, '');
    if (!username) { this.set({ state: 'error', message: 'Chưa nhập username TikTok' }); return false; }
    await this.disconnect(true);
    this.manual = false; this.username = username;
    let lib;
    try { lib = this.req('tiktok-live-connector'); } catch (e) { this.set({ state: 'error', message: 'Thiếu thư viện tiktok-live-connector: ' + e.message }); return false; }
    const { TikTokLiveConnection, WebcastEvent, ControlEvent } = lib;
    const key = this.cfg().tiktok.signApiKey;
    const conn = new TikTokLiveConnection(username, { ...(key ? { signApiKey: key } : {}), enableExtendedGiftInfo: true, processInitialData: false });
    this.conn = conn;
    this.set({ state: 'connecting', message: `Đang kết nối @${username}…`, username });
    const E = WebcastEvent || {}; const C = ControlEvent || {};
    conn.on(E.MEMBER || 'member', d => { const u = this.user(d); this.on.log('join', `${u.nickname || u.uniqueId} vào phòng`); this.on.join(u); });
    conn.on(E.CHAT || 'chat', d => { const u = this.user(d); this.on.log('chat', `${u.nickname || u.uniqueId}: ${d.comment}`); this.on.chat(u, d.comment); });
    conn.on(E.FOLLOW || 'follow', d => { const u = this.user(d); this.on.log('follow', `${u.nickname || u.uniqueId} theo dõi`); this.on.follow(u); });
    conn.on(E.SHARE || 'share', d => { const u = this.user(d); this.on.share(u); });
    conn.on(E.LIKE || 'like', d => { const u = this.user(d); this.on.like(u, d.likeCount || d.count || 1); });
    conn.on(E.ROOM_USER || 'roomUser', d => { if (d.viewerCount != null) this.set({ viewers: d.viewerCount }); });
    conn.on(E.GIFT || 'gift', d => {
      const det = d.giftDetails || {}; const ext = d.extendedGiftInfo || {};
      const giftType = det.giftType ?? d.giftType;
      if (giftType === 1 && !d.repeatEnd) return;          // đang combo, chờ kết thúc
      const g = { user: this.user(d), gift: det.giftName || ext.name || d.giftName || ('Gift#' + (d.giftId || '')),
        count: d.repeatCount || 1, diamonds: det.diamondCount ?? ext.diamond_count ?? d.diamondCount ?? 0 };
      this.on.log('gift', `${g.user.nickname || g.user.uniqueId} tặng ${g.gift} x${g.count} (${g.diamonds * g.count} xu)`);
      this.on.gift(g);
    });
    conn.on(E.STREAM_END || 'streamEnd', () => { this.on.log('sys', 'Phiên live đã kết thúc'); this.set({ state: 'disconnected', message: 'Live đã kết thúc' }); this.schedule(30000); });
    conn.on(C.DISCONNECTED || 'disconnected', (info) => {
      if (this.conn !== conn) return;
      this.set({ state: 'disconnected', message: 'Mất kết nối' + (info && info.reason ? ': ' + info.reason : '') });
      if (!this.manual) this.schedule();
    });
    conn.on(C.ERROR || 'error', (e) => { this.on.log('err', 'TikTok: ' + (e && (e.message || e.info || JSON.stringify(e)).slice(0, 200))); });
    try {
      const st = await conn.connect();
      this.retry = 0;
      this.set({ state: 'connected', message: `Đã kết nối @${username}` + (st && st.roomId ? ` (room ${st.roomId})` : ''), roomId: st && st.roomId });
      this.on.log('sys', `Đã kết nối TikTok LIVE @${username}`);
      return true;
    } catch (e) {
      const msg = (e && e.message) || String(e);
      this.set({ state: 'error', message: /offline|not.*live|UserOffline/i.test(msg) ? `@${username} đang không live` : 'Lỗi: ' + msg.slice(0, 160) });
      this.on.log('err', 'Kết nối thất bại: ' + msg.slice(0, 200));
      if (!this.manual) this.schedule();
      return false;
    }
  }
  schedule(ms) {
    if (!this.cfg().tiktok.autoReconnect || this.manual) return;
    clearTimeout(this.timer);
    const wait = ms || Math.min(60000, 5000 * Math.pow(1.6, this.retry++));
    this.set({ message: this.status.message + ` – thử lại sau ${Math.round(wait / 1000)}s` });
    this.timer = setTimeout(() => this.connect(this.username), wait);
  }
  async disconnect(internal) {
    if (!internal) { this.manual = true; clearTimeout(this.timer); }
    const c = this.conn; this.conn = null;
    if (c) { try { await c.disconnect(); } catch { } }
    if (!internal) this.set({ state: 'disconnected', message: 'Đã ngắt kết nối' });
  }
}
module.exports = { TikTok };
