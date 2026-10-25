// Cấu hình mặc định (được gộp với config.json của người dùng)
const builtinFont = (id, name, fam, w, subs = ['latin', 'latin-ext', 'vietnamese']) => ({
  id, name, builtin: true,
  files: subs.map(s => `${fam}-${s}-${w}-normal.woff`),
});
const NO_VN = ['latin', 'latin-ext'];

module.exports = {
  configVersion: 4,
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
    { id: 'tpl-ticket', name: 'Nhãn vé góc vát', type: 'template', template: 'ticket', enabled: true },
    { id: 'tpl-arch', name: 'Chữ vòm + vương miện', type: 'template', template: 'arch', enabled: true },
    { id: 'tpl-emblem', name: 'Tên lớn + huy hiệu chữ lồng', type: 'template', template: 'emblem', enabled: true },
    { id: 'tpl-monogram', name: 'Chữ ký + dấu chữ lồng', type: 'template', template: 'monogram', enabled: true },
    { id: 'tpl-roundel', name: 'Con dấu tròn chữ quanh vành', type: 'template', template: 'roundel', enabled: true },
    { id: 'tpl-wave', name: 'Dải lụa uốn sóng + lá acanthus', type: 'template', template: 'wave', enabled: true },
    { id: 'tpl-scroll', name: 'Cuộn giấy cổ hai đầu cuộn', type: 'template', template: 'scroll', enabled: true },
    { id: 'tpl-pennant', name: 'Băng rôn thẳng + viền hạt', type: 'template', template: 'pennant', enabled: true },
    { id: 'tpl-cartouche', name: 'Khung hoa văn + băng rôn vòm', type: 'template', template: 'cartouche', enabled: true },
    { id: 'tpl-medallion', name: 'Bảng ngang + huy chương', type: 'template', template: 'medallion', enabled: true },
    { id: 'tpl-heritage', name: 'Nhãn cổ điển vương miện', type: 'template', template: 'heritage', enabled: true },
  ],
  writer: {
    maxSpeedup: 5,
    names: {
      enabled: true, sources: { join: true, chat: false, follow: false, share: false, like: false },
      fontId: 'great-vibes', sizeCm: 4.2, nibMm: 1.6, fill: 'hatch', speed: 0.35, maxSec: 6,
      maxChars: 18, display: 'nickname', layout: 'center', dedupeMin: 30, maxQueue: 40, skipWhenDonors: false,
      likeThreshold: 10,
      // nội dung viết kèm tên – mỗi dòng là một mẫu, chọn ngẫu nhiên. Mã: {name} {comment} {likes}
      templates: {
        join: '{name}',
        chat: '{name}',
        like: '{name} · {likes} tim',
        follow: '{name} đã theo dõi',
        share: '{name} đã chia sẻ',
      },
      // viết nội dung bình luận
      comments: {
        enabled: false, format: 'name_comment', maxChars: 80, minChars: 2, cooldownSec: 20, maxSec: 8,
        blockWords: ['http', 'www.', '.com', 'zalo', 'sđt'],
      },
    },
    quotes: {
      enabled: true, afterSec: 20, gapSec: 6, interrupt: true, clearPrev: true, afterNameSec: 5, afterDonorSec: 8, random: true,
      fontId: 'dancing', sizeCm: 6, authorSizeCm: 3.2, nibMm: 1.8, fill: 'hatch', speed: 0.4, maxSec: 10, widthPct: 84, divider: true, clearFeedSpeed: 0.35,
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
      language: 'both',   // vi | en | both
      listEn: [
        'Well begun is half done — Aristotle',
        'The journey of a thousand miles begins with a single step — Lao Tzu',
        'Knowledge is power — Francis Bacon',
        'Fortune favors the bold — Virgil',
        'The pen is mightier than the sword — Edward Bulwer-Lytton',
        'Simplicity is the ultimate sophistication — Leonardo da Vinci',
        'What we think, we become — Buddha',
        'Do what you can, with what you have, where you are — Theodore Roosevelt',
        'Write it on your heart that every day is the best day in the year — Ralph Waldo Emerson',
        'Actions speak louder than words — Proverb',
        'Where there is a will, there is a way — Proverb',
        'Every cloud has a silver lining — Proverb',
        'Little by little, one travels far — Proverb',
        'All that glitters is not gold — William Shakespeare',
        'Be the reason someone smiles today',
        'Thank you for stopping by. Have a wonderful day!',
      ],
    },
    // tặng quà nhỏ (vd 1 xu) rồi bình luận ngay -> viết tên kèm nội dung bình luận; quá thời gian chờ thì viết tên + khung như thường
    giftComment: { enabled: true, minDiamonds: 1, maxDiamonds: 1, waitSec: 30, format: '{name}: {comment}', maxChars: 80 },
    // hiệu ứng ánh vàng khi viết xong
    glow: { enabled: true, sec: 1.8, color: '#ffc94a', strength: 1, types: { name: true, comment: true, donor: true, quote: false } },
    donors: {
      enabled: true, minDiamonds: 1, mergeSec: 6, fontId: 'great-vibes', decoFontId: 'playfair',
      badgeHeightCm: 34, aspect: 1.7, nibMm: 3, decoNibMm: 1.4, speed: 0.5, decoSpeed: 0.7, revealSpeed: 1.4, revealNibMm: 7,
      maxSec: 10, maxChars: 22, display: 'nickname', bgMode: 'tiers', bgFixed: 'tpl-seal',
      topText: 'THANK YOU', bottomText: '{gift} x{count}', smallText: 'EST. {year}', maxQueue: 30,
      // bậc donate theo tổng xu: mỗi bậc chọn logo riêng (nhiều logo thì lấy ngẫu nhiên)
      tiers: [
        { id: 'tier1', name: 'Bậc 1', min: 1, bgs: ['tpl-script'], enabled: true },
        { id: 'tier2', name: 'Bậc 2', min: 10, bgs: ['tpl-seal'], enabled: true },
        { id: 'tier3', name: 'Bậc 3', min: 100, bgs: ['tpl-frame'], enabled: true },
        { id: 'tier4', name: 'Bậc 4', min: 500, bgs: ['tpl-crest'], enabled: true },
      ],
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
    // tự cân cỡ nhân vật giữa các video + chuyển cảnh không nháy
    autoScale: true, charSize: 0, crossfadeMs: 220, fitData: {},
    greet:  { cooldownSec: 40, chance: 100, minJoins: 1, interruptIdle: true },
    thanks: { cooldownSec: 8, chance: 100, minDiamonds: 1, interrupt: true },
  },
  display: {
    width: 540, height: 960, frameless: false, alwaysOnTop: false, renderScale: 1, bgColor: '#2a2018', bgImage: '',
    lighting: 'cinematic', keyLight: 1, bloom: 0.25, vignette: 0.6, table: true,
    exposure: 1.05, floorShadow: 0.28, mouseCamera: true, donorZoom: true, donorHoldSec: 4, followPen: 100, followSpeed: 14, quoteCam: true, cameras: {}, dragWindow: false,
    videoBox: { x: 0.56, y: 0.04, w: 0.4, h: 0.3 },
  },
  music: { enabled: true, files: [], shuffle: true, volume: 0.35, crossfadeSec: 3, duck: true, duckPct: 25, duckCats: ['greet', 'thanks'] },
  update: { owner: 'koddrawer', repo: 'steampunk-writer-updates', branch: 'main', autoCheck: true, intervalMin: 30 },
  windows: {},
};
