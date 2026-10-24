// Bảng điều khiển
import { templateThumb, imageThumb } from './thumbs.js';
const api = window.api;
let cfg = await api.getConfig();
const $ = (s, r = document) => r.querySelector(s);
const h = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') e.className = v; else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
};
const get = (p, o = cfg) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const mk = (p, v) => p.split('.').reverse().reduce((acc, k) => ({ [k]: acc }), v);
const setPath = (p, v) => api.setConfig(mk(p, v));
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2600); }
const fname = (p) => (p || '').split(/[\\/]/).pop();

// ---------- trường nhập liệu gắn với đường dẫn cấu hình
const binds = [];
function field(path, label, type = 'number', o = {}) {
  let input;
  const cur = get(path);
  if (type === 'bool') {
    const cb = h('input', { type: 'checkbox' }); cb.checked = !!cur;
    cb.onchange = () => setPath(path, cb.checked);
    input = h('label', { class: 'switch' }, cb, h('span'));
    binds.push(() => { cb.checked = !!get(path); });
  } else if (type === 'select') {
    const sel = h('select', {}, ...(typeof o.options === 'function' ? o.options() : o.options).map(([v, t]) => h('option', { value: v }, t)));
    sel.value = cur ?? ''; sel.onchange = () => setPath(path, o.num ? +sel.value : sel.value);
    input = sel;
    binds.push(() => {
      if (typeof o.options === 'function') { const v = sel.value; sel.replaceChildren(...o.options().map(([a, t]) => h('option', { value: a }, t))); sel.value = get(path) ?? v; }
      else if (document.activeElement !== sel) sel.value = get(path) ?? '';
    });
  } else if (type === 'range') {
    const r = h('input', { type: 'range', min: o.min ?? 0, max: o.max ?? 100, step: o.step ?? 1 }); r.value = cur ?? 0;
    const out = h('span', { class: 'unit', style: 'min-width:48px;text-align:right' }, `${cur ?? 0}${o.unit || ''}`);
    r.oninput = () => { out.textContent = r.value + (o.unit || ''); };
    r.onchange = () => setPath(path, +r.value);
    input = h('div', { class: 'ctl' }, r, out);
    binds.push(() => { if (document.activeElement !== r) { r.value = get(path) ?? 0; out.textContent = (get(path) ?? 0) + (o.unit || ''); } });
  } else if (type === 'textarea' || type === 'lines') {
    const ta = h('textarea', { rows: o.rows || 3, placeholder: o.ph || '', style: 'resize:vertical;font-size:13px' });
    const val = () => { const v = get(path); return type === 'lines' ? (v || []).join('\n') : (v ?? ''); };
    ta.value = val();
    ta.onchange = () => setPath(path, type === 'lines' ? ta.value.split(/\r?\n/).map(x => x.trim()).filter(Boolean) : ta.value);
    binds.push(() => { if (document.activeElement !== ta) ta.value = val(); });
    if (o.full) return h('div', { style: 'padding:5px 0' }, h('label', { class: 'hint', style: 'display:block;margin-bottom:4px' }, label), ta);
    input = ta;
  } else if (type === 'color') {
    const c = h('input', { type: 'color' }); c.value = cur || '#000000'; c.onchange = () => setPath(path, c.value);
    input = c; binds.push(() => { c.value = get(path) || '#000000'; });
  } else {
    const inp = h('input', { type: type === 'number' ? 'number' : 'text', min: o.min, max: o.max, step: o.step ?? 'any', placeholder: o.ph || '' });
    inp.value = cur ?? '';
    inp.onchange = () => setPath(path, type === 'number' ? (inp.value === '' ? 0 : +inp.value) : inp.value);
    input = h('div', { class: 'ctl' }, inp, o.unit ? h('span', { class: 'unit' }, o.unit) : null);
    binds.push(() => { if (document.activeElement !== inp) inp.value = get(path) ?? ''; });
  }
  return h('div', { class: 'row', title: o.tip || '' }, h('label', {}, label), input);
}
const card = (title, ...kids) => h('div', { class: 'card' }, h('h3', {}, ...(Array.isArray(title) ? title : [title])), ...kids);
const note = (t) => h('p', { class: 'note' }, t);
const btn = (t, f, cls = '') => h('button', { class: 'b ' + cls, onclick: f }, t);
const fontOptions = () => cfg.fonts.map(f => [f.id, f.name]);

// ---------- font preview (@font-face)
function refreshFontFaces() {
  const css = cfg.fonts.map(f => {
    const srcs = f.builtin ? f.files.map(x => `url("../assets/fonts/${x}")`) : [`url("${api.mediaUrl(f.file)}")`];
    return srcs.map(s => `@font-face{font-family:"sw-${f.id}";src:${s};font-display:swap;}`).join('\n');
  }).join('\n');
  $('#fontfaces').textContent = css;
}
const ff = (id) => `"sw-${id}", serif`;

