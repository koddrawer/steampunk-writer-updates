// Bản Android: lõi ứng dụng (hàng đợi, lịch video, TikTok, cấu hình, file) chạy ngay trong WebView,
// thay cho main process của Electron. Cung cấp window.api y hệt bản máy tính cho màn hiển thị và bảng điều khiển.
import { DEFAULTS, JobQueue, VideoScheduler, TikTok } from './core.bundle.js';
import { unzipSync } from './fflate.bundle.js';

const Cap = window.Capacitor;
const P = (n) => Cap.Plugins[n] || Cap.registerPlugin(n);
const Prefs = P('Preferences'), FS = P('Filesystem'), Http = P('CapacitorHttp'), AppP = P('App'), WebViewP = P('WebView');
const DATA = 'DATA';

// ---------------- tiện ích
function deepMerge(a, b) {
  if (Array.isArray(b) || typeof b !== 'object' || b === null) return b;
  const out = Array.isArray(a) || typeof a !== 'object' || a === null ? {} : { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = (v && typeof v === 'object' && !Array.isArray(v)) ? deepMerge(out[k], v) : v;
  return out;
}
const uid = (p) => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fname = (p) => String(p || '').split(/[\\/]/).pop();
const verCmp = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; };
function b64(u8) { let s = ''; const C = 0x8000; for (let i = 0; i < u8.length; i += C) s += String.fromCharCode.apply(null, u8.subarray(i, i + C)); return btoa(s); }
function unb64(s) { const b = atob(s); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }

// cấu hình mặc định riêng cho điện thoại (lần chạy đầu): nhẹ GPU hơn
const MOBILE_DEFAULTS = {
  display: { renderScale: 0.85, bloom: 0, followSpeed: 12, mobileFps: 60, adaptive: true, quality: 'balanced' },
  writer: { paper: { pxPerM: 1100 } },
};

// ---------------- cấu hình
let saved = {};
try { const r = await Prefs.get({ key: 'config' }); if (r && r.value) saved = JSON.parse(r.value); } catch { }
const firstRun = !saved.configVersion;
let cfg = deepMerge(deepMerge(DEFAULTS, firstRun ? MOBILE_DEFAULTS : {}), saved);
cfg.fonts = [...DEFAULTS.fonts, ...(cfg.fonts || []).filter(f => !f.builtin)];
for (const b of DEFAULTS.backgrounds) if (!cfg.backgrounds.some(x => x.id === b.id)) cfg.backgrounds.push(b);
cfg.display.model = 'classic';
let saveT = null;
const save = () => { clearTimeout(saveT); saveT = setTimeout(() => Prefs.set({ key: 'config', value: JSON.stringify(cfg) }).catch(() => { }), 400); };
if (firstRun) save();
const getCfg = () => cfg;

// ---------------- kênh sự kiện giữa lõi <-> màn hiển thị <-> bảng điều khiển
const subs = { display: new Map(), panel: new Map() };
function emit(role, ch, d) { const s = subs[role].get(ch); if (s) for (const f of [...s]) { try { f(d); } catch (e) { console.error(e); } } }
const toDisplay = (ch, d) => emit('display', ch, d);
const toPanel = (ch, d) => emit('panel', ch, d);
const broadcast = (ch, d) => { toDisplay(ch, d); toPanel(ch, d); };
function setCfg(patch, { silent } = {}) { cfg = deepMerge(cfg, patch); save(); if (!silent) broadcast('config', cfg); video.kick(); return cfg; }

// ---------------- nhật ký
const log = [];
function addLog(kind, text) { const e = { t: Date.now(), kind, text }; log.push(e); if (log.length > 300) log.shift(); toPanel('log', e); }
window.addEventListener('unhandledrejection', e => addLog('err', 'Lỗi: ' + (e.reason && e.reason.message || e.reason)));

