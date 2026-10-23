// Lõi ứng dụng (chạy trong main process, cập nhật nóng được qua GitHub).
const { app, BrowserWindow, ipcMain, dialog, protocol, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');
const { pathToFileURL } = require('url');
const DEFAULTS = require('./defaults.js');
const { VideoScheduler } = require('./video.js');
const { JobQueue } = require('./queue.js');
const { TikTok } = require('./tiktok.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska', '.m4v': 'video/mp4' };

function deepMerge(a, b) {
  if (Array.isArray(b) || typeof b !== 'object' || b === null) return b;
  const out = Array.isArray(a) || typeof a !== 'object' || a === null ? {} : { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = (v && typeof v === 'object' && !Array.isArray(v)) ? deepMerge(out[k], v) : v;
  return out;
}

module.exports = async function start(ctx) {
  const userData = app.getPath('userData');
  const cfgFile = path.join(userData, 'config.json');
  const dirs = { fonts: path.join(userData, 'fonts'), logos: path.join(userData, 'logos') };
  Object.values(dirs).forEach(d => fs.mkdirSync(d, { recursive: true }));

  // ---------------- cấu hình
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(cfgFile, 'utf8')); } catch { }
  let cfg = deepMerge(DEFAULTS, saved);
  // luôn có đủ font/mẫu nền tích hợp (kể cả khi bản cập nhật thêm mẫu mới)
  cfg.fonts = [...DEFAULTS.fonts, ...cfg.fonts.filter(f => !f.builtin)];
  for (const b of DEFAULTS.backgrounds) if (!cfg.backgrounds.some(x => x.id === b.id)) cfg.backgrounds.push(b);
  // nâng cấu hình cũ lên v2 (bản 1.1.0)
  if ((saved.configVersion || 1) < 2) {
    cfg.display.frameless = false;                       // cửa sổ hiển thị có khung để kéo/đổi cỡ
    cfg.video.idle.loop = true;                          // vắng người: phát idle liên tục
    if (!saved.display || saved.display.bgColor === '#efe9df') cfg.display.bgColor = DEFAULTS.display.bgColor;
    cfg.configVersion = 2;
  }
  // v3 (bản 1.2.0): thời gian viết tối đa 10 giây, logo theo bậc donate
  if ((saved.configVersion || 1) < 3) {
    const w = cfg.writer;
    w.names.maxSec = Math.min(10, w.names.maxSec || 6);
    w.quotes.maxSec = Math.min(10, w.quotes.maxSec || 10);
    w.donors.maxSec = Math.min(10, w.donors.maxSec || 10);
    if (!saved.writer || !saved.writer.donors || !saved.writer.donors.bgMode || saved.writer.donors.bgMode === 'random') w.donors.bgMode = 'tiers';
    cfg.configVersion = 3;
  }
  let saveT = null;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => fs.writeFile(cfgFile, JSON.stringify(cfg, null, 1), () => { }), 300); };
  const getCfg = () => cfg;
  function setCfg(patch, { silent } = {}) {
    cfg = deepMerge(cfg, patch); save();
    if (!silent) broadcast('config', cfg);
    applyWindowCfg(); video.kick();
    return cfg;
  }

  // ---------------- giao thức app:// (giao diện) và media:// (file của người dùng, hỗ trợ tua video)
  protocol.handle('app', async (req) => {
    const u = new URL(req.url);
    const p = path.normalize(path.join(ctx.appDir, decodeURIComponent(u.pathname)));
    if (!p.startsWith(path.normalize(ctx.appDir))) return new Response('forbidden', { status: 403 });
    try {
      const data = await fs.promises.readFile(p);
      return new Response(data, { headers: { 'content-type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream' } });
    } catch { return new Response('not found', { status: 404 }); }
  });
  protocol.handle('media', async (req) => {
    const u = new URL(req.url);
    const p = decodeURIComponent(u.pathname.replace(/^\//, ''));
    let st; try { st = await fs.promises.stat(p); } catch { return new Response('not found', { status: 404 }); }
    const type = MIME[path.extname(p).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.get('range');
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range); let s = m[1] ? +m[1] : 0; let e = m[2] ? +m[2] : st.size - 1;
      e = Math.min(e, st.size - 1);
      return new Response(Readable.toWeb(fs.createReadStream(p, { start: s, end: e })), { status: 206,
        headers: { 'content-type': type, 'accept-ranges': 'bytes', 'content-range': `bytes ${s}-${e}/${st.size}`, 'content-length': String(e - s + 1) } });
    }
    return new Response(Readable.toWeb(fs.createReadStream(p)), { headers: { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': String(st.size) } });
  });
  const mediaUrl = (p) => 'media://local/' + encodeURIComponent(p);

  // ---------------- cửa sổ
  const preload = path.join(__dirname, 'preload.js');
  const W = {};
  const wcfg = (n) => (cfg.windows && cfg.windows[n]) || {};
  function remember(name, win) {
    const keep = () => { if (win.isDestroyed()) return; const b = win.getBounds(); setCfg({ windows: { [name]: b } }, { silent: true }); };
    let t; const deb = () => { clearTimeout(t); t = setTimeout(keep, 400); };
    win.on('move', deb); win.on('resize', deb);
  }
  function onScreen(b) {
    if (!b || b.x === undefined) return false;
    return screen.getAllDisplays().some(d => { const a = d.workArea; return b.x + 40 > a.x && b.y + 40 > a.y && b.x < a.x + a.width - 40 && b.y < a.y + a.height - 40; });
  }
  function createDisplay() {
    const d = cfg.display; const b = wcfg('display');
    const win = new BrowserWindow({
      width: d.width, height: d.height, useContentSize: true, frame: !d.frameless, resizable: true, title: 'Steampunk Writer - Display',
      backgroundColor: '#0d0b09', alwaysOnTop: !!d.alwaysOnTop, show: false, autoHideMenuBar: true,
      ...(onScreen(b) ? { x: b.x, y: b.y } : {}),
      webPreferences: { preload, contextIsolation: true, backgroundThrottling: false, additionalArguments: ['--sw-role=display'] },
    });
    win.setAspectRatio(9 / 16);
    win.setMenu(null);
    win.loadURL('app://local/renderer/display.html');
    win.once('ready-to-show', () => win.show());
    remember('display', win);
    win.on('closed', () => { W.display = null; video.displayGone(); });
    W.display = win;
  }
  function createPanel() {
    const b = wcfg('panel');
    const win = new BrowserWindow({
      width: 1180, height: 820, minWidth: 900, minHeight: 600, title: 'Steampunk Writer - Bảng điều khiển', backgroundColor: '#15110d', show: false,
      ...(onScreen(b) ? { x: b.x, y: b.y, width: b.width, height: b.height } : {}), autoHideMenuBar: true,
      webPreferences: { preload, contextIsolation: true, additionalArguments: ['--sw-role=panel'] },
    });
    win.setMenu(null);
    win.loadURL('app://local/renderer/panel.html');
    win.once('ready-to-show', () => win.show());
    remember('panel', win);
    win.on('close', (e) => {
      if (app.__quitting) return;
      const r = dialog.showMessageBoxSync(win, { type: 'question', buttons: ['Thoát app', 'Huỷ'], defaultId: 1, cancelId: 1, title: 'Thoát', message: 'Đóng bảng điều khiển sẽ tắt toàn bộ ứng dụng. Thoát?' });
      if (r !== 0) e.preventDefault();
    });
    win.on('closed', () => { W.panel = null; app.quit(); });
    W.panel = win;
  }
  function createPopup() {
    const b = wcfg('popup'); const v = cfg.video;
    const win = new BrowserWindow({
      width: (onScreen(b) && b.width) || 360, height: (onScreen(b) && b.height) || 640, minWidth: 120, minHeight: 90,
      ...(onScreen(b) ? { x: b.x, y: b.y } : {}),
      frame: false, resizable: true, alwaysOnTop: !!v.alwaysOnTop, backgroundColor: '#000000', show: v.whenNone !== 'hide', skipTaskbar: false,
      title: 'Steampunk Writer - Video', autoHideMenuBar: true,
      webPreferences: { preload, contextIsolation: true, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required', additionalArguments: ['--sw-role=popup'] },
    });
    win.setMenu(null);
    win.loadURL('app://local/renderer/popup.html');
    remember('popup', win);
    win.on('close', (e) => { if (!app.__quitting) { e.preventDefault(); win.hide(); popupHiddenByUser = true; } });
    W.popup = win;
  }
  let popupHiddenByUser = false;
  function applyWindowCfg() {
    if (W.display && !W.display.isDestroyed()) W.display.setAlwaysOnTop(!!cfg.display.alwaysOnTop);
  }
  function broadcast(ch, data) { for (const w of Object.values(W)) if (w && !w.isDestroyed()) w.webContents.send(ch, data); }
  const toPanel = (ch, d) => W.panel && !W.panel.isDestroyed() && W.panel.webContents.send(ch, d);
  app.on('before-quit', () => { app.__quitting = true; });

  // ---------------- nhật ký sự kiện
  const log = [];
  function addLog(kind, text) {
    const e = { t: Date.now(), kind, text }; log.push(e); if (log.length > 300) log.shift(); toPanel('log', e);
  }
  // lỗi bất ngờ không được làm treo app giữa buổi live: ghi vào nhật ký thay vì hiện hộp thoại
  if (!process.__swGuard) {
    process.__swGuard = true;
    process.on('uncaughtException', (e) => { console.error(e); try { addLog('err', 'Lỗi: ' + (e && e.message || e)); } catch { } });
    process.on('unhandledRejection', (e) => { console.error(e); try { addLog('err', 'Lỗi: ' + (e && e.message || e)); } catch { } });
  }

  // ---------------- video: phát trong khung nằm trong màn hiển thị
  const toDisplay = (ch, d) => W.display && !W.display.isDestroyed() && W.display.webContents.send(ch, d);
  const popupApi = {
    play(url, opts) { toDisplay('video:play', { url, ...opts }); },
    stop() { toDisplay('video:stop', {}); },
    idle() { toDisplay('video:blank', { mode: cfg.video.whenNone }); },
  };
  const video = new VideoScheduler(getCfg, popupApi, mediaUrl, (s) => toPanel('video:status', s), addLog);

  // ---------------- hàng đợi viết
  const queue = new JobQueue(getCfg, () => { W.display && W.display.webContents.send('job:available', {}); toPanel('queue', queue.snapshot()); },
    () => { W.display && W.display.webContents.send('display:cmd', { cmd: 'abortJob' }); });

  const likes = new Map();
  // ---------------- TikTok
  const tiktokHandlers = {
    status: (s) => toPanel('tiktok:status', s),
    log: addLog,
    join: (u) => { video.onJoin(u); queue.activity(); if (cfg.writer.names.sources.join) queue.addName(u, 'join'); },
    chat: (u, text) => { video.onActivity(); queue.activity(); if (cfg.writer.names.sources.chat) queue.addName(u, 'chat', false, { comment: text }); },
    follow: (u) => { if (cfg.writer.names.sources.follow) queue.addName(u, 'follow'); },
    share: (u) => { if (cfg.writer.names.sources.share) queue.addName(u, 'share'); },
    like: (u, n) => {
      // cộng dồn tim theo từng người, đủ ngưỡng thì viết tên
      if (!cfg.writer.names.sources.like) return;
      const k = (u.uniqueId || u.nickname || '').toLowerCase(); if (!k) return;
      const need = Math.max(1, cfg.writer.names.likeThreshold || 10);
      const before = likes.get(k) || 0, after = before + (n || 1); likes.set(k, after);
      if (Math.floor(after / need) > Math.floor(before / need)) queue.addName(u, 'like', false, { likes: after });
    },
    gift: (g) => { video.onGift(g); queue.activity(); queue.addDonor(g); },
  };
  const tiktok = new TikTok(ctx.require, getCfg, tiktokHandlers);

  // ---------------- IPC
  ipcMain.handle('config:get', () => cfg);
  ipcMain.handle('config:set', (_e, patch) => setCfg(patch));
  let displayStatus = {};
  ipcMain.on('display:status', (_e, s) => { displayStatus = { ...displayStatus, ...s }; toPanel('display:status', displayStatus); });
  ipcMain.on('display:fps', (_e, f) => { displayStatus.fps = f; toPanel('display:status', displayStatus); });
  ipcMain.on('display:jobDone', (_e, j) => { queue.done(j); });
  ipcMain.on('display:ready', () => { queue.requeueCurrent(); video.displayReady(); addLog('sys', 'Màn hiển thị đã sẵn sàng'); });
  ipcMain.on('display:camera', (_e, { name, cam }) => {
    const cams = { ...(cfg.display.cameras || {}) }; if (cam) cams[name] = cam; else delete cams[name];
    setCfg({ display: { cameras: cams } }); addLog('sys', cam ? `Đã lưu góc camera "${name}"` : `Đã đặt lại camera "${name}"`);
  });
  ipcMain.on('video:ended', (_e, info) => video.ended(info));
  ipcMain.on('video:error', (_e, info) => { addLog('err', 'Lỗi phát video: ' + (info && info.url ? decodeURIComponent(info.url.split('/').pop()) : '')); video.ended(info); });

  const copyInto = (src, dir) => {
    const base = path.basename(src).replace(/[^\w.\-]+/g, '_'); let dst = path.join(dir, base); let i = 1;
    while (fs.existsSync(dst)) dst = path.join(dir, `${path.parse(base).name}_${i++}${path.extname(base)}`);
    fs.copyFileSync(src, dst); return dst;
  };
  const uid = (p) => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  const RPC = {
    'app:info': () => ({ appVersion: ctx.appVersion, shellVersion: ctx.shellVersion, appSource: ctx.appSource, userData }),
    'job:next': () => queue.next(),
    'queue:get': () => queue.snapshot(),
    'queue:remove': (id) => queue.remove(id),
    'queue:clear': (which) => queue.clear(which),
    'queue:pause': (v) => queue.setPaused(v),
    'test:join': (name) => { const u = { uniqueId: 'test_' + Math.random().toString(36).slice(2, 7), nickname: name || 'Khách ' + Math.floor(Math.random() * 999) }; addLog('join', `[TEST] ${u.nickname} vào phòng`); video.onJoin(u); queue.activity(); queue.addName(u, 'join', true); },
    'test:chat': (name, text) => { const u = { uniqueId: 'test_' + (name || 'chat').replace(/\s/g, ''), nickname: name || 'Người bình luận' }; addLog('chat', `[TEST] ${u.nickname}: ${text}`); video.onActivity(); queue.activity(); queue.addName(u, 'chat', true, { comment: text || '' }); },
    'test:like': (name, n) => { const u = { uniqueId: 'test_' + (name || 'like').replace(/\s/g, ''), nickname: name || 'Người thả tim' }; addLog('like', `[TEST] ${u.nickname} thả ${n || 10} tim`); queue.activity(); tiktokHandlers.like(u, n || 10); },
    'test:quote': () => queue.forceQuote(),
    'test:gift': (o = {}) => { const g = { user: { uniqueId: 'test_' + (o.name || 'donor').replace(/\s/g, ''), nickname: o.name || 'Người tặng quà' }, gift: o.gift || 'Rose', count: o.count || 1, diamonds: o.diamonds ?? 1 };
      addLog('gift', `[TEST] ${g.user.nickname} tặng ${g.gift} x${g.count} (${g.diamonds * g.count} xu)`); video.onGift(g); queue.activity(); queue.addDonor(g, true); },
    'tiktok:connect': (u) => tiktok.connect(u),
    'tiktok:disconnect': () => tiktok.disconnect(),
    'tiktok:status': () => tiktok.status,
    'log:get': () => log,
    'video:status': () => video.status(),
    'video:playNow': (cat, file) => video.playNow(cat, file),
    'video:stop': () => video.stopNow(),
    'video:pause': (v) => video.setPaused(v),
    'win:show': (name) => {
      if (name === 'display') { if (!W.display) createDisplay(); else { W.display.show(); W.display.focus(); } }
      if (name === 'popup') setCfg({ video: { editFrame: !cfg.video.editFrame } });
    },
    'win:displaySize': (w, h) => { if (!W.display) return; W.display.setAspectRatio(0); W.display.setContentSize(w, h); W.display.setAspectRatio(9 / 16); setCfg({ display: { width: w, height: h } }, { silent: true }); },
    'win:recreateDisplay': () => { if (W.display) { W.display.destroy(); W.display = null; } createDisplay(); },
    'win:popupReset': () => setCfg({ display: { videoBox: { ...DEFAULTS.display.videoBox } } }),
    'display:cmd': (m) => W.display && W.display.webContents.send('display:cmd', m),
    'files:pick': async (kind, multi) => {
      const filters = { video: [{ name: 'Video', extensions: ['mp4', 'webm', 'mov', 'm4v', 'mkv'] }], font: [{ name: 'Font', extensions: ['ttf', 'otf', 'woff'] }],
        image: [{ name: 'Ảnh', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'] }] }[kind];
      const r = await dialog.showOpenDialog(W.panel, { properties: ['openFile', ...(multi ? ['multiSelections'] : [])], filters });
      return r.canceled ? [] : r.filePaths;
    },
    'fonts:add': async () => {
      const files = await RPC['files:pick']('font', true); const added = [];
      for (const f of files) { const dst = copyInto(f, dirs.fonts); added.push({ id: uid('font'), name: path.parse(f).name, file: dst }); }
      if (added.length) setCfg({ fonts: [...cfg.fonts, ...added] });
      return added;
    },
    'fonts:remove': (id) => { const f = cfg.fonts.find(x => x.id === id); if (!f || f.builtin) return; try { fs.unlinkSync(f.file); } catch { } setCfg({ fonts: cfg.fonts.filter(x => x.id !== id) }); },
    'bg:addImage': async () => {
      const files = await RPC['files:pick']('image', true); const added = [];
      for (const f of files) { const dst = copyInto(f, dirs.logos); added.push({ id: uid('logo'), name: path.parse(f).name, type: 'image', file: dst, enabled: true, keepColors: false, nameYOffset: 0, nameWidth: 70 }); }
      if (added.length) setCfg({ backgrounds: [...cfg.backgrounds, ...added] });
      return added;
    },
    'bg:remove': (id) => { const b = cfg.backgrounds.find(x => x.id === id); if (!b) return; if (b.type === 'image') { try { fs.unlinkSync(b.file); } catch { } }
      setCfg({ backgrounds: cfg.backgrounds.filter(x => x.id !== id) }); },
    'video:add': async (cat) => {
      const files = await RPC['files:pick']('video', true); if (!files.length) return [];
      const c = cfg.video.categories[cat]; const list = [...c.files, ...files.filter(f => !c.files.includes(f))];
      setCfg({ video: { categories: { [cat]: { files: list } } } }); return files;
    },
    'video:remove': (cat, file) => { const c = cfg.video.categories[cat]; setCfg({ video: { categories: { [cat]: { files: c.files.filter(f => f !== file) } } } }); },
    'video:exists': (files) => files.map(f => fs.existsSync(f)),
    'paper:clear': () => W.display && W.display.webContents.send('display:cmd', { cmd: 'clearPaper' }),
    'update:check': () => ctx.updater.check(true),
    'update:apply': () => ctx.updater.apply(),
    'update:status': () => ctx.updater.status,
    'open:userData': () => shell.openPath(userData),
    'config:reset': (section) => { const patch = {}; patch[section] = DEFAULTS[section]; cfg[section] = undefined; return setCfg(patch); },
    'config:export': async () => { const r = await dialog.showSaveDialog(W.panel, { defaultPath: 'steampunk-writer-config.json' }); if (!r.canceled) fs.writeFileSync(r.filePath, JSON.stringify(cfg, null, 1)); return !r.canceled; },
    'config:import': async () => { const r = await dialog.showOpenDialog(W.panel, { filters: [{ name: 'JSON', extensions: ['json'] }] }); if (r.canceled) return false;
      const c = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8')); cfg = deepMerge(DEFAULTS, c); save(); broadcast('config', cfg); return true; },
  };
  ipcMain.handle('rpc', async (_e, name, ...args) => {
    const f = RPC[name]; if (!f) throw new Error('RPC không tồn tại: ' + name);
    return f(...args);
  });

  ctx.updater.onStatus((s) => toPanel('update:status', s));
  if (cfg.update) ctx.updater.configure(cfg.update);

  createPanel();
  createDisplay();
  addLog('sys', `Khởi động v${ctx.appVersion} (${ctx.appSource === 'update' ? 'bản cập nhật' : 'bản cài'})`);
  if (cfg.tiktok.autoConnect && cfg.tiktok.username) setTimeout(() => tiktok.connect(cfg.tiktok.username), 1500);
  if (cfg.update.autoCheck) setTimeout(() => ctx.updater.check(false), 6000);
  setInterval(() => cfg.update.autoCheck && ctx.updater.check(false), Math.max(10, cfg.update.intervalMin || 30) * 60000);
};
