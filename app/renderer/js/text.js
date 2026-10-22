// Font + hình học nét vẽ: đọc font (opentype), lấy viền glyph, sinh nét tô (hatch) như máy vẽ thật.
import opentype from '../lib/opentype.module.js';

const fontCache = new Map();          // url -> Promise<opentype.Font>

export function loadFontFile(url) {
  if (!fontCache.has(url)) {
    fontCache.set(url, fetch(url).then(r => {
      if (!r.ok) throw new Error('Không tải được font ' + url);
      return r.arrayBuffer();
    }).then(buf => opentype.parse(buf)).catch(e => { console.warn(e); fontCache.delete(url); return null; }));
  }
  return fontCache.get(url);
}

// Chuỗi font: [font chính..., font dự phòng...]. Mỗi ký tự lấy từ font đầu tiên có glyph.
export async function loadChain(urls) {
  const fonts = (await Promise.all(urls.map(loadFontFile))).filter(Boolean);
  return fonts;
}

function pickFont(chain, ch) {
  for (const f of chain) {
    const g = f.charToGlyph(ch);
    if (g && g.index > 0) return [f, g];
  }
  return [null, null];
}

export function hasRenderable(chain, text) {
  for (const ch of text) if (ch.trim() && pickFont(chain, ch)[0]) return true;
  return false;
}

// Lọc ký tự không vẽ được (emoji...), gộp khoảng trắng
export function sanitize(chain, text, maxChars = 40) {
  let out = '';
  for (const ch of (text || '').normalize('NFC')) {
    if (ch === ' ' || pickFont(chain, ch)[0]) out += ch;
  }
  out = out.replace(/\s+/g, ' ').trim();
  if ([...out].length > maxChars) out = [...out].slice(0, maxChars).join('').trim();
  return out;
}

// ---------- làm phẳng đường cong
function flattenCommands(cmds, tol) {
  const contours = []; let cur = null; let px = 0, py = 0, sx = 0, sy = 0;
  const push = (x, y) => cur.push([x, y]);
  for (const c of cmds) {
    if (c.type === 'M') { if (cur && cur.length > 1) contours.push(cur); cur = [[c.x, c.y]]; px = sx = c.x; py = sy = c.y; }
    else if (c.type === 'L') { push(c.x, c.y); px = c.x; py = c.y; }
    else if (c.type === 'Q') {
      const n = Math.max(2, Math.ceil(Math.hypot(c.x - px, c.y - py) / tol));
      for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t;
        push(u * u * px + 2 * u * t * c.x1 + t * t * c.x, u * u * py + 2 * u * t * c.y1 + t * t * c.y); }
      px = c.x; py = c.y;
    } else if (c.type === 'C') {
      const L = Math.hypot(c.x1 - px, c.y1 - py) + Math.hypot(c.x2 - c.x1, c.y2 - c.y1) + Math.hypot(c.x - c.x2, c.y - c.y2);
      const n = Math.max(3, Math.ceil(L / tol));
      for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t;
        push(u*u*u*px + 3*u*u*t*c.x1 + 3*u*t*t*c.x2 + t*t*t*c.x, u*u*u*py + 3*u*u*t*c.y1 + 3*u*t*t*c.y2 + t*t*t*c.y); }
      px = c.x; py = c.y;
    } else if (c.type === 'Z') { if (cur) { push(sx, sy); contours.push(cur); cur = null; } }
  }
  if (cur && cur.length > 1) contours.push(cur);
  return contours;
}

/**
 * Dàn chữ: trả về danh sách glyph {contours:[[[x,y]...]...], x0, x1} đơn vị mét, trục y hướng LÊN, gốc = baseline trái.
 * em = cỡ em (mét).
 */
export function layoutText(chain, text, em, letterSpacing = 0) {
  const glyphs = []; let x = 0; let prev = null; let prevFont = null;
  const tol = Math.max(em * 0.012, 0.0004);
  for (const ch of text) {
    if (ch === ' ') { const f = chain[0]; x += (f ? f.charToGlyph(' ').advanceWidth / f.unitsPerEm : 0.28) * em + letterSpacing; prev = null; continue; }
    const [f, g] = pickFont(chain, ch);
    if (!f) continue;
    const scale = em / f.unitsPerEm;
    if (prev && prevFont === f) x += f.getKerningValue(prev, g) * scale;
    const path = g.getPath(0, 0, em);                     // y xuống
    const contours = flattenCommands(path.commands, tol).map(c => c.map(([px, py]) => [px + x, -py]));
    const adv = g.advanceWidth * scale;
    glyphs.push({ contours, x0: x, x1: x + adv, ch });
    x += adv + letterSpacing; prev = g; prevFont = f;
  }
  const f0 = chain[0];
  const capRatio = f0 && f0.tables.os2 && f0.tables.os2.sCapHeight ? f0.tables.os2.sCapHeight / f0.unitsPerEm : 0.7;
  return { glyphs, width: x, em, capHeight: capRatio * em, bbox: bboxOf(glyphs.flatMap(g => g.contours)) };
}

export function bboxOf(contours) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const ct of contours) for (const [x, y] of ct) { if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; }
  return a === Infinity ? { x0: 0, y0: 0, x1: 0, y1: 0 } : { x0: a, y0: b, x1: c, y1: d };
}

/**
 * Sinh nét tô (hatch) bên trong đa giác (even-odd), xếp thành chuỗi zigzag liền mạch theo từng vùng nét.
 * Trả về mảng polyline. spacing = khoảng cách giữa các đường quét, angle = góc quét (rad).
 */
