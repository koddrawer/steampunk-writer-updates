// Mẫu logo cổ điển (vintage badge) dựng bằng nét vector để cánh tay robot vẽ thật từng đường.
// Toạ độ cục bộ: mét, gốc ở tâm logo, trục y hướng lên.
import { layoutText, textToStrokes, hatch } from './text.js';

const TAU = Math.PI * 2;

export const TEMPLATES = {
  seal:   'Con dấu tròn + băng rôn',
  frame:  'Khung nhãn cổ điển',
  script: 'Chữ ký hoa mỹ + nơ',
  crest:  'Huy hiệu khiên + vòng nguyệt quế',
};

// ---------------- hình cơ bản
const circle = (cx, cy, r, n) => {
  n = n || Math.max(24, Math.ceil(TAU * r / 0.004));
  const p = []; for (let i = 0; i <= n; i++) { const a = TAU * i / n; p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return p;
};
const arc = (cx, cy, r, a0, a1, n) => {
  n = n || Math.max(8, Math.ceil(Math.abs(a1 - a0) * r / 0.004));
  const p = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return p;
};
const line = (x0, y0, x1, y1) => [[x0, y0], [x1, y1]];
const close = p => [...p, p[0]];
function star(cx, cy, R, rot = Math.PI / 2) {
  const p = []; for (let i = 0; i < 10; i++) { const r = i % 2 ? R * 0.42 : R; const a = rot + i * Math.PI / 5; p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return close(p);
}
const diamond = (cx, cy, w, h) => close([[cx - w, cy], [cx, cy + h], [cx + w, cy], [cx, cy - h]]);
// xoắn ốc (curl) dùng cho hoa văn
function curl(cx, cy, r0, turns, a0, dir = 1) {
  const p = []; const n = Math.ceil(turns * 40);
  for (let i = 0; i <= n; i++) { const t = i / n; const a = a0 + dir * t * turns * TAU; const r = r0 * (1 - t * 0.85);
    p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return p;
}
// đường swash hình chữ S kết thúc bằng xoắn ốc
function swash(x0, y0, len, amp, dir = 1, flip = 1) {
  const p = []; const n = 40;
  for (let i = 0; i <= n; i++) { const t = i / n; p.push([x0 + dir * t * len, y0 + flip * amp * Math.sin(Math.PI * t) * (1 - 0.5 * t)]); }
  const [ex, ey] = p[p.length - 1]; const r = amp * 0.55;
  const c = curl(ex, ey + flip * r, r, 1.3, -flip * Math.PI / 2 + (dir < 0 ? 0 : 0), dir * flip);
  return p.concat(c.slice(1));
}
function leaf(cx, cy, len, w, ang) {
  const p = []; const n = 14; const ca = Math.cos(ang), sa = Math.sin(ang);
  for (let i = 0; i <= n; i++) { const t = i / n * TAU; const x = Math.cos(t) * len / 2, y = Math.sin(t) * w / 2 * (1 - 0.3 * Math.cos(t));
    p.push([cx + x * ca - y * sa, cy + x * sa + y * ca]); }
  return p;
}
function inPoly(pt, poly) {
  let c = false; const [x, y] = pt;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
// cắt nét nằm dưới vùng che (ví dụ đường tròn chạy sau băng rôn)
function clip(strokes, masks) {
  if (!masks.length) return strokes;
  const out = [];
  for (const s of strokes) {
    let run = [];
    for (const p of densify(s, 0.003)) {
      if (masks.some(m => inPoly(p, m))) { if (run.length > 1) out.push(run); run = []; } else run.push(p);
    }
    if (run.length > 1) out.push(run);
  }
  return out;
}
function densify(s, step) {
  const out = [s[0]];
  for (let i = 1; i < s.length; i++) {
    const [x0, y0] = s[i - 1], [x1, y1] = s[i]; const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let k = 1; k <= n; k++) out.push([x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n]);
  }
  return out;
}

// ---------------- chữ
function fitEm(chain, text, maxW, maxCap) {
  const t = layoutText(chain, text, 1);
  const byW = t.width > 0 ? maxW / t.width : 10;
  const byH = maxCap / (t.capHeight || 0.7);
  return Math.min(byW, byH);
}
function textCentered(chain, text, em, cx, cy, nib, fill = 'hatch') {
  if (!text) return [];
  const L = layoutText(chain, text, em);
  const bb = L.bbox; const ox = cx - (bb.x0 + bb.x1) / 2; const oy = cy - L.capHeight / 2;
  return textToStrokes(L, { nib, fill, place: ([x, y]) => [x + ox, y + oy] });
}
function textOnArc(chain, text, em, cx, cy, r, top, nib) {
  if (!text) return [];
  const L = layoutText(chain, text, em, em * 0.08);
  const W = L.width; const out = [];
  for (const g of L.glyphs) {
    const xm = (g.x0 + g.x1) / 2;
    const th = top ? Math.PI / 2 - (xm - W / 2) / r : -Math.PI / 2 + (xm - W / 2) / r;
    const rot = top ? th - Math.PI / 2 : th + Math.PI / 2;
    const c = Math.cos(rot), s = Math.sin(rot); const bx = cx + Math.cos(th) * r, by = cy + Math.sin(th) * r;
    const place = ([x, y]) => { const lx = x - xm, ly = top ? y : y - L.capHeight; return [bx + lx * c - ly * s, by + lx * s + ly * c]; };
    out.push(...textToStrokes({ glyphs: [g] }, { nib, fill: 'hatch', place }));
  }
  return out;
}

// băng rôn cong (ribbon) – trả về {outline, poly, strokes}
function ribbon(cx, cy, bw, bh, sag, tail = 0.05, drop = 0.02) {
  const n = 40; const top = [], bot = [];
  for (let i = 0; i <= n; i++) { const t = i / n; const x = cx - bw / 2 + bw * t; const dy = sag * Math.sin(Math.PI * t);
    top.push([x, cy + bh / 2 + dy]); bot.push([x, cy - bh / 2 + dy]); }
  const poly = close([...top, ...bot.slice().reverse()]);
  const strokes = [poly];
  for (const side of [-1, 1]) {
    const ex = cx + side * bw / 2; const yT = cy + bh / 2 - drop, yB = cy - bh / 2 - drop;
    const ox = ex + side * tail;
    const t = [[ex - side * 0.012, yT], [ox, yT], [ox - side * tail * 0.35, (yT + yB) / 2], [ox, yB], [ex - side * 0.012, yB]];
    strokes.push(clipSide(t, poly));
    strokes.push(line(ex - side * 0.012, yB, ex, cy - bh / 2));       // nếp gấp
  }
  return { poly, strokes };
}
const clipSide = (pts) => pts;

// ---------------- các mẫu
export function buildBadge(tpl, o) {
  const { W, H, chains, name, top, bottom, small, nibName, nibDeco } = o;
  const S = H / 0.36;
  const deco = [];       // nét trang trí (bút nhỏ)
  const names = [];      // nét tên (bút lớn)
  const add = (arr, ...ss) => ss.forEach(s => s && s.length > 1 && arr.push(s));
  const decoChain = chains.deco, nameChain = chains.name;
  const masks = [];

  if (tpl === 'seal') {
    const R = 0.17 * S;
    let em = fitEm(nameChain, name, W - 0.09 * S, 0.06 * S);
    const nameW = layoutText(nameChain, name, em).width;
    const bw = Math.min(W - 0.02, Math.max(nameW + 0.09 * S, 2 * R + 0.06 * S)), bh = 0.09 * S;
    const rb = ribbon(0, -0.005 * S, bw - 0.1 * S, bh, 0.012 * S, 0.05 * S, 0.022 * S);
    masks.push(rb.poly);
    const ring = [circle(0, 0, R), circle(0, 0, R - 0.006 * S), circle(0, 0, R - 0.044 * S), circle(0, 0, R - 0.05 * S)];
    add(deco, ...clip(ring, masks));
    for (let i = 0; i < 36; i++) { const a = TAU * i / 36; add(deco, ...clip([circle(Math.cos(a) * (R + 0.011 * S), Math.sin(a) * (R + 0.011 * S), 0.0022 * S, 8)], masks)); }
    add(deco, ...rb.strokes);
    add(deco, ...textOnArc(decoChain, (top || '').toUpperCase(), 0.03 * S, 0, 0, R - 0.035 * S, true, nibDeco));
    add(deco, ...textOnArc(decoChain, (bottom || '').toUpperCase(), 0.026 * S, 0, 0, R - 0.013 * S, false, nibDeco));
    for (const x of [-0.035, 0, 0.035]) add(deco, ...hatchFill(star(x * S, 0.085 * S + (x === 0 ? 0.008 * S : 0), 0.011 * S), nibDeco));
    add(deco, ...textCentered(decoChain, small, 0.024 * S, 0, -0.085 * S, nibDeco));
    add(deco, line(-0.06 * S, -0.108 * S, 0.06 * S, -0.108 * S));
    add(names, ...textCentered(nameChain, name, em, 0, -0.005 * S + 0.012 * S * 0.6, nibName));
  }

  else if (tpl === 'frame') {
    const w = W / 2, h = H / 2, c = 0.035 * S;
    const notch = (inset) => {
      const p = []; const r = c - inset * 0.5; const X = w - inset, Y = h - inset;
      // góc khuyết lõm hình 1/4 tròn (kiểu nhãn cổ điển)
      const corners = [[X, Y, 1.5 * Math.PI, Math.PI], [-X, Y, 0, -0.5 * Math.PI], [-X, -Y, 0.5 * Math.PI, 0], [X, -Y, Math.PI, 0.5 * Math.PI]];
      for (const [cx, cy, a0, a1] of corners) p.push(...arc(cx, cy, r, a0, a1));
      return close(p);
    };
    add(deco, notch(0), notch(0.008 * S), notch(0.018 * S));
    // hoa văn 4 góc
    for (const [sx, sy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
      add(deco, curl(sx * (w - 0.06 * S), sy * (h - 0.06 * S), 0.016 * S, 1.4, sy > 0 ? 0 : Math.PI, sx * sy));
    }
    add(deco, ...textCentered(decoChain, (small || '').toUpperCase(), 0.026 * S, 0, h - 0.058 * S, nibDeco));
    add(deco, line(-w + 0.07 * S, h - 0.088 * S, -0.03 * S, h - 0.088 * S), line(0.03 * S, h - 0.088 * S, w - 0.07 * S, h - 0.088 * S),
        ...hatchFill(diamond(0, h - 0.088 * S, 0.012 * S, 0.008 * S), nibDeco));
    const em = fitEm(nameChain, name, W - 0.12 * S, 0.11 * S);
    add(names, ...textCentered(nameChain, name, em, 0, 0.005 * S, nibName));
    const yb = -h + 0.088 * S;
    add(deco, line(-w + 0.07 * S, yb, -0.03 * S, yb), line(0.03 * S, yb, w - 0.07 * S, yb), ...hatchFill(diamond(0, yb, 0.012 * S, 0.008 * S), nibDeco));
    add(deco, ...textCentered(decoChain, (bottom || '').toUpperCase(), 0.026 * S, 0, -h + 0.048 * S, nibDeco));
    add(deco, ...textCentered(decoChain, (top || '').toUpperCase(), 0.022 * S, 0, h - 0.118 * S, nibDeco));
  }

  else if (tpl === 'script') {
    const em = fitEm(nameChain, name, W - 0.06 * S, 0.12 * S);
    const L = layoutText(nameChain, name, em);
    add(names, ...textCentered(nameChain, name, em, 0, 0.012 * S, nibName));
    const tt = (top || '').toUpperCase();
    const tl = layoutText(decoChain, tt, 0.026 * S, 0.004 * S).width;
    add(deco, ...textCentered(decoChain, tt, 0.026 * S, 0, H / 2 - 0.04 * S, nibDeco));
    const len = Math.max(0.05 * S, (W - tl) / 2 - 0.04 * S);
    add(deco, swash(-tl / 2 - 0.015 * S, H / 2 - 0.04 * S, len, 0.02 * S, -1, 1), swash(tl / 2 + 0.015 * S, H / 2 - 0.04 * S, len, 0.02 * S, 1, 1));
    // gạch chân hoa mỹ dưới tên
    const uw = Math.min(W - 0.04 * S, L.width * 1.05) / 2; const uy = -0.065 * S;
    const u = []; for (let i = 0; i <= 60; i++) { const t = i / 60; u.push([-uw + 2 * uw * t, uy + 0.012 * S * Math.sin(TAU * t)]); }
    add(deco, u, curl(-uw, uy + 0.012 * S, 0.012 * S, 1.2, -Math.PI / 2, 1), curl(uw, uy - 0.012 * S, 0.012 * S, 1.2, Math.PI / 2, 1));
    const bt = (bottom || '').toUpperCase();
    const bwid = layoutText(decoChain, bt, 0.024 * S, 0.003 * S).width + 0.07 * S;
    const rb = ribbon(0, -H / 2 + 0.05 * S, bwid, 0.05 * S, -0.008 * S, 0.035 * S, 0.014 * S);
    add(deco, ...rb.strokes);
    add(deco, ...textCentered(decoChain, bt, 0.024 * S, 0, -H / 2 + 0.046 * S, nibDeco));
    add(deco, ...textCentered(decoChain, small, 0.018 * S, 0, -0.105 * S, nibDeco));
  }

  else { // crest
    const sw = 0.24 * S, sTop = 0.11 * S, sBot = -0.17 * S;
    const shield = [];
    for (let i = 0; i <= 20; i++) { const t = i / 20; shield.push([-sw / 2 + sw * t, sTop + 0.012 * S * Math.sin(Math.PI * t)]); }
    for (let i = 0; i <= 24; i++) { const t = i / 24; shield.push([sw / 2 * Math.cos(t * Math.PI / 2) ** 0.8, sTop - (sTop - sBot) * Math.sin(t * Math.PI / 2)]); }
    for (let i = 24; i >= 0; i--) { const t = i / 24; shield.push([-sw / 2 * Math.cos(t * Math.PI / 2) ** 0.8, sTop - (sTop - sBot) * Math.sin(t * Math.PI / 2)]); }
    shield.push(shield[0]);
    const inner = shield.map(([x, y]) => [x * 0.93, (y - (sTop + sBot) / 2) * 0.93 + (sTop + sBot) / 2]);
    let em = fitEm(nameChain, name, W - 0.1 * S, 0.06 * S);
    const nameW = layoutText(nameChain, name, em).width;
    const rb = ribbon(0, -0.01 * S, Math.min(W - 0.12 * S, Math.max(nameW + 0.06 * S, sw + 0.08 * S)), 0.085 * S, 0.012 * S, 0.045 * S, 0.02 * S);
    masks.push(rb.poly);
    add(deco, ...clip([shield, inner], masks), ...rb.strokes);
    // vòng nguyệt quế hai bên
    for (const side of [-1, 1]) {
      const cx = 0, cy = -0.02 * S, r = 0.16 * S;
      const stem = arc(cx, cy, r, side > 0 ? -1.35 : Math.PI + 1.35, side > 0 ? 0.55 : Math.PI - 0.55);
      add(deco, ...clip([stem], [...masks, shield]));
      for (let k = 0; k < 9; k++) {
        const a = side > 0 ? -1.3 + k * 0.2 : Math.PI + 1.3 - k * 0.2;
        const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r; const tang = a + side * Math.PI / 2;
        for (const off of [-1, 1]) add(deco, ...clip([leaf(px + Math.cos(a) * off * 0.011 * S, py + Math.sin(a) * off * 0.011 * S, 0.024 * S, 0.01 * S, tang + off * 0.5 * side)], [...masks, shield]));
      }
    }
    // băng cong phía trên chứa chữ
    const tr = 0.2 * S;
    const ac = [arc(0, -0.03 * S, tr + 0.048 * S, 0.62, Math.PI - 0.62), arc(0, -0.03 * S, tr, 0.62, Math.PI - 0.62)];
    add(deco, ...ac, line(...ac[0][0], ...ac[1][0]), line(...ac[0][ac[0].length - 1], ...ac[1][ac[1].length - 1]));
    add(deco, ...textOnArc(decoChain, (top || '').toUpperCase(), 0.028 * S, 0, -0.03 * S, tr + 0.012 * S, true, nibDeco));
    add(deco, ...textCentered(decoChain, (small || '').toUpperCase(), 0.02 * S, 0, 0.065 * S, nibDeco));
    add(deco, ...textCentered(decoChain, (bottom || '').toUpperCase(), 0.022 * S, 0, -0.1 * S, nibDeco));
    add(deco, ...hatchFill(star(0, -0.135 * S, 0.012 * S), nibDeco));
    add(names, ...textCentered(nameChain, name, em, 0, -0.01 * S + 0.007 * S, nibName));
  }
  return { deco, names };
}

function hatchFill(poly, nib) {
  return [...hatch([poly], nib * 0.8, 0.3), poly];
}
