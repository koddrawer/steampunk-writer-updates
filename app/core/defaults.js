// Cấu hình mặc định (được gộp với config.json của người dùng)
const builtinFont = (id, name, fam, w, subs = ['latin', 'latin-ext', 'vietnamese']) => ({
  id, name, builtin: true,
  files: subs.map(s => `${fam}-${s}-${w}-normal.woff`),
});
const NO_VN = ['latin', 'latin-ext'];

module.exports = {
  configVersion: 2,
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
      likeThreshold: 10,
      // nội dung viết kèm tên – mỗi dòng là một mẫu, chọn ngẫu nhiên. Mã: {name} {comment} {likes}
      templates: {
        join: '{name}',
        chat: '{name}',
        like: '{name} · {likes} tim',
        follow: '{name} đã theo dõi',
        share: '{name} đã chia sẻ',
      },
    },
    quotes: {
      enabled: true, afterSec: 20, gapSec: 6, interrupt: true, random: true,
      fontId: 'dancing', sizeCm: 6, authorSizeCm: 3.2, nibMm: 1.8, fill: 'hatch', speed: 0.4, maxSec: 40, widthPct: 84, divider: true,
      list: [
        'Có công mài sắt, có ngày nên kim — Tục ngữ',
        'Đi một ngày đàng, học một sàng khôn — Tục ngữ',
        'Uống nước nhớ nguồn — Tục ngữ',
        'Một cây làm chẳng nên non, ba cây chụm lại nên hòn núi cao — Ca dao',
        'Thất bại là mẹ thành công — Tục ngữ',
        'Lời nói chẳng mất tiền mua, lựa lời mà nói cho vừa lòng nhau — Ca dao',
        'Gần mực thì đen, gần đèn thì sáng — Tục ngữ',
        'Ăn quả nhớ kẻ trồng cây — Tục ngữ',
        'Nước chảy đá mòn — Tục ngữ',
        'Không có việc gì khó, chỉ sợ lòng không bền — Hồ Chí Minh',
        'Mỗi ngày là một trang giấy mới, hãy viết điều tốt đẹp lên đó',
        'Chậm mà chắc còn hơn nhanh mà sai',
        'Hạnh phúc không phải đích đến, mà là hành trình',
        'Hãy sống như những dòng mực: để lại dấu ấn đẹp',
        'Cảm ơn bạn đã ghé thăm, chúc bạn một ngày thật vui',
      ],
    },
    donors: {
      enabled: true, minDiamonds: 1, mergeSec: 6, fontId: 'great-vibes', decoFontId: 'playfair',
      badgeHeightCm: 34, aspect: 1.7, nibMm: 3, decoNibMm: 1.4, speed: 0.5, decoSpeed: 0.7, revealSpeed: 1.4, revealNibMm: 7,
      maxSec: 26, maxChars: 22, display: 'nickname', bgMode: 'random', bgFixed: 'tpl-seal',
      topText: 'THANK YOU', bottomText: '{gift} x{count}', smallText: 'EST. {year}', maxQueue: 30,
    },
    paper: { inkColor: '#140d07', feedSpeed: 0.12, pxPerM: 1600, tint: '#f3e6cc', grain: 1 },
  },
  video: {
    whenNone: 'hide', fit: 'contain', volume: 1, editFrame: false, boxBg: '#000000',
    categories: {
      idle:   { enabled: true, random: true, files: [] },
      greet:  { enabled: true, random: true, files: [] },
      thanks: { enabled: true, random: true, files: [] },
    },
    idle:   { afterSec: 15, gapSec: 0, loop: true },
    greet:  { cooldownSec: 40, chance: 100, minJoins: 1, interruptIdle: true },
    thanks: { cooldownSec: 8, chance: 100, minDiamonds: 1, interrupt: true },
  },
  display: {
    width: 540, height: 960, frameless: false, alwaysOnTop: false, renderScale: 1, bgColor: '#2a2018', bgImage: '',
    lighting: 'cinematic', keyLight: 1, bloom: 0.25, vignette: 0.6, table: true,
    exposure: 1.05, floorShadow: 0.28, mouseCamera: true, donorZoom: true, donorHoldSec: 4, followPen: 60, quoteCam: true, cameras: {}, dragWindow: false,
    videoBox: { x: 0.56, y: 0.04, w: 0.4, h: 0.3 },
  },
  update: { owner: 'koddrawer', repo: 'steampunk-writer-updates', branch: 'main', autoCheck: true, intervalMin: 30 },
  windows: {},
};