export function hatch(contours, spacing, angle = 0) {
  const ca = Math.cos(-angle), sa = Math.sin(-angle);
  const rot = contours.map(c => c.map(([x, y]) => [x * ca - y * sa, x * sa + y * ca]));
  const bb = bboxOf(rot);
  const lines = [];
  for (let y = bb.y0 + spacing * 0.5; y < bb.y1; y += spacing) {
    const xs = [];
    for (const c of rot) for (let i = 0; i < c.length - 1; i++) {
      const [x1, y1] = c[i], [x2, y2] = c[i + 1];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xs.push(x1 + (y - y1) / (y2 - y1) * (x2 - x1));
    }
    xs.sort((p, q) => p - q);
    const spans = [];
    for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > spacing * 0.15) spans.push({ a: xs[i], b: xs[i + 1], y, used: false });
    lines.push(spans);
  }
  // nối span chồng lấn giữa các dòng liền kề thành chuỗi zigzag
  const chains = [];
  for (let li = 0; li < lines.length; li++) {
    for (const s0 of lines[li]) {
      if (s0.used) continue;
      let s = s0, dir = 1, k = li; const pts = [];
      while (s) {
        s.used = true;
        if (dir > 0) { pts.push([s.a, s.y], [s.b, s.y]); } else { pts.push([s.b, s.y], [s.a, s.y]); }
        dir = -dir; k++;
        const nxt = lines[k];
        if (!nxt) break;
        const endX = pts[pts.length - 1][0];
        let best = null, bd = Infinity;
        for (const c of nxt) {
          if (c.used || c.b < s.a || c.a > s.b) continue;     // phải chồng lấn
          const d = Math.abs((dir > 0 ? c.a : c.b) - endX);
          if (d < bd) { bd = d; best = c; }
        }
        s = best;
      }
      const ic = Math.cos(angle), is = Math.sin(angle);
      chains.push(pts.map(([x, y]) => [x * ic - y * is, x * is + y * ic]));
    }
  }
  return chains;
}

// Đơn giản hoá polyline: bỏ điểm quá gần nhau
export function simplify(pts, minD) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const l = out[out.length - 1];
    if (Math.hypot(pts[i][0] - l[0], pts[i][1] - l[1]) >= minD) out.push(pts[i]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/**
 * Chuyển chữ đã dàn thành nét vẽ cho bút (theo thứ tự từng chữ cái: tô trước, viền sau).
 * place: (x,y) -> [X,Y] biến đổi sang toạ độ đích.
 */
// Góc quét tô mặc định: gần thẳng đứng, hơi nghiêng theo chữ -> ngòi bút quét lần lượt từ TRÁI sang PHẢI
export const LTR_HATCH = -(Math.PI / 2 - 0.22);

// đưa điểm bắt đầu của đường viền khép kín về điểm trái nhất
function startLeft(c) {
  const closed = c.length > 2 && Math.hypot(c[0][0] - c[c.length - 1][0], c[0][1] - c[c.length - 1][1]) < 1e-6;
  if (!closed) return c[0][0] <= c[c.length - 1][0] ? c : c.slice().reverse();
  let k = 0; for (let i = 1; i < c.length - 1; i++) if (c[i][0] < c[k][0]) k = i;
  const body = c.slice(0, -1); const r = body.slice(k).concat(body.slice(0, k)); r.push(r[0]); return r;
}
const minX = (c) => c.reduce((m, p) => Math.min(m, p[0]), Infinity);

/**
 * Chuyển chữ đã dàn thành nét vẽ cho bút, đi lần lượt từ trái sang phải:
 * từng chữ cái theo thứ tự, trong mỗi chữ tô (quét trái->phải) rồi viền (viền trái trước).
 * place: (x,y) -> [X,Y] biến đổi sang toạ độ đích.
 */
export function textToStrokes(layout, { nib, fill = 'hatch', hatchAngle = LTR_HATCH, place }) {
  const strokes = [];
  const sp = nib * 0.8;
  for (const g of layout.glyphs) {
    const cs = g.contours.map(c => simplify(c, nib * 0.25));
    if (fill === 'hatch') for (const h of hatch(cs, sp, hatchAngle)) strokes.push(h.map(p => place(p)));
    for (const c of cs.slice().sort((a, b) => minX(a) - minX(b))) strokes.push(startLeft(c).map(p => place(p)));
  }
  return strokes;
}

// sắp nét theo thứ tự trái -> phải (dùng cho nét trang trí của logo)
export function sortLTR(strokes) {
  return strokes.map(startLeft).sort((a, b) => minX(a) - minX(b));
}

// Ngắt dòng theo bề rộng tối đa (mét) – trả về mảng dòng
export function wrapText(chain, text, em, maxW) {
  const words = text.split(/\s+/).filter(Boolean); const lines = []; let cur = '';
  const w = (t) => layoutText(chain, t, em).width;
  for (const wd of words) {
    const t = cur ? cur + ' ' + wd : wd;
    if (!cur || w(t) <= maxW) cur = t;
    else { lines.push(cur); cur = wd; }
  }
  if (cur) lines.push(cur);
  return lines;
}

export function strokesLength(strokes) {
  let L = 0, travel = 0, last = null;
  for (const s of strokes) {
    if (last) travel += Math.hypot(s[0][0] - last[0], s[0][1] - last[1]);
    for (let i = 1; i < s.length; i++) L += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
    last = s[s.length - 1];
  }
  return { draw: L, travel, count: strokes.length };
}