// ================= TAB: Tổng quan
const live = {};
function renderHome() {
  const user = h('input', { type: 'text', placeholder: 'username TikTok (không cần @)' }); user.value = cfg.tiktok.username || '';
  user.onchange = () => setPath('tiktok.username', user.value.trim().replace(/^@/, ''));
  live.tikMsg = h('div', { class: 'hint' }, '—');
  live.kpi = h('div', { class: 'kpis' });
  live.log = h('div', { class: 'log' });
  live.writing = h('div', { class: 'hint' }, '—');
  const paused = h('input', { type: 'checkbox' }); paused.onchange = () => api.invoke('queue:pause', paused.checked); live.pausedCb = paused;
  const vpaused = h('input', { type: 'checkbox' }); vpaused.onchange = () => api.invoke('video:pause', vpaused.checked); live.vpausedCb = vpaused;
  const tname = h('input', { type: 'text', placeholder: 'Tên thử' });
  const cmt = h('input', { type: 'text', placeholder: 'Nội dung bình luận', value: 'Máy đẹp quá!' });
  const gname = h('input', { type: 'text', placeholder: 'Tên người tặng' });
  const gift = h('input', { type: 'text', placeholder: 'Rose', value: 'Rose' });
  const gcount = h('input', { type: 'number', value: 1, min: 1 }); const gcoin = h('input', { type: 'number', value: 1, min: 0 });
  $('#tab-home').replaceChildren(h('div', { class: 'grid' },
    card('Kết nối TikTok LIVE',
      h('div', { class: 'row' }, h('label', {}, 'Username'), user),
      field('tiktok.autoConnect', 'Tự kết nối khi mở app', 'bool'),
      field('tiktok.autoReconnect', 'Tự kết nối lại khi rớt', 'bool'),
      field('tiktok.signApiKey', 'Euler API key (tuỳ chọn)', 'text', { ph: 'để trống nếu không có', tip: 'Khoá ký của eulerstream.com giúp kết nối ổn định hơn' }),
      h('div', { class: 'btns' }, btn('Kết nối', async () => { await setPath('tiktok.username', user.value.trim().replace(/^@/, '')); api.invoke('tiktok:connect', user.value); }, 'pri'),
        btn('Ngắt', () => api.invoke('tiktok:disconnect'), 'red')),
      live.tikMsg),
    card('Trạng thái', live.kpi, live.writing,
      h('div', { class: 'row' }, h('label', {}, 'Tạm dừng máy viết'), h('label', { class: 'switch' }, paused, h('span'))),
      h('div', { class: 'row' }, h('label', {}, 'Tạm dừng video popup'), h('label', { class: 'switch' }, vpaused, h('span'))),
      h('div', { class: 'btns' }, btn('Hiện màn hiển thị', () => api.invoke('win:show', 'display')), btn('Bật/tắt khung chỉnh video', () => api.invoke('win:show', 'popup')),
        btn('Xoá trắng giấy', () => api.invoke('paper:clear')), btn('Tải lại màn hiển thị', () => api.invoke('win:recreateDisplay')))),
    card(['Thử nghiệm', h('small', {}, 'không cần live')],
      note('Giả lập sự kiện để kiểm tra máy viết và video.'),
      h('div', { class: 'row' }, h('label', {}, 'Người vào phòng'), h('div', { class: 'ctl' }, tname, btn('Vào', () => api.invoke('test:join', tname.value.trim() || undefined), 'sm'))),
      h('div', { class: 'row' }, h('label', {}, 'Người tặng'), gname),
      h('div', { class: 'row' }, h('label', {}, 'Quà × số lượng'), h('div', { class: 'ctl' }, gift, gcount)),
      h('div', { class: 'row' }, h('label', {}, 'Giá 1 quà (xu)'), gcoin),
      h('div', { class: 'btns' }, btn('Gửi quà thử', () => api.invoke('test:gift', { name: gname.value.trim() || undefined, gift: gift.value || 'Rose', count: +gcount.value || 1, diamonds: +gcoin.value }), 'pri'),
        btn('10 người vào', () => { for (let i = 0; i < 10; i++) setTimeout(() => api.invoke('test:join'), i * 150); })),
      h('div', { class: 'row' }, h('label', {}, 'Bình luận thử'), h('div', { class: 'ctl' }, cmt, btn('Gửi', () => api.invoke('test:chat', tname.value.trim() || undefined, cmt.value), 'sm'))),
      h('div', { class: 'btns' }, btn('Thả 10 tim', () => api.invoke('test:like', tname.value.trim() || undefined, 10)), btn('Viết 1 câu quote ngay', () => api.invoke('test:quote')))),
    card('Nhật ký sự kiện', live.log),
  ));
  api.invoke('log:get').then(l => l.forEach(addLog));
}
function addLog(e) {
  if (!live.log) return;
  const d = new Date(e.t); const tm = d.toLocaleTimeString('vi-VN', { hour12: false });
  live.log.prepend(h('div', { class: e.kind }, `${tm}  ${e.text}`));
  while (live.log.childElementCount > 250) live.log.lastChild.remove();
}
function renderKpi(q) {
  if (!live.kpi) return;
  const s = q.stats || {};
  live.kpi.replaceChildren(
    h('div', { class: 'kpi' }, h('small', {}, 'Chờ donate'), h('div', { class: 'big' }, q.donors.length)),
    h('div', { class: 'kpi' }, h('small', {}, 'Chờ viết tên'), h('div', { class: 'big' }, q.names.length)),
    h('div', { class: 'kpi' }, h('small', {}, 'Đã viết'), h('div', { class: 'big' }, s.written || 0)),
    h('div', { class: 'kpi' }, h('small', {}, 'Logo donate'), h('div', { class: 'big' }, s.donors || 0)));
  if (live.pausedCb) live.pausedCb.checked = !!q.paused;
}

// ================= TAB: Viết tên
function renderNames() {
  live.qNames = h('div', { class: 'list' });
  const prev = h('div', { class: 'preview', style: `font-family:${ff(cfg.writer.names.fontId)}` }, 'Nguyễn Thị Hồng Nhung');
  binds.push(() => { prev.style.fontFamily = ff(cfg.writer.names.fontId); });
  $('#tab-names').replaceChildren(h('div', { class: 'grid' },
    card('Nguồn tên',
      field('writer.names.enabled', 'Bật viết tên người tham gia', 'bool'),
      field('writer.names.sources.join', 'Người vào phòng', 'bool'),
      field('writer.names.sources.chat', 'Người bình luận', 'bool'),
      field('writer.names.sources.follow', 'Người theo dõi', 'bool'),
      field('writer.names.sources.share', 'Người chia sẻ', 'bool'),
      field('writer.names.sources.like', 'Người thả tim', 'bool'),
      field('writer.names.likeThreshold', 'Số tim để được viết tên', 'number', { unit: 'tim', min: 1, tip: 'Cộng dồn tim của từng người; mỗi lần đủ số này thì viết tên 1 lần (vẫn theo giới hạn "không viết lại")' }),
      field('writer.names.display', 'Hiển thị', 'select', { options: [['nickname', 'Tên hiển thị (nickname)'], ['uniqueId', 'ID (@username)']] }),
      field('writer.names.dedupeMin', 'Không viết lại cùng người trong', 'number', { unit: 'phút', min: 0 }),
      field('writer.names.maxQueue', 'Hàng chờ tối đa', 'number', { unit: 'tên', min: 1, tip: 'Khi quá đông, bỏ người vào sớm nhất' }),
      field('writer.names.skipWhenDonors', 'Tạm ngưng tên khi còn donate chờ', 'bool')),
    card('Kiểu chữ tên',
      prev,
      field('writer.names.fontId', 'Font', 'select', { options: fontOptions }),
      field('writer.names.sizeCm', 'Chiều cao chữ', 'range', { min: 2, max: 9, step: 0.1, unit: ' cm' }),
      field('writer.names.nibMm', 'Cỡ ngòi bút', 'range', { min: 0.6, max: 4, step: 0.1, unit: ' mm' }),
      field('writer.names.fill', 'Kiểu nét', 'select', { options: [['hatch', 'Tô đặc (bút đi kín nét)'], ['outline', 'Chỉ viền']] }),
      field('writer.names.maxChars', 'Số ký tự tối đa', 'number', { min: 4, max: 40 }),
      field('writer.names.speed', 'Tốc độ ngòi', 'range', { min: 0.1, max: 1.5, step: 0.05, unit: ' m/s' }),
      field('writer.names.maxSec', 'Thời gian viết 1 tên (tối đa)', 'range', { min: 1, max: 10, step: 0.5, unit: ' giây', tip: 'Tên dài hơn sẽ được viết nhanh hơn để xong trong thời gian này' })),
    card(['Viết nội dung bình luận', h('small', {}, 'mỗi bình luận viết thành dòng riêng')],
      field('writer.names.comments.enabled', 'Bật viết nội dung bình luận', 'bool', { tip: 'Bật thì bình luận được viết ra giấy theo kiểu bên dưới (thay cho mẫu "Người bình luận")' }),
      field('writer.names.comments.format', 'Kiểu viết', 'select', { options: [['name_comment', 'Tên: nội dung'], ['comment_name', '“Nội dung” — Tên'], ['comment', 'Chỉ nội dung']] }),
      field('writer.names.comments.maxChars', 'Dài tối đa', 'number', { unit: 'ký tự', min: 10, max: 200, tip: 'Dài hơn sẽ cắt và thêm …; câu dài tự xuống tối đa 3 dòng' }),
      field('writer.names.comments.minChars', 'Bỏ qua bình luận ngắn hơn', 'number', { unit: 'ký tự', min: 1 }),
      field('writer.names.comments.cooldownSec', 'Mỗi người cách nhau ít nhất', 'number', { unit: 'giây', min: 0 }),
      field('writer.names.comments.maxSec', 'Thời gian viết 1 bình luận (tối đa)', 'range', { min: 1, max: 10, step: 0.5, unit: ' giây' }),
      field('writer.names.comments.blockWords', 'Từ cấm (mỗi dòng 1 từ – có từ này thì không viết)', 'lines', { full: true, rows: 3 })),
    card(['Nội dung viết kèm tên', h('small', {}, 'mỗi dòng = 1 mẫu, chọn ngẫu nhiên')],
      note('Mã thay thế: {name} tên · {comment} nội dung bình luận · {likes} số tim. Ví dụ: "Chào {name}!" hoặc "{name}: {comment}". Câu dài tự xuống dòng (tối đa 3 dòng).'),
      field('writer.names.templates.join', 'Người vào phòng', 'textarea', { full: true, rows: 2 }),
      field('writer.names.templates.chat', 'Người bình luận', 'textarea', { full: true, rows: 2 }),
      field('writer.names.templates.like', 'Người thả tim', 'textarea', { full: true, rows: 2 }),
      field('writer.names.templates.follow', 'Người theo dõi', 'textarea', { full: true, rows: 2 }),
      field('writer.names.templates.share', 'Người chia sẻ', 'textarea', { full: true, rows: 2 })),
    card(['Hàng chờ tên', h('small', {}, 'bấm × để bỏ')], live.qNames, h('div', { class: 'btns' }, btn('Xoá hàng chờ tên', () => api.invoke('queue:clear', 'names'), 'red'))),
  ));
}
function renderQueue(q) {
  renderKpi(q);
  const row = (j) => h('div', { class: 'item' }, h('span', { class: 'tag' }, j.type === 'donor' ? `${j.gift} x${j.count}` : (j.source || 'join')),
    h('span', { class: 'grow' }, j.name), h('button', { class: 'b sm red', onclick: () => api.invoke('queue:remove', j.id) }, '×'));
  if (live.qNames) live.qNames.replaceChildren(...(q.names.length ? q.names.map(row) : [h('div', { class: 'hint' }, 'Trống')]));
  if (live.qDonors) live.qDonors.replaceChildren(...(q.donors.length ? q.donors.map(row) : [h('div', { class: 'hint' }, 'Trống')]));
}