// ---------------- file của người dùng: chép vào bộ nhớ riêng của app
const mediaUrl = (p) => !p ? '' : /^(https?|data|blob):/.test(p) ? p : Cap.convertFileSrc(p);
async function storeFile(file, sub) {
  const safe = file.name.replace(/[^\w.\-]+/g, '_');
  const rel = `media/${sub}/${Date.now().toString(36)}_${safe}`;
  const CH = 3 * 1024 * 1024;                                   // ghi từng khúc 3 MB (video lớn không làm tràn bộ nhớ)
  for (let off = 0; off < file.size || off === 0; off += CH) {
    const buf = new Uint8Array(await file.slice(off, off + CH).arrayBuffer());
    const data = b64(buf);
    if (off === 0) await FS.writeFile({ path: rel, directory: DATA, data, recursive: true });
    else await FS.appendFile({ path: rel, directory: DATA, data });
    if (file.size === 0) break;
  }
  const { uri } = await FS.getUri({ path: rel, directory: DATA });
  return uri;
}
async function removeFile(uri) { try { if (uri && uri.startsWith('file://')) await FS.deleteFile({ path: uri }); } catch { } }
const ACCEPT = { video: 'video/*', audio: 'audio/*', font: '.ttf,.otf,.woff,font/*', image: 'image/*', json: 'application/json,.json' };
let pickerDoc = null;     // tài liệu của khung bảng điều khiển (nơi người dùng vừa bấm)
function pickFiles(kind, multi) {
  return new Promise((resolve) => {
    const doc = pickerDoc || document;
    const inp = doc.createElement('input'); inp.type = 'file'; inp.accept = ACCEPT[kind] || ''; inp.multiple = !!multi; inp.style.display = 'none';
    doc.body.appendChild(inp);
    let done = false; const fin = (v) => { if (done) return; done = true; inp.remove(); resolve(v); };
    inp.onchange = () => fin([...inp.files]);
    inp.oncancel = () => fin([]);
    inp.click();
    setTimeout(() => { if (!done && !inp.files.length) { /* vẫn chờ */ } }, 60000);
  });
}
async function pickAndStore(kind, multi, sub) {
  const files = await pickFiles(kind, multi); const out = [];
  if (files.length) toPanel('toast', `Đang chép ${files.length} file vào app…`);
  for (const f of files) { try { out.push({ uri: await storeFile(f, sub), name: f.name }); } catch (e) { addLog('err', 'Không chép được file ' + f.name + ': ' + e.message); } }
  return out;
}

// ---------------- lõi
const popupApi = {
  play(url, opts) { toDisplay('video:play', { url, ...opts }); },
  stop() { toDisplay('video:stop', {}); },
  idle() { toDisplay('video:blank', { mode: cfg.video.whenNone }); },
};
const video = new VideoScheduler(getCfg, popupApi, mediaUrl, (s) => toPanel('video:status', s), addLog);
const queue = new JobQueue(getCfg, () => { toDisplay('job:available', {}); toPanel('queue', queue.snapshot()); }, () => toDisplay('display:cmd', { cmd: 'abortJob' }));
const likes = new Map();
const tiktokHandlers = {
  status: (s) => toPanel('tiktok:status', s),
  log: addLog,
  join: (u) => { video.onJoin(u); queue.activity(); if (cfg.writer.names.sources.join) queue.addName(u, 'join'); },
  chat: (u, text) => {
    video.onActivity(); queue.activity();
    if (queue.giftComment(u, text)) return;
    if (cfg.writer.names.comments && cfg.writer.names.comments.enabled) queue.addComment(u, text);
    else if (cfg.writer.names.sources.chat) queue.addName(u, 'chat', false, { comment: text });
  },
  follow: (u) => { if (cfg.writer.names.sources.follow) queue.addName(u, 'follow'); },
  share: (u) => { if (cfg.writer.names.sources.share) queue.addName(u, 'share'); },
  like: (u, n) => {
    if (!cfg.writer.names.sources.like) return;
    const k = (u.uniqueId || u.nickname || '').toLowerCase(); if (!k) return;
    const need = Math.max(1, cfg.writer.names.likeThreshold || 10);
    const before = likes.get(k) || 0, after = before + (n || 1); likes.set(k, after);
    if (Math.floor(after / need) > Math.floor(before / need)) queue.addName(u, 'like', false, { likes: after });
  },
  gift: (g) => { video.onGift(g); queue.activity(); queue.addDonor(g); },
};
let tiktokLib = null;
const tiktok = new TikTok(() => tiktokLib, getCfg, tiktokHandlers);
const origConnect = tiktok.connect.bind(tiktok);
tiktok.connect = async (u) => { if (!tiktokLib) tiktokLib = await import('./tiktok.bundle.js'); return origConnect(u); };

