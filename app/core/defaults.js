// Cấu hình mặc định (được gộp với config.json của người dùng)
const builtinFont = (id, name, fam, w, subs = ['latin', 'latin-ext', 'vietnamese']) => ({
  id, name, builtin: true,
  files: subs.map(s => `${fam}-${s}-${w}-normal.woff`),
});
const NO_VN = ['latin', 'latin-ext'];

module.exports = {
  tiktok: { username: '', signApiKey: '', autoConnect: false, autoReconnect: true },
  fonts: [
    builtinFont('great-vibes', 'Great Vibes (chữ ký)', 'great-vibes', 400),
    builtinFont('pinyon', 'Pinyon Script (thư pháp)', 'pinyon-script', 400),
    builtinFont('dancing', 'Dancing Script (viết tay)', 'dancing-script', 700),
    builtinFont('rye', 'Rye (miền Tây cổ)', 'rye', 400, NO_VN),
    builtinFont('abril', 'Abril Fatface (tiêu đề)', 'abril-fatface', 400, NO_VN),
    builtinFont('playfair', 'Playfair Display (cổ điển)', 'playfair-display', 700),
    builtinFont('cinzel', 'Cinzel Decorative (khắc)', 'cinzel-decorative', 700, NO_VN),
  ],
  backgrounds: [
    { id: 'tpl-seal', name: 'Con dấu tròn + băng rôn', type: 'template', template: 'seal', enabled: true },
    { id: 'tpl-frame', name: 'Khung nhãn cổ điển', type: 'template', template: 'frame', enabled: true },
    { id: 'tpl-script', name: 'Chữ ký hoa mỹ + nơ', type: 'template', template: 'script', enabled: true },
    { id: 'tpl-crest', name: 'Huy hiệu khiên', type: 'template', template: 'crest', enabled: true },
  ],
  writer: {
    maxSpeedup: 5,
    names: {
      enabled: true, sources: { join: true, chat: false, follow: false, share: false, like: false },
      fontId: 'great-vibes', sizeCm: 4.2, nibMm: 1.6, fill: 'hatch', speed: 0.35, maxSec: 7,
      maxChars: 18, display: 'nickname', dedupeMin: 30, maxQueue: 40, skipWhenDonors: false,
    },
    donors: {
      enabled: true, minDiamonds: 1, mergeSec: 6, fontId: 'great-vibes', decoFontId: 'playfair',
      badgeHeightCm: 34, aspect: 1.7, nibMm: 3, decoNibMm: 1.4, speed: 0.5, decoSpeed: 0.7, revealSpeed: 1.4, revealNibMm: 7,
      maxSec: 26, maxChars: 22, display: 'nickname', bgMode: 'random', bgFixed: 'tpl-seal',
      topText: 'THANK YOU', bottomText: '{gift} x{count}', smallText: 'EST. {year}', maxQueue: 30,
    },
    paper: { inkColor: '#140d07', feedSpeed: 0.12, pxPerM: 1600 },
  },
  video: {
    whenNone: 'hide', alwaysOnTop: true, fit: 'contain', volume: 1,
    categories: {
      idle:   { enabled: true, random: true, files: [] },
      greet:  { enabled: true, random: true, files: [] },
      thanks: { enabled: true, random: true, files: [] },
    },
    idle:   { afterSec: 25, gapSec: 45, loop: false },
    greet:  { cooldownSec: 40, chance: 100, minJoins: 1, interruptIdle: true },
    thanks: { cooldownSec: 8, chance: 100, minDiamonds: 1, interrupt: true },
  },
  display: {
    width: 540, height: 960, frameless: true, alwaysOnTop: false, renderScale: 1, bgColor: '#efe9df', bgImage: '',
    exposure: 1.0, floorShadow: 0.28, mouseCamera: true, donorZoom: true, donorHoldSec: 4, followPen: 60, cameras: {}, dragWindow: false,
  },
  update: { owner: 'koddrawer', repo: 'steampunk-writer-updates', branch: 'main', autoCheck: true, intervalMin: 30 },
  windows: {},
};