// ================= TAB: Donate & Logo
function renderDonors() {
  live.qDonors = h('div', { class: 'list' });
  // khung đang bật (dùng cho chế độ ngẫu nhiên / lần lượt)
  const enabledStrip = h('div', { class: 'thumbstrip' });
  const fixedStrip = h('div', { class: 'thumbstrip' });
  const imgList = h('div', { class: 'list', style: 'max-height:420px' });
  const draw = () => {
    fillStrip(enabledStrip, cfg.backgrounds.filter(b => b.enabled !== false).map(b => b.id));
    fillStrip(fixedStrip, [cfg.writer.donors.bgFixed]);
    const imgs = cfg.backgrounds.map((b, i) => [b, i]).filter(([b]) => b.type === 'image');
    imgList.replaceChildren(...(imgs.length ? imgs.map(([b, i]) => {
      const upd = (k, v) => { const arr = structuredClone(cfg.backgrounds); arr[i][k] = v; setPath('backgrounds', arr); };
      const orig = h('img', { src: api.mediaUrl(b.file), style: 'width:100%;height:150px;object-fit:contain;background:#fff;border-radius:6px' });
      const proc = h('img', { style: 'width:100%;height:150px;object-fit:contain;background:#f1e6cf;border-radius:6px' });
      const st = h('div', { class: 'hint' }, 'Đang xử lý…');
      imageThumb(b, cfg, api, 'Phạm Bảo Ngọc', 520, true).then(r => { proc.src = r.url;
        st.textContent = r.found ? '✓ Đã nhận vùng viết tên – ' + ({ rect: 'dạng thẳng', curved: 'dạng cong / vòng cung', varies: 'dạng to nhỏ không đều', 'curved+varies': 'cong và to nhỏ không đều' })[r.shape] : '⚠ Không thấy khung xanh lá – tên sẽ viết ở giữa khung';
        st.style.color = r.found ? 'var(--ok)' : 'var(--warn)'; }).catch(e => { st.textContent = 'Lỗi đọc ảnh: ' + e; st.style.color = 'var(--err)'; });
      const nm = h('input', { type: 'text', value: b.name, style: 'max-width:220px' }); nm.onchange = () => upd('name', nm.value);
      const rng = (k, def, min, max, unit) => { const r = h('input', { type: 'range', min, max, step: 1, value: b[k] ?? def }); const o = h('span', { class: 'unit' }, (b[k] ?? def) + unit);
        r.oninput = () => { o.textContent = r.value + unit; }; r.onchange = () => upd(k, +r.value); return h('div', { class: 'ctl' }, r, o); };
      const cb = h('input', { type: 'checkbox' }); cb.checked = b.clearBox !== false; cb.onchange = () => upd('clearBox', cb.checked);
      return h('div', { class: 'item', style: 'flex-direction:column;align-items:stretch;gap:6px' },
        h('div', { class: 'ctl' }, nm, h('span', { class: 'grow' }), btn('Xoá', () => api.invoke('bg:remove', b.id), 'sm red')),
        h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:8px' },
          h('div', {}, h('div', { class: 'hint' }, 'Ảnh gốc'), orig), h('div', {}, h('div', { class: 'hint' }, 'Máy sẽ vẽ (đã xoá nền)'), proc)),
        st,
        h('div', { class: 'row' }, h('label', {}, 'Độ nhạy nét'), rng('sens', 50, 0, 100, '')),
        h('div', { class: 'row' }, h('label', {}, 'Lề chữ trong vùng tên'), rng('namePad', 8, 0, 30, '%')),
        h('div', { class: 'row' }, h('label', {}, 'Cách dàn tên'), (() => { const sel = h('select', {}, ...[['auto', 'Tự động theo hình vùng xanh'], ['uniform', 'Uốn theo vùng, cỡ chữ đều'], ['box', 'Thẳng, vừa khung chữ nhật bao ngoài']].map(([v, t]) => h('option', { value: v }, t)));
          sel.value = b.nameMode || 'auto'; sel.onchange = () => upd('nameMode', sel.value); return sel; })()),
        h('div', { class: 'row' }, h('label', {}, 'Xoá nét cũ trong vùng tên'), h('label', { class: 'switch' }, cb, h('span'))));
    }) : [h('div', { class: 'hint' }, 'Chưa có ảnh logo riêng')]));
  };
  draw(); binds.push(draw);
  const prev = h('div', { class: 'preview', style: `font-family:${ff(cfg.writer.donors.fontId)};font-size:44px;text-align:center` }, 'Hoàng Thuỳ Linh');
  const prev2 = h('div', { class: 'preview', style: `font-family:${ff(cfg.writer.donors.decoFontId)};font-size:20px;text-align:center;letter-spacing:.12em;margin-top:6px` }, 'THANK YOU · ROSE X5');
  binds.push(() => { prev.style.fontFamily = ff(cfg.writer.donors.fontId); prev2.style.fontFamily = ff(cfg.writer.donors.decoFontId); });
  $('#tab-donors').replaceChildren(h('div', { class: 'grid' },
    card('Điều kiện & hàng chờ',
      field('writer.donors.enabled', 'Bật viết tên người donate', 'bool'),
      field('writer.donors.minDiamonds', 'Tổng xu tối thiểu', 'number', { unit: 'xu', min: 0 }),
      field('writer.donors.mergeSec', 'Gộp quà liên tiếp trong', 'number', { unit: 'giây', min: 0 }),
      field('writer.donors.display', 'Hiển thị', 'select', { options: [['nickname', 'Tên hiển thị'], ['uniqueId', 'ID (@username)']] }),
      field('writer.donors.maxQueue', 'Hàng chờ tối đa', 'number', { min: 1 }),
      h('div', { style: 'margin-top:8px' }, live.qDonors),
      h('div', { class: 'btns' }, btn('Xoá hàng chờ donate', () => api.invoke('queue:clear', 'donors'), 'red'))),
    card('Chữ trên logo',
      prev, prev2,
      field('writer.donors.fontId', 'Font tên', 'select', { options: fontOptions }),
      field('writer.donors.decoFontId', 'Font chữ trang trí', 'select', { options: fontOptions }),
      field('writer.donors.topText', 'Chữ phía trên', 'text'),
      field('writer.donors.bottomText', 'Chữ phía dưới', 'text'),
      field('writer.donors.smallText', 'Chữ nhỏ', 'text'),
      note('Mã thay thế: {gift} tên quà · {count} số lượng · {coins} xu/quà · {year} năm · {date} ngày · {name} tên.'),
      field('writer.donors.maxChars', 'Số ký tự tên tối đa', 'number', { min: 4, max: 40 })),
    card('Kích thước & tốc độ',
      field('writer.donors.badgeHeightCm', 'Chiều cao logo', 'range', { min: 18, max: 37, step: 1, unit: ' cm' }),
      field('writer.donors.aspect', 'Tỉ lệ rộng/cao', 'range', { min: 1, max: 3, step: 0.05 }),
      field('writer.donors.offsetXcm', 'Lệch ngang', 'range', { min: -30, max: 30, step: 1, unit: ' cm' }),
      field('writer.donors.nibMm', 'Ngòi viết tên', 'range', { min: 1, max: 6, step: 0.1, unit: ' mm' }),
      field('writer.donors.decoNibMm', 'Ngòi nét trang trí', 'range', { min: 0.6, max: 3, step: 0.1, unit: ' mm' }),
      field('writer.donors.speed', 'Tốc độ viết tên', 'range', { min: 0.1, max: 2, step: 0.05, unit: ' m/s' }),
      field('writer.donors.decoSpeed', 'Tốc độ vẽ khung', 'range', { min: 0.1, max: 2, step: 0.05, unit: ' m/s' }),
      field('writer.donors.maxSec', 'Thời gian vẽ logo + tên (tối đa)', 'range', { min: 1, max: 10, step: 0.5, unit: ' giây', tip: 'Chưa gồm vài giây cuộn giấy trước khi vẽ' })),
    tierCard(),
    card(['Nền logo', h('small', {}, 'bật/tắt để chọn mẫu dùng')],
      field('writer.donors.bgMode', 'Cách chọn', 'select', { options: [['tiers', 'Theo bậc donate'], ['random', 'Ngẫu nhiên'], ['sequential', 'Lần lượt'], ['fixed', 'Cố định 1 mẫu']] }),
      h('div', { class: 'hint', style: 'margin-top:8px' }, 'Khung dùng cho chế độ Ngẫu nhiên / Lần lượt:'), enabledStrip,
      h('div', { class: 'btns' }, btn('Mở kho khung…', () => openGallery({ title: 'Chọn các khung được dùng (ngẫu nhiên / lần lượt)', multi: true,
        selected: cfg.backgrounds.filter(b => b.enabled !== false).map(b => b.id),
        onDone: (ids) => setPath('backgrounds', cfg.backgrounds.map(b => ({ ...b, enabled: ids.includes(b.id) }))) }), 'pri')),
      h('div', { class: 'hint', style: 'margin-top:10px' }, 'Khung cho chế độ Cố định 1 mẫu:'), fixedStrip,
      h('div', { class: 'btns' }, btn('Chọn khung cố định…', () => openGallery({ title: 'Chọn 1 khung cố định', multi: false, selected: [cfg.writer.donors.bgFixed],
        onDone: (ids) => ids[0] && setPath('writer.donors.bgFixed', ids[0]) }))),
      h('h4', { style: 'margin:14px 0 4px;color:var(--brass)' }, 'Khung ảnh của bạn'),
      note('Vẽ (hoặc tô) một vùng viết tên bằng viền XANH LÁ (#00FF00) lên ảnh – chữ nhật, vòng cung, uốn sóng, phình to/thu nhỏ đều được (viền phải khép kín). Phần mềm tự tìm khung đó, xoá nền + mảng màu, chỉ giữ nét hoa văn để ngòi bút vẽ lại, rồi tự chọn cỡ chữ cho tên vừa khít vùng xanh. Ảnh PNG/JPG, càng nét càng đẹp.'),
      h('div', { class: 'btns' }, btn('+ Thêm khung ảnh', () => api.invoke('bg:addImage'), 'pri')),
      imgList,
      h('details', { style: 'margin-top:8px' }, h('summary', { class: 'hint', style: 'cursor:pointer' }, 'Chữ riêng cho từng khung mẫu'), tplTexts())),
  ));
}