// ---------------- sự kiện từ màn hiển thị
let displayStatus = {};
const onSend = {
  'display:status': (s) => { displayStatus = { ...displayStatus, ...s }; toPanel('display:status', displayStatus); },
  'display:fps': (f) => { displayStatus.fps = f; toPanel('display:status', displayStatus); },
  'display:jobDone': (j) => queue.done(j),
  'display:ready': () => { queue.requeueCurrent(); video.displayReady(); addLog('sys', 'Màn hiển thị đã sẵn sàng'); updater.verified(); },
  'display:camera': ({ name, cam }) => { const cams = { ...(cfg.display.cameras || {}) }; if (cam) cams[name] = cam; else delete cams[name]; setCfg({ display: { cameras: cams } }); addLog('sys', cam ? `Đã lưu góc camera "${name}"` : `Đã đặt lại camera "${name}"`); },
  'video:ended': (i) => video.ended(i),
  'video:error': (i) => { addLog('err', 'Lỗi phát video: ' + (i && i.url ? decodeURIComponent(fname(i.url)) : '')); video.ended(i); },
  'music:status': (s) => toPanel('music:status', s),
  'video:fit': ({ file, data }) => { const fd = { ...(cfg.video.fitData || {}) }; fd[file] = data; setCfg({ video: { fitData: fd } }, { silent: true }); },
  'popup:hide': () => { },
};

