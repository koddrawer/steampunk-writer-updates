// Ảnh xem trước của khung logo: dựng đúng các nét máy sẽ vẽ rồi vẽ lên canvas nhỏ.
import { buildBadge } from './badge.js';
import { loadChain } from './text.js';

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