// ---------- kho khung (ảnh xem trước)
const thumbOf = (b, sample) => b.type === 'image' ? imageThumb(b, cfg, api, sample).then(r => r.url).catch(() => api.mediaUrl(b.file)) : templateThumb(b, cfg, api, sample);
function fillStrip(el, ids) {
  const list = ids.map(id => cfg.backgrounds.find(b => b.id === id)).filter(Boolean);
  el.replaceChildren(...(list.length ? list.map(b => {
    const im = h('img', { title: b.name, alt: b.name }); thumbOf(b).then(u => { im.src = u; });
    return h('div', { class: 'tmini' }, im);
  }) : [h('span', { class: 'hint' }, 'Chưa chọn khung')]));
}
function openGallery({ title, multi, selected, onDone }) {
  const sel = new Set((selected || []).filter(Boolean));
  const sampleIn = h('input', { type: 'text', value: 'Phạm Bảo Ngọc', style: 'max-width:220px' });
  const grid = h('div', { class: 'gwrap' });
  const count = h('span', { class: 'hint' });
  const card1 = (b) => {
    const im = h('img', { alt: b.name }); thumbOf(b, sampleIn.value || 'Phạm Bảo Ngọc').then(u => { im.src = u; });
    const c = h('div', { class: 'gcard' + (sel.has(b.id) ? ' on' : ''), title: b.name, onclick: () => {
      if (multi) { sel.has(b.id) ? sel.delete(b.id) : sel.add(b.id); c.classList.toggle('on'); count.textContent = `Đã chọn ${sel.size} khung`; }
      else { sel.clear(); sel.add(b.id); grid.querySelectorAll('.gcard').forEach(x => x.classList.remove('on')); c.classList.add('on'); }
    } }, h('div', { class: 'gimg' }, im), h('div', { class: 'gname' }, b.name), h('span', { class: 'gtick' }, '✓'));
    return c;
  };
  const draw = () => {
    count.textContent = multi ? `Đã chọn ${sel.size} khung` : '';
    const mine = cfg.backgrounds.filter(b => b.type === 'image'), tpls = cfg.backgrounds.filter(b => b.type !== 'image');
    const add = h('div', { class: 'gcard gadd', onclick: () => api.invoke('bg:addImage') }, h('div', { class: 'gimg' }, h('span', { style: 'font-size:42px;color:var(--brass)' }, '+')), h('div', { class: 'gname' }, 'Thêm khung ảnh (có khung xanh lá)'));
    const det = h('details', { class: 'gsec', open: !mine.length }, h('summary', {}, `Khung mẫu có sẵn (${tpls.length})`), h('div', { class: 'ggrid in' }, ...tpls.map(card1)));
    grid.replaceChildren(h('div', { class: 'gsec' }, h('h4', {}, `Khung ảnh của bạn (${mine.length})`), h('div', { class: 'ggrid in' }, ...mine.map(card1), add)), det);
  };
  const close = () => { ov.remove(); off(); };
  const ov = h('div', { class: 'modal' }, h('div', { class: 'mbox' },
    h('div', { class: 'mhead' }, h('b', {}, title || 'Kho khung'), h('span', { class: 'grow' }),
      h('label', { class: 'hint' }, 'Tên mẫu '), sampleIn, btn('Xem', draw, 'sm'), btn('+ Thêm khung ảnh', async () => { await api.invoke('bg:addImage'); }, 'sm')),
    grid,
    h('div', { class: 'mfoot' }, count, h('span', { class: 'grow' }),
      multi ? btn('Bỏ chọn hết', () => { sel.clear(); draw(); }, 'sm') : null,
      btn('Huỷ', close), btn('Xong', () => { onDone([...sel].filter(id => cfg.backgrounds.some(b => b.id === id))); close(); }, 'pri'))));
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  const off = api.on('config', () => setTimeout(draw, 0));
  document.body.append(ov); draw();
}
// chữ riêng cho từng khung mẫu (để trống = dùng chữ chung)
function tplTexts() {
  const box = h('div', { class: 'list', style: 'max-height:360px;margin-top:6px' });
  const draw = () => box.replaceChildren(...cfg.backgrounds.map((b, i) => {
    if (b.type === 'image') return null;
    const upd = (k, v) => { const arr = structuredClone(cfg.backgrounds); arr[i][k] = v; setPath('backgrounds', arr); };
    const t = (k, ph) => { const x = h('input', { type: 'text', placeholder: ph }); x.value = b[k] ?? ''; x.onchange = () => upd(k, x.value === '' ? undefined : x.value); return x; };
    return h('div', { class: 'item', style: 'flex-direction:column;align-items:stretch' }, h('span', {}, b.name),
      h('div', { class: 'ctl', style: 'gap:6px;margin-top:4px' }, t('top', 'chữ trên'), t('bottom', 'chữ dưới'), t('small', 'chữ nhỏ')));
  }).filter(Boolean));
  draw(); binds.push(draw);
  return box;
}