// ---------------- cập nhật nóng từ GitHub (giao diện + lõi web), giống bản máy tính
let appVersion = '0.0.0', apkBuild = 0;
try { appVersion = (await (await fetch('../version.json', { cache: 'no-store' })).json()).version; } catch { }
try { const info = await AppP.getInfo(); apkBuild = +info.build || 0; } catch { }
const updater = {
  status: { state: 'idle', message: 'Chưa kiểm tra' },
  set(s) { this.status = { ...this.status, ...s }; toPanel('update:status', this.status); },
  async raw(path, binary) {
    const u = cfg.update; const url = `https://raw.githubusercontent.com/${u.owner}/${u.repo}/${u.branch || 'main'}/${path}?t=${Date.now()}`;
    const r = await Http.request({ url, method: 'GET', responseType: binary ? 'arraybuffer' : 'text', headers: { 'Cache-Control': 'no-cache' } });
    if (r.status >= 400) throw new Error('HTTP ' + r.status);
    return r.data;
  },
  async check(manual) {
    if (this.busy) return this.status;
    try {
      this.set({ state: 'checking', message: 'Đang kiểm tra bản mới…' });
      let v = await this.raw('version.json'); if (typeof v === 'string') v = JSON.parse(v);
      this.remote = v;
      if (verCmp(v.version, appVersion) <= 0) { this.set({ state: 'latest', message: `Đang dùng bản mới nhất (v${appVersion})` }); return this.status; }
      if ((v.minApk || 0) > apkBuild) { this.set({ state: 'needApk', message: `Có bản v${v.version} nhưng cần cài APK mới (bản APK hiện tại: ${apkBuild}). Tải APK ở mục Releases trên GitHub.` }); return this.status; }
      this.set({ state: 'downloading', message: `Đang tải v${v.version}…` });
      await this.download(v);
      this.set({ state: 'ready', message: `Đã tải v${v.version}. Bấm "Khởi động lại để cập nhật".` });
    } catch (e) { this.set({ state: 'error', message: 'Lỗi cập nhật: ' + (e.message || e) }); }
    return this.status;
  },
  async download(v) {
    this.busy = true;
    try {
      const u = cfg.update;
      const r = await Http.request({ url: `https://codeload.github.com/${u.owner}/${u.repo}/zip/refs/heads/${u.branch || 'main'}`, method: 'GET', responseType: 'arraybuffer' });
      if (r.status >= 400) throw new Error('HTTP ' + r.status);
      const zip = typeof r.data === 'string' ? unb64(r.data) : new Uint8Array(r.data);
      const files = unzipSync(zip, { filter: (f) => /^[^/]+\/app\/(renderer|assets)\/|^[^/]+\/app\/version\.json$/.test(f.name) && !f.name.endsWith('/') });
      const dir = `updates/${v.version}`;
      try { await FS.rmdir({ path: dir, directory: DATA, recursive: true }); } catch { }
      let n = 0; const names = Object.keys(files);
      for (const name of names) {
        const rel = name.replace(/^[^/]+\/app\//, '');
        await FS.writeFile({ path: `${dir}/${rel}`, directory: DATA, data: b64(files[name]), recursive: true });
        if (++n % 20 === 0) this.set({ message: `Đang ghi bản mới… ${Math.round(n / names.length * 100)}%` });
      }
      await FS.writeFile({ path: `${dir}/index.html`, directory: DATA, data: btoa('<!doctype html><meta charset="utf-8"><script>location.replace("renderer/display.html")</script>'), recursive: true });
      const { uri } = await FS.getUri({ path: dir, directory: DATA });
      this.pending = { version: v.version, path: uri.replace(/^file:\/\//, '') };
    } finally { this.busy = false; }
  },
  async apply() {
    if (!this.pending) return false;
    await Prefs.set({ key: 'update:verify', value: JSON.stringify({ version: this.pending.version, from: appVersion }) });
    await WebViewP.setServerBasePath({ path: this.pending.path });
    await WebViewP.persistServerBasePath();
    return true;
  },
  async verified() { try { await Prefs.remove({ key: 'update:verify' }); } catch { } },
};
// bản cập nhật trước không khởi động được -> quay về bản cài trong APK
try {
  const pv = await Prefs.get({ key: 'update:verify' });
  if (pv && pv.value) {
    const info = JSON.parse(pv.value);
    if (info.version === appVersion && info.tries >= 1) {
      await Prefs.remove({ key: 'update:verify' });
      await WebViewP.setServerAssetPath({ path: 'public' }); await WebViewP.persistServerBasePath();
    } else await Prefs.set({ key: 'update:verify', value: JSON.stringify({ ...info, tries: (info.tries || 0) + 1 }) });
  }
} catch { }

// ---------------- RPC (giống bản máy tính, bỏ phần cửa sổ)
const RPC = {
  'app:info': () => ({ appVersion, shellVersion: 'Android ' + apkBuild, appSource: location.href.includes('_capacitor_file_') || !location.href.includes('localhost/renderer') ? 'update' : 'bundled', userData: 'Bộ nhớ app' }),
  'job:next': () => queue.next(),
  'queue:get': () => queue.snapshot(),
  'queue:remove': (id) => queue.remove(id),
  'queue:clear': (which) => queue.clear(which),
  'queue:pause': (v) => queue.setPaused(v),
  'test:join': (name) => { const u = { uniqueId: 'test_' + Math.random().toString(36).slice(2, 7), nickname: name || 'Khách ' + Math.floor(Math.random() * 999) }; addLog('join', `[TEST] ${u.nickname} vào phòng`); video.onJoin(u); queue.activity(); queue.addName(u, 'join', true); },
  'test:chat': (name, text) => { const u = { uniqueId: 'test_' + (name || 'chat').replace(/\s/g, ''), nickname: name || 'Người bình luận' }; addLog('chat', `[TEST] ${u.nickname}: ${text}`); video.onActivity(); queue.activity(); if (queue.giftComment(u, text)) return; if (cfg.writer.names.comments && cfg.writer.names.comments.enabled) queue.addComment(u, text || '', true); else queue.addName(u, 'chat', true, { comment: text || '' }); },
  'test:like': (name, n) => { const u = { uniqueId: 'test_' + (name || 'like').replace(/\s/g, ''), nickname: name || 'Người thả tim' }; addLog('like', `[TEST] ${u.nickname} thả ${n || 10} tim`); queue.activity(); tiktokHandlers.like(u, n || 10); },
  'test:quote': () => queue.forceQuote(),
  'test:gift': (o = {}) => { const g = { user: { uniqueId: 'test_' + (o.name || 'donor').replace(/\s/g, ''), nickname: o.name || 'Người tặng quà' }, gift: o.gift || 'Rose', count: o.count || 1, diamonds: o.diamonds ?? 1 };
    addLog('gift', `[TEST] ${g.user.nickname} tặng ${g.gift} x${g.count} (${g.diamonds * g.count} xu)`); video.onGift(g); queue.activity(); queue.addDonor(g, 'test'); },
  'tiktok:connect': (u) => tiktok.connect(u),
  'tiktok:disconnect': () => tiktok.disconnect(),
  'tiktok:status': () => tiktok.status,
  'log:get': () => log,
  'video:status': () => video.status(),
  'video:playNow': (cat, file) => video.playNow(cat, file),
  'video:stop': () => video.stopNow(),
  'video:pause': (v) => video.setPaused(v),
  'win:show': (name) => { if (name === 'popup') setCfg({ video: { editFrame: !cfg.video.editFrame } }); if (name === 'display') ui.closePanel(); },
  'win:displaySize': () => { },
  'win:recreateDisplay': () => location.reload(),
  'win:popupReset': () => setCfg({ display: { videoBox: { ...DEFAULTS.display.videoBox } } }),
  'display:cmd': (m) => toDisplay('display:cmd', m),
  'files:pick': async (kind, multi) => (await pickAndStore(kind, multi, kind)).map(x => x.uri),
  'fonts:add': async () => {
    const files = await pickAndStore('font', true, 'fonts');
    const added = files.map(f => ({ id: uid('font'), name: f.name.replace(/\.[^.]+$/, ''), file: f.uri }));
    if (added.length) setCfg({ fonts: [...cfg.fonts, ...added] }); return added;
  },
  'fonts:remove': async (id) => { const f = cfg.fonts.find(x => x.id === id); if (!f || f.builtin) return; await removeFile(f.file); setCfg({ fonts: cfg.fonts.filter(x => x.id !== id) }); },
  'bg:addImage': async () => {
    const files = await pickAndStore('image', true, 'logos');
    const added = files.map(f => ({ id: uid('logo'), name: f.name.replace(/\.[^.]+$/, ''), type: 'image', file: f.uri, enabled: true, keepColors: false, nameYOffset: 0, nameWidth: 70 }));
    if (added.length) setCfg({ backgrounds: [...cfg.backgrounds, ...added] }); return added;
  },
  'bg:remove': async (id) => { const b = cfg.backgrounds.find(x => x.id === id); if (!b) return; if (b.type === 'image') await removeFile(b.file); setCfg({ backgrounds: cfg.backgrounds.filter(x => x.id !== id) }); },
  'video:add': async (cat) => {
    const files = (await pickAndStore('video', true, 'videos')).map(x => x.uri); if (!files.length) return [];
    const c = cfg.video.categories[cat]; setCfg({ video: { categories: { [cat]: { files: [...c.files, ...files] } } } }); return files;
  },
  'video:remove': async (cat, file) => { const c = cfg.video.categories[cat]; await removeFile(file); setCfg({ video: { categories: { [cat]: { files: c.files.filter(f => f !== file) } } } }); },
  'video:exists': (files) => files.map(() => true),
  'video:refit': () => toDisplay('video:refit', {}),
  'music:add': async () => {
    const files = (await pickAndStore('audio', true, 'music')).map(x => x.uri); if (!files.length) return [];
    setCfg({ music: { files: [...(cfg.music.files || []), ...files] } }); return files;
  },
  'music:remove': async (file) => { await removeFile(file); setCfg({ music: { files: (cfg.music.files || []).filter(f => f !== file) } }); },
  'music:cmd': (cmd, arg) => toDisplay('music:cmd', { cmd, arg }),
  'paper:clear': () => toDisplay('display:cmd', { cmd: 'clearPaper' }),
  'update:check': () => updater.check(true),
  'update:apply': () => updater.apply(),
  'update:status': () => updater.status,
  'open:userData': () => { },
  'config:reset': (section) => { const patch = {}; patch[section] = DEFAULTS[section]; cfg[section] = undefined; return setCfg(patch); },
  'config:export': async () => {
    const name = `steampunk-writer-config-${new Date().toISOString().slice(0, 10)}.json`;
    await FS.writeFile({ path: name, directory: 'DOCUMENTS', data: JSON.stringify(cfg, null, 1), encoding: 'utf8' });
    toPanel('toast', 'Đã lưu vào thư mục Documents: ' + name); return true;
  },
  'config:import': async () => {
    const [f] = await pickFiles('json', false); if (!f) return false;
    const c = JSON.parse(await f.text()); cfg = deepMerge(DEFAULTS, c); save(); broadcast('config', cfg); return true;
  },
};
async function invoke(name, ...args) { const f = RPC[name]; if (!f) throw new Error('RPC không tồn tại: ' + name); return f(...args); }

function makeApi(role, win) {
  return {
    role, mobile: true,
    getConfig: async () => cfg,
    setConfig: async (patch) => setCfg(patch),
    invoke: async (name, ...args) => { if (role === 'panel' && win) pickerDoc = win.document; return invoke(name, ...args); },
    send: (ch, data) => { const f = onSend[ch]; if (f) f(data); },
    on: (ch, cb) => { const m = subs[role]; if (!m.has(ch)) m.set(ch, new Set()); m.get(ch).add(cb); return () => m.get(ch).delete(cb); },
    mediaUrl,
  };
}
window.api = makeApi('display', window);
window.__panelApi = (win) => makeApi('panel', win);

// ---------------- giao diện trên điện thoại: bảng điều khiển là lớp phủ, mở bằng nút bánh răng
const ui = (() => {
  const css = document.createElement('style');
  css.textContent = `
  #mGear{position:fixed;right:10px;top:10px;z-index:50;width:44px;height:44px;border-radius:50%;border:1px solid #8a6a3a;background:rgba(20,15,10,.55);color:#e8c98a;font:22px/42px system-ui;text-align:center;opacity:.0;transition:opacity .3s;-webkit-tap-highlight-color:transparent}
  #mGear.show{opacity:.9}
  #mPanel{position:fixed;inset:0;z-index:60;background:#15110d;display:none;flex-direction:column}
  #mPanel.on{display:flex}
  #mPanel .bar{display:flex;align-items:center;gap:8px;padding:6px 10px;background:#1d1711;border-bottom:1px solid #3a2c1c;color:#e8c98a;font:600 14px system-ui}
  #mPanel .bar button{margin-left:auto;background:#2a2016;color:#e8c98a;border:1px solid #6b5332;border-radius:8px;padding:8px 14px;font:600 14px system-ui}
  #mPanel iframe{flex:1;border:0;width:100%;background:#15110d}`;
  document.head.appendChild(css);
  const gear = document.createElement('div'); gear.id = 'mGear'; gear.textContent = '⚙';
  const pan = document.createElement('div'); pan.id = 'mPanel';
  pan.innerHTML = '<div class="bar">Bảng điều khiển <button id="mClose">Về màn máy ✕</button></div>';
  let frame = null, hideT = 0;
  const showGear = () => { gear.classList.add('show'); clearTimeout(hideT); hideT = setTimeout(() => gear.classList.remove('show'), 3500); };
  const open = () => {
    if (!frame) { frame = document.createElement('iframe'); frame.src = './panel.html'; pan.appendChild(frame); }
    pan.classList.add('on'); gear.classList.remove('show'); window.__panelOpen = true;
  };
  const closePanel = () => { pan.classList.remove('on'); window.__panelOpen = false; showGear(); };
  gear.addEventListener('click', (e) => { e.stopPropagation(); if (gear.classList.contains('show')) open(); else showGear(); });
  const attach = () => { document.body.append(gear, pan); pan.querySelector('#mClose').onclick = closePanel; showGear(); };
  if (document.body) attach(); else addEventListener('DOMContentLoaded', attach);
  // chạm vào màn hình thì hiện nút bánh răng vài giây (để lúc live màn hình sạch)
  addEventListener('pointerdown', (e) => { if (!pan.contains(e.target)) showGear(); }, true);
  try { AppP.addListener('backButton', () => { if (pan.classList.contains('on')) closePanel(); else AppP.minimizeApp(); }); } catch { }
  return { open, closePanel };
})();

addLog('sys', `Khởi động v${appVersion} trên Android`);
if (cfg.tiktok.autoConnect && cfg.tiktok.username) setTimeout(() => tiktok.connect(cfg.tiktok.username), 1500);
if (cfg.update.autoCheck) setTimeout(() => updater.check(false), 8000);
setInterval(() => cfg.update.autoCheck && updater.check(false), Math.max(10, cfg.update.intervalMin || 30) * 60000);

export const ready = Promise.resolve(true);
