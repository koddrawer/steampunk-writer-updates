// Ảnh xem trước của khung logo: dựng đúng các nét máy sẽ vẽ rồi vẽ lên canvas nhỏ.
import { buildBadge } from './badge.js';
import { loadChain, layoutText, textToStrokes } from './text.js';
import { processFrame, placeName } from './frameimg.js';

const FALLBACK = ['playfair-display-vietnamese-700-normal.woff', 'dancing-script-vietnamese-700-normal.woff', 'playfair-display-latin-ext-700-normal.woff', 'playfair-display-latin-700-normal.woff'].map(f => '../assets/fonts/' + f);
const chains = new Map();
const cache = new Map();

function urlsFor(cfg, api, id) {
  const f = (cfg.fonts || []).find(x => x.id === id) || (cfg.fonts || [])[0];
  if (!f) return FALLBACK;
  return [...(f.builtin ? f.files.map(x => '../assets/fonts/' + x) : [api.mediaUrl(f.file)]), ...FALLBACK];
}
function chain(cfg, api, id) {
  const u = urlsFor(cfg, api, id); const k = u.join('|');
  if (!chains.has(k)) chains.set(k, loadChain(u));
  return chains.get(k);
}

export async function templateThumb(bg, cfg, api, sample = 'Phạm Bảo Ngọc', w = 320) {
  const d = cfg.writer.donors;
  const fill = (t) => (t || '').replace(/\{gift\}/g, 'Rose').replace(/\{count\}/g, 5).replace(/\{coins\}/g, 1)
    .replace(/\{year\}/g, new Date().getFullYear()).replace(/\{name\}/g, sample).replace(/\{date\}/g, new Date().toLocaleDateString('vi-VN'));
  const texts = { top: fill(bg.top ?? d.topText), bottom: fill(bg.bottom ?? d.bottomText), small: fill(bg.small ?? d.smallText) };
  const key = [bg.template, d.fontId, d.decoFontId, d.aspect, sample, texts.top, texts.bottom, texts.small, w].join('|');
  if (cache.has(key)) return cache.get(key);
  const p = (async () => {
    const [nameC, decoC] = await Promise.all([chain(cfg, api, d.fontId), chain(cfg, api, d.decoFontId || d.fontId)]);
    const H = 0.34, W = H * (d.aspect || 1.7);
    const b = buildBadge(bg.template, { W, H, chains: { name: nameC, deco: decoC }, name: sample, ...texts, nibName: 0.003, nibDeco: 0.0014 });
    const cv = document.createElement('canvas'); cv.width = w; cv.height = Math.round(w * H / W * 1.08);
    const x = cv.getContext('2d');
    x.fillStyle = '#f1e6cf'; x.fillRect(0, 0, cv.width, cv.height);
    const k = w / (W * 1.08);
    x.translate(cv.width / 2, cv.height / 2); x.scale(k, -k);
    x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#2b1b10';
    const draw = (arr, nib) => { x.lineWidth = Math.max(nib, 1.1 / k); for (const s of arr) { x.beginPath(); x.moveTo(s[0][0], s[0][1]); for (let i = 1; i < s.length; i++) x.lineTo(s[i][0], s[i][1]); x.stroke(); } };
    draw(b.deco, 0.0014); draw(b.names, 0.003);
    return cv.toDataURL('image/png');
  })();
  cache.set(key, p);
  return p;
}

// Ảnh xem trước khung ảnh của người dùng: nét đã tách nền + tên mẫu viết vào vùng khung xanh lá
export async function imageThumb(bg, cfg, api, sample = 'Phạm Bảo Ngọc', w = 320, showBox = false) {
  const d = cfg.writer.donors;
  const key = ['img', bg.file, bg.sens, bg.clearBox, bg.namePad, bg.nameMode, d.fontId, sample, w, showBox].join('|');
  if (cache.has(key)) return cache.get(key);
  const p = (async () => {
    const fr = await processFrame(api.mediaUrl(bg.file), { sens: (bg.sens ?? 50) / 100, clearBox: bg.clearBox !== false });
    const cv = document.createElement('canvas'); cv.width = w; cv.height = Math.round(w * fr.h / fr.w);
    const x = cv.getContext('2d'); const k = w / fr.w;
    x.fillStyle = '#f1e6cf'; x.fillRect(0, 0, cv.width, cv.height);
    x.drawImage(fr.inkCanvas, 0, 0, cv.width, cv.height);
    if (showBox && fr.region) {          // tô mờ vùng tên đã nhận + đường giữa
      const rc = document.createElement('canvas'); rc.width = fr.w; rc.height = fr.h; const rx = rc.getContext('2d'); const id = rx.createImageData(fr.w, fr.h);
      for (let i = 0; i < fr.w * fr.h; i++) if (fr.region.mask[i]) { id.data[i * 4] = 60; id.data[i * 4 + 1] = 200; id.data[i * 4 + 2] = 90; id.data[i * 4 + 3] = 70; }
      rx.putImageData(id, 0, 0); x.drawImage(rc, 0, 0, cv.width, cv.height);
      if (fr.region.line) { x.strokeStyle = 'rgba(40,150,70,.8)'; x.setLineDash([4, 4]); x.lineWidth = 1.5; x.beginPath();
        fr.region.line.pts.forEach((p, i) => i ? x.lineTo(p.x * k, p.y * k) : x.moveTo(p.x * k, p.y * k)); x.stroke(); x.setLineDash([]); }
    } else if (showBox && !fr.region) { x.setLineDash([5, 4]); x.strokeStyle = '#d2702c'; x.lineWidth = 2; x.strokeRect(fr.w * 0.15 * k, fr.h * 0.35 * k, fr.w * 0.7 * k, fr.h * 0.3 * k); x.setLineDash([]); }
    const ch = await chain(cfg, api, d.fontId);
    const pn = placeName(ch, sample, fr, { pad: (bg.namePad ?? 8) / 100, mode: bg.nameMode || 'auto' });
    x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#2b1b10'; x.lineWidth = Math.max(1, pn.nib * k);
    for (const s of pn.strokes) { x.beginPath(); x.moveTo(s[0][0] * k, s[0][1] * k); for (let i = 1; i < s.length; i++) x.lineTo(s[i][0] * k, s[i][1] * k); x.stroke(); }
    const ln = fr.region && fr.region.line;
    return { url: cv.toDataURL('image/png'), found: fr.found, shape: !ln ? 'rect' : ln.curved && ln.varies ? 'curved+varies' : ln.curved ? 'curved' : ln.varies ? 'varies' : 'rect' };
  })();
  cache.set(key, p);
  return p;
}