// ---------- bậc donate
function tierCard() {
  const list = h('div', { class: 'list', style: 'max-height:none' });
  const save = (arr) => setPath('writer.donors.tiers', arr);
  const draw = () => {
    const tiers = cfg.writer.donors.tiers || [];
    list.replaceChildren(...tiers.map((t, i) => {
      const upd = (k, v) => { const a = structuredClone(cfg.writer.donors.tiers); a[i][k] = v; save(a); };
      const on = h('input', { type: 'checkbox' }); on.checked = t.enabled !== false; on.onchange = () => upd('enabled', on.checked);
      const nm = h('input', { type: 'text', value: t.name || '', style: 'max-width:120px' }); nm.onchange = () => upd('name', nm.value);
      const mn = h('input', { type: 'number', value: t.min ?? 1, min: 0, style: 'max-width:90px' }); mn.onchange = () => upd('min', Math.max(0, +mn.value || 0));
      const strip = h('div', { class: 'thumbstrip' }); fillStrip(strip, t.bgs || []);
      const pick = btn('Chọn khung…', () => openGallery({ title: `Khung cho ${t.name || 'bậc'} (từ ${t.min ?? 0} xu)`, multi: true, selected: t.bgs || [], onDone: (ids) => upd('bgs', ids) }), 'sm pri');
      return h('div', { class: 'item', style: 'flex-direction:column;align-items:stretch;gap:6px' },
        h('div', { class: 'ctl', style: 'gap:8px;flex-wrap:wrap' }, h('label', { class: 'switch' }, on, h('span')), nm,
          h('span', { class: 'hint' }, 'từ'), mn, h('span', { class: 'hint' }, 'xu trở lên'), h('span', { class: 'grow' }),
          btn('Xoá', () => save(cfg.writer.donors.tiers.filter((_, k) => k !== i)), 'sm red')),
        h('div', { class: 'ctl', style: 'gap:8px;align-items:flex-start' }, strip, pick),
        (t.bgs || []).length ? null : h('div', { class: 'hint', style: 'color:var(--warn)' }, 'Chưa chọn logo – bậc này sẽ dùng các logo đang bật'));
    }));
  };
  draw(); binds.push(draw);
  return card(['Bậc donate', h('small', {}, 'áp dụng khi "Cách chọn" = Theo bậc donate')],
    note('Tính theo tổng xu của lượt tặng (đã gộp combo). Máy dùng bậc cao nhất mà người tặng đạt tới; bậc có nhiều logo thì chọn ngẫu nhiên. Ảnh logo thêm ở thẻ "Nền logo" sẽ xuất hiện ở đây để chọn.'),
    list,
    h('div', { class: 'btns' }, btn('+ Thêm bậc', () => {
      const a = structuredClone(cfg.writer.donors.tiers || []); const top = a.reduce((m, t) => Math.max(m, t.min || 0), 0);
      a.push({ id: 'tier-' + Date.now().toString(36), name: 'Bậc ' + (a.length + 1), min: top ? top * 5 : 1, bgs: [], enabled: true }); save(a);
    }, 'pri')));
}

// ================= TAB: Video
function renderVideo() {
  const CAT = { idle: 'Video idle (khi vắng)', greet: 'Video chào (có người vào)', thanks: 'Video cảm ơn (có quà)' };
  live.vstat = h('div', { class: 'hint' }, '—');
  const lists = {};
  const draw = async () => {
    for (const cat of Object.keys(CAT)) {
      const files = cfg.video.categories[cat].files || [];
      const ex = files.length ? await api.invoke('video:exists', files) : [];
      lists[cat].replaceChildren(...(files.length ? files.map((f, i) => h('div', { class: 'item' + (ex[i] ? '' : ' missing'), title: f },
        h('span', { class: 'grow' }, fname(f)),
        btn('▶', () => api.invoke('video:playNow', cat, f), 'sm'), btn('×', () => api.invoke('video:remove', cat, f), 'sm red'))) : [h('div', { class: 'hint' }, 'Chưa có video')]));
    }
  };
  const catCard = (cat, timing) => {
    lists[cat] = h('div', { class: 'list' });
    return card([CAT[cat], h('small', {}, '')],
      field(`video.categories.${cat}.enabled`, 'Bật', 'bool'),
      field(`video.categories.${cat}.random`, 'Phát ngẫu nhiên', 'bool', { tip: 'Tắt = phát lần lượt theo danh sách' }),
      ...timing,
      lists[cat],
      h('div', { class: 'btns' }, btn('+ Thêm video', () => api.invoke('video:add', cat), 'pri'), btn('Phát thử', () => api.invoke('video:playNow', cat))));
  };
  $('#tab-video').replaceChildren(
    h('div', { class: 'grid', style: 'margin-bottom:14px' },
      card('Khung video (trong màn hiển thị)', live.vstat,
        field('video.editFrame', 'Hiện khung để chỉnh vị trí', 'bool', { tip: 'Bật để thấy khung khi chưa có video, kéo thả trong màn hiển thị. Tắt khi live.' }),
        field('video.whenNone', 'Khi không có video', 'select', { options: [['hide', 'Ẩn khung'], ['black', 'Màn đen'], ['last', 'Giữ khung hình cuối']] }),
        field('video.boxBg', 'Màu nền khung', 'color'),
        field('video.fit', 'Cách hiển thị', 'select', { options: [['contain', 'Vừa khung (không cắt)'], ['cover', 'Lấp đầy (cắt viền)'], ['fill', 'Kéo giãn']] }),
        field('video.volume', 'Âm lượng', 'range', { min: 0, max: 1, step: 0.05 }),
        note('Khung video nằm trong cửa sổ hiển thị máy (không ra ngoài được), nên LIVE Studio chỉ cần bắt 1 cửa sổ. Kéo giữa khung để di chuyển, kéo 4 góc để đổi cỡ; vị trí được nhớ.'),
        h('div', { class: 'btns' }, btn('Đặt lại vị trí khung', () => api.invoke('win:popupReset')), btn('Dừng video', () => api.invoke('video:stop'), 'red'))),
      card('Ưu tiên', note('Cảm ơn > Chào > Idle. Video chào/cảm ơn có thời gian chờ giữa 2 lần phát; trong lúc chờ, các lượt vào/quà được gộp lại và phát 1 lần khi hết thời gian chờ.'),
        note('"Tỉ lệ phát" cho phép chỉ phát ngẫu nhiên một phần số lần (ví dụ 50% = khoảng một nửa số lần đủ điều kiện).'))),
    h('div', { class: 'cats' },
      catCard('idle', [field('video.idle.afterSec', 'Coi là vắng sau', 'number', { unit: 'giây không ai vào/bình luận/donate' }),
        field('video.idle.loop', 'Phát liên tục không tắt khi vắng', 'bool'), field('video.idle.gapSec', 'Nghỉ giữa 2 video idle (khi tắt liên tục)', 'number', { unit: 'giây' })]),
      catCard('greet', [field('video.greet.cooldownSec', 'Tối thiểu giữa 2 lần chào', 'number', { unit: 'giây' }), field('video.greet.minJoins', 'Số người vào để chào', 'number', { unit: 'người', min: 1 }),
        field('video.greet.chance', 'Tỉ lệ phát', 'range', { min: 0, max: 100, step: 5, unit: '%' }), field('video.greet.interruptIdle', 'Ngắt video idle', 'bool')]),
      catCard('thanks', [field('video.thanks.cooldownSec', 'Tối thiểu giữa 2 lần cảm ơn', 'number', { unit: 'giây' }), field('video.thanks.minDiamonds', 'Quà tối thiểu', 'number', { unit: 'xu' }),
        field('video.thanks.chance', 'Tỉ lệ phát', 'range', { min: 0, max: 100, step: 5, unit: '%' }), field('video.thanks.interrupt', 'Ngắt video chào/idle', 'bool')]),
    ));
  draw(); binds.push(draw);
}
function renderVStat(s) {
  const CATV = { idle: 'Idle', greet: 'Chào', thanks: 'Cảm ơn' };
  const t = s.paused ? 'Đang tạm dừng' : s.cur ? `▶ ${CATV[s.cur.cat]}: ${s.cur.file}` : `Chờ · vắng ${s.quietSec}s · idle sau ${s.idleIn}s · chào chờ ${s.cooldown.greet}s · cảm ơn chờ ${s.cooldown.thanks}s`;
  if (live.vstat) live.vstat.textContent = t + `  (đã phát: idle ${s.counts.idle}, chào ${s.counts.greet}, cảm ơn ${s.counts.thanks})`;
  const p = $('#pVid'); p.textContent = 'Video: ' + (s.paused ? 'tạm dừng' : s.cur ? CATV[s.cur.cat] : 'chờ'); p.className = 'pill ' + (s.cur ? 'ok' : '');
  if (live.vpausedCb) live.vpausedCb.checked = !!s.paused;
}

// ================= TAB: Quote chờ
function renderQuotes() {
  const prev = h('div', { class: 'preview', style: `font-family:${ff(cfg.writer.quotes.fontId)};white-space:normal;font-size:28px` }, 'Có công mài sắt, có ngày nên kim');
  binds.push(() => { prev.style.fontFamily = ff(cfg.writer.quotes.fontId); });
  const cnt = h('span', { class: 'hint' }); const upd = () => { cnt.textContent = `${(cfg.writer.quotes.list || []).length} câu Việt · ${(cfg.writer.quotes.listEn || []).length} câu Anh`; }; upd(); binds.push(upd);
  $('#tab-quotes').replaceChildren(h('div', { class: 'grid' },
    card('Khi vắng người',
      note('Khi không có ai vào, bình luận hay tặng quà trong một khoảng thời gian, máy tự viết các câu quote. Có người mới là dừng câu đang viết để viết tên.'),
      field('writer.quotes.enabled', 'Bật viết quote khi vắng', 'bool'),
      field('writer.quotes.afterSec', 'Coi là vắng sau', 'number', { unit: 'giây', min: 3 }),
      field('writer.quotes.gapSec', 'Nghỉ giữa 2 câu', 'number', { unit: 'giây', min: 0 }),
      field('writer.quotes.interrupt', 'Có người mới thì dừng câu đang viết', 'bool'),
      field('writer.quotes.random', 'Chọn câu ngẫu nhiên', 'bool', { tip: 'Tắt = lần lượt theo danh sách' }),
      field('writer.quotes.language', 'Ngôn ngữ quote', 'select', { options: [['both', 'Tiếng Việt + Tiếng Anh'], ['vi', 'Chỉ tiếng Việt'], ['en', 'Chỉ tiếng Anh']] }),
      h('div', { class: 'btns' }, btn('Viết 1 câu ngay', () => api.invoke('test:quote'), 'pri'))),
    card('Kiểu chữ quote', prev,
      field('writer.quotes.fontId', 'Font', 'select', { options: fontOptions }),
      field('writer.quotes.sizeCm', 'Chiều cao chữ', 'range', { min: 2.5, max: 10, step: 0.1, unit: ' cm' }),
      field('writer.quotes.authorSizeCm', 'Chữ tác giả', 'range', { min: 1.5, max: 6, step: 0.1, unit: ' cm' }),
      field('writer.quotes.widthPct', 'Bề rộng khối chữ', 'range', { min: 40, max: 96, step: 2, unit: '%' }),
      field('writer.quotes.nibMm', 'Cỡ ngòi', 'range', { min: 0.6, max: 4, step: 0.1, unit: ' mm' }),
      field('writer.quotes.fill', 'Kiểu nét', 'select', { options: [['hatch', 'Tô đặc'], ['outline', 'Chỉ viền']] }),
      field('writer.quotes.divider', 'Gạch trang trí dưới câu', 'bool'),
      field('writer.quotes.speed', 'Tốc độ ngòi', 'range', { min: 0.1, max: 1.5, step: 0.05, unit: ' m/s' }),
      field('writer.quotes.maxSec', 'Thời gian viết 1 câu (tối đa)', 'range', { min: 1, max: 10, step: 0.5, unit: ' giây' })),
    card(['Danh sách quote', cnt],
      note('Mỗi dòng 1 câu. Muốn ghi tác giả thì thêm " — Tên tác giả" ở cuối dòng.'),
      field('writer.quotes.list', 'Danh sách tiếng Việt', 'lines', { full: true, rows: 12 }),
      field('writer.quotes.listEn', 'Danh sách tiếng Anh (English)', 'lines', { full: true, rows: 12 })),
  ));
}

// ================= TAB: Font
function renderFonts() {
  const sample = h('input', { type: 'text', value: 'Nguyễn Thị Hồng Nhung – Đặng Quốc Bảo' });
  const list = h('div', { class: 'list', style: 'max-height:none' });
  const draw = () => list.replaceChildren(...cfg.fonts.map(f => h('div', { class: 'item', style: 'flex-direction:column;align-items:stretch' },
    h('div', { class: 'ctl' }, h('span', { class: 'grow' }, f.name), h('span', { class: 'tag' }, f.builtin ? 'có sẵn' : fname(f.file)),
      f.builtin ? null : btn('Xoá', () => api.invoke('fonts:remove', f.id), 'sm red')),
    h('div', { class: 'preview', style: `font-family:${ff(f.id)};font-size:30px` }, sample.value))));
  sample.oninput = draw; draw(); binds.push(draw);
  $('#tab-fonts').replaceChildren(h('div', { class: 'grid' },
    card('Thêm font của bạn', note('Hỗ trợ .ttf, .otf, .woff. Font cần có dấu tiếng Việt; ký tự nào font thiếu sẽ tự lấy từ font dự phòng (Playfair/Dancing Script). Emoji được bỏ qua.'),
      h('div', { class: 'row' }, h('label', {}, 'Chữ mẫu'), sample), h('div', { class: 'btns' }, btn('+ Thêm font', () => api.invoke('fonts:add'), 'pri'))),
    card('Danh sách font', list)));
}

// ================= TAB: Hiển thị & camera
function renderDisplay() {
  $('#tab-display').replaceChildren(h('div', { class: 'grid' },
    card('Cửa sổ hiển thị 9:16',
      h('div', { class: 'btns' }, ...[[405, 720], [540, 960], [720, 1280], [1080, 1920]].map(([w, hh]) => btn(`${w}×${hh}`, () => api.invoke('win:displaySize', w, hh), 'sm'))),
      field('display.frameless', 'Ẩn khung cửa sổ (không viền)', 'bool', { tip: 'Tắt = có khung để kéo di chuyển và đổi cỡ. Áp dụng khi tải lại màn hiển thị' }),
      note('Trong LIVE Studio dùng Window capture và chọn chỉ lấy phần nội dung (client area) để không dính thanh tiêu đề.'),
      field('display.alwaysOnTop', 'Luôn nằm trên', 'bool'),
      field('display.dragWindow', 'Kéo cửa sổ bằng chuột (tắt xoay camera)', 'bool'),
      field('display.renderScale', 'Độ nét render', 'range', { min: 0.5, max: 2, step: 0.25, unit: '×' }),
      h('div', { class: 'btns' }, btn('Tải lại màn hiển thị', () => api.invoke('win:recreateDisplay')))),
    card('Camera',
      note('Trong màn hiển thị: chuột trái xoay, chuột phải kéo, lăn để zoom. Chỉnh xong bấm lưu.'),
      h('div', { class: 'btns' }, btn('Lưu góc chính', () => api.invoke('display:cmd', { cmd: 'saveCamera', name: 'main' }), 'pri'),
        btn('Lưu góc cận donate', () => api.invoke('display:cmd', { cmd: 'saveCamera', name: 'donor' }), 'pri'),
        btn('Lưu góc chờ (quote)', () => api.invoke('display:cmd', { cmd: 'saveCamera', name: 'quote' }), 'pri')),
      h('div', { class: 'btns' }, btn('Về góc chính', () => api.invoke('display:cmd', { cmd: 'camera', name: 'main' })), btn('Xem góc donate', () => api.invoke('display:cmd', { cmd: 'camera', name: 'donor' })),
        btn('Xem góc chờ', () => api.invoke('display:cmd', { cmd: 'camera', name: 'quote' })),
        btn('Mặc định góc chính', () => api.invoke('display:cmd', { cmd: 'resetCamera', name: 'main' })), btn('Mặc định góc donate', () => api.invoke('display:cmd', { cmd: 'resetCamera', name: 'donor' })),
        btn('Mặc định góc chờ', () => api.invoke('display:cmd', { cmd: 'resetCamera', name: 'quote' }))),
      field('display.quoteCam', 'Chuyển góc chờ khi viết quote', 'bool', { tip: 'Lúc vắng người, camera lùi ra để người xem đọc được trọn câu quote' }),
      field('display.mouseCamera', 'Cho phép xoay bằng chuột', 'bool'),
      field('display.followPen', 'Camera bám theo ngòi bút', 'range', { min: 0, max: 100, step: 5, unit: '%' }),
      field('display.donorZoom', 'Tự zoom khi viết donate', 'bool'),
      field('display.donorHoldSec', 'Giữ cận cảnh sau khi xong', 'number', { unit: 'giây' })),
    card('Ánh sáng',
      field('display.lighting', 'Kiểu ánh sáng', 'select', { options: [['cinematic', 'Điện ảnh (đèn rọi, nền tối)'], ['studio', 'Studio sáng (nền sáng)']] }),
      field('display.keyLight', 'Độ mạnh đèn chính', 'range', { min: 0.3, max: 2.5, step: 0.05, unit: '×' }),
      field('display.bloom', 'Hào quang ánh kim (bloom)', 'range', { min: 0, max: 1.2, step: 0.05 }),
      field('display.vignette', 'Tối viền (vignette)', 'range', { min: 0, max: 1, step: 0.05 }),
      field('display.table', 'Mặt bàn tối dưới máy', 'bool'),
      note('Bloom tốn GPU hơn – máy yếu có thể đặt 0.')),
    card('Cảnh & giấy',
      field('display.bgColor', 'Màu nền', 'color'),
      h('div', { class: 'row' }, h('label', {}, 'Ảnh nền'), h('div', { class: 'ctl' },
        btn('Chọn ảnh', async () => { const f = await api.invoke('files:pick', 'image'); if (f[0]) setPath('display.bgImage', f[0]); }, 'sm'),
        btn('Bỏ', () => setPath('display.bgImage', ''), 'sm red'))),
      field('display.exposure', 'Độ sáng', 'range', { min: 0.5, max: 1.8, step: 0.05 }),
      field('display.floorShadow', 'Bóng đổ nền', 'range', { min: 0, max: 0.8, step: 0.02 }),
      field('writer.paper.inkColor', 'Màu mực', 'color'),
      field('writer.paper.tint', 'Màu giấy', 'color'),
      field('writer.paper.grain', 'Độ vân giấy', 'range', { min: 0, max: 1.5, step: 0.05 }),
      field('writer.paper.feedSpeed', 'Tốc độ cuộn giấy', 'range', { min: 0.03, max: 0.4, step: 0.01, unit: ' m/s' }))));
}

// ================= TAB: Cập nhật
function renderUpdate() {
  live.upd = h('div', { class: 'hint' }, '—'); live.info = h('div', { class: 'hint' });
  live.applyBtn = btn('Khởi động lại để cập nhật', () => api.invoke('update:apply'), 'pri'); live.applyBtn.style.display = 'none';
  $('#tab-update').replaceChildren(h('div', { class: 'grid' },
    card('Cập nhật từ xa qua GitHub', note('App tải thư mục app/ mới nhất từ repo GitHub (public) khi version.json trong repo có số phiên bản lớn hơn.'),
      field('update.owner', 'Tài khoản GitHub', 'text'), field('update.repo', 'Tên repo', 'text'), field('update.branch', 'Nhánh', 'text'),
      field('update.autoCheck', 'Tự kiểm tra', 'bool'), field('update.intervalMin', 'Kiểm tra mỗi', 'number', { unit: 'phút', min: 10 }),
      live.upd, h('div', { class: 'btns' }, btn('Kiểm tra ngay', () => api.invoke('update:check')), live.applyBtn)),
    card('Ứng dụng', live.info,
      h('div', { class: 'btns' }, btn('Mở thư mục dữ liệu', () => api.invoke('open:userData')), btn('Xuất cấu hình', () => api.invoke('config:export')), btn('Nhập cấu hình', () => api.invoke('config:import'))))));
  api.invoke('app:info').then(i => { live.info.textContent = `Phiên bản app v${i.appVersion} (${i.appSource === 'update' ? 'bản cập nhật' : 'bản cài'}) · shell v${i.shellVersion} · dữ liệu: ${i.userData}`; $('#ver').textContent = `v${i.appVersion}`; });
  api.invoke('update:status').then(renderUpd);
}
function renderUpd(s) { if (!live.upd || !s) return; live.upd.textContent = s.message || s.state; live.applyBtn.style.display = s.state === 'ready' ? '' : 'none'; if (s.state === 'ready') toast(s.message); }

// ---------------- khởi tạo
refreshFontFaces();
renderHome(); renderNames(); renderQuotes(); renderDonors(); renderVideo(); renderFonts(); renderDisplay(); renderUpdate();
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.id === 'tab-' + b.dataset.tab));
});
api.on('config', (c) => { const fontsChanged = JSON.stringify(c.fonts) !== JSON.stringify(cfg.fonts); cfg = c; if (fontsChanged) refreshFontFaces(); binds.forEach(f => f()); });
api.on('log', addLog);
api.on('queue', renderQueue);
api.on('video:status', renderVStat);
api.on('update:status', renderUpd);
function renderTik(s) {
  const p = $('#pTik'); p.textContent = 'TikTok: ' + ({ connected: 'đã kết nối', connecting: 'đang kết nối', error: 'lỗi', disconnected: 'chưa kết nối' }[s.state] || s.state) + (s.viewers ? ` · ${s.viewers} người xem` : '');
  p.className = 'pill ' + ({ connected: 'ok', connecting: 'warn', error: 'err' }[s.state] || '');
  if (live.tikMsg) live.tikMsg.textContent = s.message;
}
api.on('tiktok:status', renderTik);
api.on('display:status', (s) => {
  const what = (j) => j.type === 'quote' ? `quote ${j.name}` : `"${j.name}"`;
  const p = $('#pWrite'); p.textContent = 'Máy viết: ' + (s.busy ? (s.job ? `đang viết ${what(s.job)}` : 'đang viết') : 'rảnh') + (s.fps ? ` · ${s.fps} fps` : '');
  p.className = 'pill ' + (s.busy ? 'ok' : '');
  if (live.writing) live.writing.textContent = s.busy && s.job ? `Đang viết: ${s.job.name} (${({ donor: 'donate', quote: 'quote chờ' })[s.job.type] || 'tên'})` : 'Máy viết đang chờ';
});
api.invoke('queue:get').then(renderQueue);
api.invoke('video:status').then(renderVStat);
api.invoke('tiktok:status').then(s => s && renderTik(s));
