// Mẫu logo cổ điển (vintage badge) dựng bằng nét vector để cánh tay robot vẽ thật từng đường.
// Toạ độ cục bộ: mét, gốc ở tâm logo, trục y hướng lên.
import { layoutText, textToStrokes, hatch } from './text.js';

const TAU = Math.PI * 2;

export const TEMPLATES = {
  seal:   'Con dấu tròn + băng rôn',
  frame:  'Khung nhãn cổ điển',
  script: 'Chữ ký hoa mỹ + nơ',
  crest:  'Huy hiệu khiên + vòng nguyệt quế',
  ticket: 'Nhãn vé góc vát + tab chữ dưới',
  arch:   'Chữ vòm + vương miện hoa văn',
  emblem: 'Tên lớn + huy hiệu tròn chữ lồng',
  monogram: 'Chữ ký + phụ đề + dấu chữ lồng nhỏ',
  roundel: 'Con dấu tròn chữ quanh vành',
  wave:   'Dải lụa uốn sóng + lá acanthus',
  scroll: 'Cuộn giấy cổ hai đầu cuộn tròn',
  pennant: 'Băng rôn thẳng + đuôi gấp + viền hạt',
  cartouche: 'Khung hoa văn + băng rôn vòm',
  medallion: 'Bảng ngang + huy chương chữ cái',
  heritage: 'Nhãn cổ điển vương miện + vòm đáy',
};

// ---------- chữ chạy theo một đường cong y = f(x) (dải lụa uốn sóng)
function textOnWave(chain, text, em, f, nib, yOff = 0) {
  if (!text) return [];
  const L = layoutText(chain, text, em); const W0 = L.width; const out = [];
  for (const g of L.glyphs) {
    const xm = (g.x0 + g.x1) / 2 - W0 / 2;
    const y0 = f(xm), sl = (f(xm + 0.002) - f(xm - 0.002)) / 0.004, a = Math.atan(sl) * 0.85;
    const c = Math.cos(a), s2 = Math.sin(a);
    const place = ([x, y]) => { const lx = x - (g.x0 + g.x1) / 2, ly = y - L.capHeight / 2 + yOff; return [xm + lx * c - ly * s2, y0 + lx * s2 + ly * c]; };
    out.push(...textToStrokes({ glyphs: [g] }, { nib, fill: 'hatch', place }));
  }
  return out;
}
// lá acanthus: thân cong xoắn ốc, các phiến lá thon mọc về phía ngoài, nhỏ dần về đầu xoắn
function acanthus(x, y, size, dir = 1, rot = 0, flip = 1) {
  const out = []; const path = []; const N = 40;
  for (let i = 0; i <= N; i++) {
    const t = i / N; const a = rot + flip * t * 3.2; const r = size * (0.15 + 0.85 * t) * (1 - t * 0.55);
    path.push([x + dir * Math.cos(a) * r, y + Math.sin(a) * r]);
  }
  out.push(path);
  for (let k = 0; k < 5; k++) {
    const i = 6 + k * 7; if (i >= N) break;
    const [px, py] = path[i]; const [qx, qy] = path[i + 1];
    const tang = Math.atan2(qy - py, qx - px);
    const len = size * (0.62 - k * 0.09), wid = len * 0.3;
    const a = tang - flip * dir * 0.75;                        // mọc ra phía ngoài vòng xoắn
    const lp = [];
    for (let j = 0; j <= 14; j++) { const t = j / 14, w = Math.sin(Math.PI * Math.pow(t, 0.8)) * wid * (1 - 0.3 * t);
      lp.push([px + Math.cos(a) * len * t + Math.cos(a + Math.PI / 2) * w, py + Math.sin(a) * len * t + Math.sin(a + Math.PI / 2) * w]); }
    const tipCurl = curl(lp[14][0], lp[14][1], wid * 0.35, 0.7, a + Math.PI / 2, flip);
    for (let j = 14; j >= 0; j--) { const t = j / 14, w = Math.sin(Math.PI * Math.pow(t, 0.8)) * wid * 0.45;
      lp.push([px + Math.cos(a) * len * t - Math.cos(a + Math.PI / 2) * w, py + Math.sin(a) * len * t - Math.sin(a + Math.PI / 2) * w]); }
    out.push(lp, tipCurl);
    out.push([[px, py], [px + Math.cos(a) * len * 0.75, py + Math.sin(a) * len * 0.75]]);   // gân lá
  }
  out.push(curl(path[N][0], path[N][1], size * 0.1, 1.2, rot + 3.2 * flip, dir * flip));
  return out;
}
function dotsAlong(pts, step, r) {
  const out = []; let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; const d = Math.hypot(x1 - x0, y1 - y0);
    for (let t = step - acc; t <= d; t += step) out.push(circle(x0 + (x1 - x0) * t / d, y0 + (y1 - y0) * t / d, r, 8));
    acc = (acc + d) % step;
  }
  return out;
}
// đầu cuộn của dải giấy: xoắn ốc + hai mép
function rollEnd(cx, cy, r, dir) {
  return [curl(cx, cy, r, 1.6, dir > 0 ? Math.PI / 2 : Math.PI / 2, -dir), circle(cx, cy, r * 1.02)];
}

// chữ lồng: chữ cái đầu của từ đầu và từ cuối
function initials(name) {
  const w = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '';
  const a = [...w[0]][0] || '', b = w.length > 1 ? ([...w[w.length - 1]][0] || '') : '';
  return (a + b).toLocaleUpperCase('vi');
}
// hoa văn đối xứng hai bên (vương miện / gạch chân)
function filigree(cx, cy, span, amp, up = 1) {
  const out = [];
  for (const d of [-1, 1]) {
    out.push(swash(cx + d * 0.012, cy, span, amp, d, up));
    out.push(swash(cx + d * 0.01, cy, span * 0.55, amp * 0.6, d, -up));
  }
  return out;
}
function chamferRect(w, h, c, notch) {
  const p = [[-w + c, h], [w - c, h], [w, h - c]];
  if (notch) p.push([w, notch], ...arc(w, 0, notch, Math.PI / 2, Math.PI * 1.5).slice(1, -1), [w, -notch]);
  p.push([w, -h + c], [w - c, -h], [-w + c, -h], [-w, -h + c]);
  if (notch) p.push([-w, -notch], ...arc(-w, 0, notch, -Math.PI / 2, Math.PI / 2).slice(1, -1), [-w, notch]);
  p.push([-w, h - c]);
  return close(p);
}
const scaleP = (poly, sx, sy) => poly.map(([x, y]) => [x * sx, y * sy]);
function roundRect(cx, cy, w, h, r) {
  const p = [];
  for (const [x, y, a0] of [[cx + w / 2 - r, cy + h / 2 - r, 0], [cx - w / 2 + r, cy + h / 2 - r, Math.PI / 2], [cx - w / 2 + r, cy - h / 2 + r, Math.PI], [cx + w / 2 - r, cy - h / 2 + r, Math.PI * 1.5]])
    p.push(...arc(x, y, r, a0, a0 + Math.PI / 2, 8));
  return close(p);
}

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
function textOnArc(chain, text, em, cx, cy, r, top, nib, ls = 0.08) {
  if (!text) return [];
  const L = layoutText(chain, text, em, em * ls);
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

  else if (tpl === 'ticket') {
    // nhãn hình vé: góc vát, khuyết tròn hai bên, viền đôi, tab chữ ở mép dưới
    const w = W / 2, h = H / 2, c = 0.035 * S, nt = 0.03 * S;
    const bt = (bottom || '').toUpperCase();
    const bw = layoutText(decoChain, bt, 0.022 * S, 0.003 * S).width + 0.06 * S;
    const tab = roundRect(0, -h, Math.max(0.12 * S, bw), 0.05 * S, 0.018 * S);
    masks.push(tab);
    const outer = chamferRect(w, h, c, nt), inner = scaleP(chamferRect(w, h, c, nt), 1 - 0.014 * S / w, 1 - 0.014 * S / h);
    add(deco, ...clip([outer, inner], masks), tab);
    add(deco, ...textCentered(decoChain, bt, 0.022 * S, 0, -h - 0.002 * S, nibDeco));
    const tt = (top || '').toUpperCase(); const tl = layoutText(decoChain, tt, 0.024 * S, 0.003 * S).width;
    const ty = h - 0.06 * S;
    add(deco, ...textCentered(decoChain, tt, 0.024 * S, 0, ty, nibDeco));
    for (const d of [-1, 1]) {
      add(deco, line(d * (tl / 2 + 0.015 * S), ty, d * (w - 0.07 * S), ty));
      add(deco, ...hatchFill(diamond(d * (w - 0.06 * S), ty, 0.007 * S, 0.006 * S), nibDeco));
    }
    for (const [sx, sy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) add(deco, ...hatchFill(star(sx * (w - 0.045 * S), sy * (h - 0.045 * S), 0.009 * S), nibDeco));
    const em = fitEm(nameChain, name, W - 0.16 * S, 0.1 * S);
    add(names, ...textCentered(nameChain, name, em, 0, 0.01 * S, nibName));
    const ly = -0.07 * S;
    add(deco, line(-w * 0.55, ly, -0.02 * S, ly), line(0.02 * S, ly, w * 0.55, ly), ...hatchFill(diamond(0, ly, 0.01 * S, 0.007 * S), nibDeco));
    add(deco, ...textCentered(decoChain, small, 0.02 * S, 0, -0.1 * S, nibDeco));
  }

  else if (tpl === 'arch') {
    // tên uốn vòm, vương miện hoa văn phía trên, dải chữ cong phía dưới
    const em = fitEm(nameChain, name, W * 0.8, 0.095 * S);
    const R = Math.max(W * 0.85, 0.35 * S), y0 = -0.01 * S;
    add(names, ...textOnArc(nameChain, name, em, 0, y0 - R, R, true, nibName, 0));
    const cap = layoutText(nameChain, name, em).capHeight;
    const tY = y0 + cap * 1.35 + 0.035 * S;
    const tt = (top || '').toUpperCase();
    add(deco, ...textCentered(decoChain, tt, 0.024 * S, 0, tY, nibDeco));
    add(deco, ...filigree(0, tY + 0.035 * S, 0.12 * S, 0.02 * S, 1));
    add(deco, ...hatchFill(diamond(0, tY + 0.05 * S, 0.008 * S, 0.012 * S), nibDeco));
    const sm = (small || '').toUpperCase(); const sl = layoutText(decoChain, sm, 0.02 * S, 0.003 * S).width; const sy = y0 - 0.045 * S;
    add(deco, ...textCentered(decoChain, sm, 0.02 * S, 0, sy, nibDeco));
    for (const d of [-1, 1]) add(deco, line(d * (sl / 2 + 0.015 * S), sy, d * W * 0.36, sy), line(d * (sl / 2 + 0.015 * S), sy - 0.006 * S, d * W * 0.3, sy - 0.006 * S));
    const Rb = 0.42 * S, yb = -H / 2 + 0.03 * S, cyb = yb + Rb, dl = (W * 0.32) / Rb;
    const a0 = -Math.PI / 2 - dl, a1 = -Math.PI / 2 + dl;
    const o1 = arc(0, cyb, Rb + 0.008 * S, a0, a1), o2 = arc(0, cyb, Rb - 0.042 * S, a0, a1);
    add(deco, o1, o2, line(...o1[0], ...o2[0]), line(...o1[o1.length - 1], ...o2[o2.length - 1]));
    add(deco, ...textOnArc(decoChain, (bottom || '').toUpperCase(), 0.022 * S, 0, cyb, Rb - 0.034 * S, false, nibDeco));
    for (const d of [-1, 1]) { const [ex, ey] = (d < 0 ? o1[0] : o1[o1.length - 1]); add(deco, curl(ex + d * 0.018 * S, ey + 0.012 * S, 0.012 * S, 1.2, d < 0 ? 0 : Math.PI, d)); }
  }

  else if (tpl === 'emblem') {
    // tên lớn phía trên, huy hiệu tròn có chữ lồng ở giữa phía dưới, chữ chạy quanh đáy huy hiệu
    const w = W / 2, h = H / 2;
    const tt = (top || '').toUpperCase(); const tl = layoutText(decoChain, tt, 0.022 * S, 0.003 * S).width; const ty = h - 0.03 * S;
    add(deco, ...textCentered(decoChain, tt, 0.022 * S, 0, ty, nibDeco));
    for (const d of [-1, 1]) add(deco, line(d * (tl / 2 + 0.015 * S), ty, d * w * 0.7, ty));
    const em = fitEm(nameChain, name, W - 0.06 * S, 0.1 * S);
    add(names, ...textCentered(nameChain, name, em, 0, h * 0.4, nibName));
    add(deco, ...textCentered(decoChain, small, 0.02 * S, 0, h * 0.08, nibDeco));
    const r = 0.075 * S, ecy = -h * 0.45;
    add(deco, circle(0, ecy, r), circle(0, ecy, r - 0.006 * S));
    const mono = initials(name);
    if (mono) add(deco, ...textCentered(decoChain, mono, fitEm(decoChain, mono, r * 1.25, r * 0.9), 0, ecy, nibDeco));
    add(deco, ...textOnArc(decoChain, (bottom || '').toUpperCase(), 0.02 * S, 0, ecy, r + 0.034 * S, false, nibDeco));
    for (const d of [-1, 1]) {
      add(deco, line(d * (r + 0.012 * S), ecy, d * (w - 0.04 * S), ecy), ...hatchFill(diamond(d * (w - 0.03 * S), ecy, 0.009 * S, 0.007 * S), nibDeco));
      add(deco, ...hatchFill(star(d * (r + 0.05 * S), ecy + 0.03 * S, 0.008 * S), nibDeco));
    }
  }

  else if (tpl === 'monogram') {
    // chữ ký lớn, phụ đề chữ in, dấu chữ lồng nhỏ phía dưới hai bên có chữ
    const w = W / 2, h = H / 2;
    add(deco, ...filigree(0, h - 0.04 * S, Math.min(w * 0.7, 0.2 * S), 0.022 * S, 1));
    const em = fitEm(nameChain, name, W - 0.06 * S, 0.11 * S);
    add(names, ...textCentered(nameChain, name, em, 0, 0.05 * S, nibName));
    const tt = (top || '').toUpperCase();
    add(deco, ...textCentered(decoChain, tt, 0.022 * S, 0, -0.045 * S, nibDeco));
    const r = 0.045 * S, mcy = -h + 0.065 * S;
    add(deco, circle(0, mcy, r), circle(0, mcy, r - 0.005 * S));
    const mono = initials(name);
    if (mono) add(deco, ...textCentered(decoChain, mono, fitEm(decoChain, mono, r * 1.2, r * 0.85), 0, mcy, nibDeco));
    for (const [d, t] of [[-1, (bottom || '').toUpperCase()], [1, (small || '').toUpperCase()]]) {
      const ew = fitEm(decoChain, t || 'X', 0.18 * S, 0.018 * S);
      add(deco, ...textCentered(decoChain, t, ew, d * (r + 0.11 * S), mcy, nibDeco));
      add(deco, line(d * (r + 0.008 * S), mcy + 0.022 * S, d * (r + 0.2 * S), mcy + 0.022 * S));
    }
  }

  else if (tpl === 'roundel') {
    // con dấu tròn: chữ chạy quanh vành trên và dưới, sao hai bên, tên giữa
    const R = 0.17 * S;
    add(deco, circle(0, 0, R), circle(0, 0, R - 0.006 * S), circle(0, 0, R - 0.05 * S), circle(0, 0, R - 0.057 * S));
    add(deco, ...textOnArc(decoChain, (top || '').toUpperCase(), 0.03 * S, 0, 0, R - 0.037 * S, true, nibDeco));
    add(deco, ...textOnArc(decoChain, (bottom || '').toUpperCase(), 0.026 * S, 0, 0, R - 0.046 * S, false, nibDeco));
    for (const d of [-1, 1]) add(deco, ...hatchFill(star(d * (R - 0.028 * S), 0, 0.01 * S), nibDeco));
    const inner = (R - 0.07 * S) * 2;
    const em = fitEm(nameChain, name, inner * 0.92, 0.065 * S);
    add(names, ...textCentered(nameChain, name, em, 0, 0.004 * S, nibName));
    for (const x of [-0.025, 0, 0.025]) add(deco, ...hatchFill(star(x * S, 0.06 * S + (x === 0 ? 0.006 * S : 0), 0.008 * S), nibDeco));
    add(deco, line(-0.05 * S, -0.045 * S, 0.05 * S, -0.045 * S));
    add(deco, ...textCentered(decoChain, small, 0.018 * S, 0, -0.07 * S, nibDeco));
  }

  else if (tpl === 'wave') {
    // dải lụa uốn sóng, hai đầu cuộn tròn, lá acanthus góc trái trên và phải dưới
    const amp = 0.028 * S, bw = W * 0.84, bh = 0.1 * S, x0 = -bw / 2, x1 = bw / 2;
    const f = (x) => amp * Math.sin((x / bw) * Math.PI * 2 + 0.3);
    const edge = (off) => { const p = []; for (let i = 0; i <= 60; i++) { const x = x0 + (x1 - x0) * i / 60; p.push([x, f(x) + off]); } return p; };
    const eT = edge(bh / 2), eB = edge(-bh / 2);
    add(deco, eT, eB, edge(bh / 2 - 0.007 * S), edge(-bh / 2 + 0.007 * S));
    // đầu trái gập ra sau phía trên, đầu phải cuộn tròn phía dưới
    const [lx, lyT] = eT[0], lyB = eB[0][1];
    add(deco, line(lx, lyT, lx, lyB), [[lx, lyT], [lx - 0.04 * S, lyT + 0.03 * S], [lx - 0.02 * S, lyT + 0.065 * S], [lx + 0.05 * S, lyT + 0.05 * S], [lx + 0.03 * S, lyT]]);
    const [rx, ryT] = eT[eT.length - 1], ryB = eB[eB.length - 1][1];
    add(deco, ...rollEnd(rx + 0.01 * S, (ryT + ryB) / 2 - 0.035 * S, bh * 0.42, 1), line(rx, ryT, rx + 0.045 * S, ryT - 0.04 * S));
    add(deco, ...acanthus(x0 + 0.02 * S, f(x0) + bh * 0.95, 0.13 * S, 1, -0.3, 1));
    add(deco, ...acanthus(x1 * 0.25, f(x1 * 0.25) - bh * 1.0, 0.11 * S, 1, 0.4, -1));
    const em = fitEm(nameChain, name, bw * 0.8, bh * 0.62);
    add(names, ...textOnWave(nameChain, name, em, f, nibName));
    add(deco, ...textCentered(decoChain, (top || '').toUpperCase(), 0.022 * S, 0, H / 2 - 0.03 * S, nibDeco));
    add(deco, ...textCentered(decoChain, (bottom || '').toUpperCase(), 0.022 * S, 0.06 * S, -H / 2 + 0.035 * S, nibDeco));
  }

  else if (tpl === 'scroll') {
    // cuộn giấy rộng hơi cong chữ S, hai đầu cuộn tròn; tên dài thì xuống 2 dòng
    const bw = W * 0.78, bh = 0.17 * S, amp = 0.018 * S;
    const f = (x) => amp * Math.sin((x / bw) * Math.PI * 2);
    const edge = (off) => { const p = []; for (let i = 0; i <= 60; i++) { const x = -bw / 2 + bw * i / 60; p.push([x, f(x) + off]); } return p; };
    const eT = edge(bh / 2), eB = edge(-bh / 2);
    add(deco, eT, eB, edge(bh / 2 - 0.008 * S), edge(-bh / 2 + 0.008 * S));
    const rr = bh * 0.32;
    add(deco, ...rollEnd(-bw / 2 - rr * 0.2, -bh / 2 + rr, rr, -1), line(-bw / 2, eB[0][1], -bw / 2, eT[0][1]));
    add(deco, ...rollEnd(bw / 2 + rr * 0.2, bh / 2 - rr, rr, 1), line(bw / 2, eB[eB.length - 1][1], bw / 2, eT[eT.length - 1][1]));
    add(deco, ...acanthus(-bw / 2 - 0.02 * S, bh / 2 + 0.01 * S, 0.11 * S, 1, 0.2, 1));
    const lines = name.split(' ').length > 1 && layoutText(nameChain, name, 1).width / (layoutText(nameChain, name, 1).capHeight || 0.7) > 7
      ? [name.slice(0, name.lastIndexOf(' ', Math.ceil(name.length / 2) + 2) > 0 ? name.lastIndexOf(' ', Math.ceil(name.length / 2) + 2) : name.length).trim()] : [name];
    if (lines[0] !== name) lines.push(name.slice(lines[0].length).trim());
    const em = Math.min(...lines.map(l => fitEm(nameChain, l, bw * 0.84, (bh * (lines.length > 1 ? 0.34 : 0.5)))));
    lines.forEach((l, i) => add(names, ...textOnWave(nameChain, l, em, (x) => f(x) + (lines.length > 1 ? (i ? -1 : 1) * bh * 0.2 : 0), nibName)));
    add(deco, ...filigree(0, -bh / 2 + 0.022 * S, 0.1 * S, 0.012 * S, 1));
    add(deco, ...textCentered(decoChain, (top || '').toUpperCase(), 0.022 * S, 0, H / 2 - 0.035 * S, nibDeco));
    add(deco, ...textCentered(decoChain, (bottom || '').toUpperCase(), 0.022 * S, 0, -H / 2 + 0.035 * S, nibDeco));
  }

  else if (tpl === 'pennant') {
    // băng rôn thẳng hơi võng, đuôi gấp phía sau, viền hạt trong, hàng lá phía trên/dưới
    const bw = W * 0.86, bh = 0.13 * S;
    const rb = ribbon(0, 0, bw, bh, 0.016 * S, 0.06 * S, 0.035 * S);
    masks.push(rb.poly);
    add(deco, ...rb.strokes);
    const inTop = [], inBot = [];
    for (let i = 0; i <= 50; i++) { const t = i / 50, x = -bw / 2 + 0.015 * S + (bw - 0.03 * S) * t, dy = 0.016 * S * Math.sin(Math.PI * t);
      inTop.push([x, bh / 2 - 0.012 * S + dy]); inBot.push([x, -bh / 2 + 0.012 * S + dy]); }
    add(deco, ...dotsAlong(inTop, 0.012 * S, 0.0018 * S), ...dotsAlong(inBot, 0.012 * S, 0.0018 * S));
    for (const sideY of [1, -1]) {
      const yy = sideY * (bh / 2 + 0.018 * S);
      const vine = []; for (let i = 0; i <= 50; i++) { const t = i / 50, x = -bw * 0.42 + bw * 0.84 * t; vine.push([x, yy + 0.016 * S * Math.sin(Math.PI * t) + 0.005 * S * Math.sin(t * 18)]); }
      add(deco, ...clip([vine], masks));
      for (let k = 0; k < 14; k++) {
        const t = (k + 0.5) / 14, x = -bw * 0.42 + bw * 0.84 * t, y = yy + 0.016 * S * Math.sin(Math.PI * t);
        add(deco, ...clip([leaf(x, y + sideY * 0.008 * S, 0.02 * S, 0.008 * S, (k % 2 ? 0.6 : -0.6) + (sideY > 0 ? 0 : Math.PI))], masks));
      }
    }
    const em = fitEm(nameChain, name, bw * 0.8, bh * 0.5);
    add(names, ...textCentered(nameChain, name, em, 0, 0.012 * S, nibName));
    add(deco, ...filigree(0, -bh / 2 + 0.03 * S, 0.08 * S, 0.008 * S, 1));
    add(deco, ...textCentered(decoChain, (top || '').toUpperCase(), 0.022 * S, 0, H / 2 - 0.03 * S, nibDeco));
    add(deco, ...textCentered(decoChain, (bottom || '').toUpperCase(), 0.022 * S, 0, -H / 2 + 0.03 * S, nibDeco));
  }

  else if (tpl === 'cartouche') {
    // khung hoa văn: vương miện trên, băng rôn vòm chứa tên, chữ nhỏ trên/dưới, giọt hoa văn đáy
    const h = H / 2;
    add(deco, ...filigree(0, h - 0.035 * S, 0.17 * S, 0.03 * S, 1), ...hatchFill(diamond(0, h - 0.02 * S, 0.01 * S, 0.016 * S), nibDeco));
    add(deco, ...textCentered(decoChain, (top || '').toUpperCase(), 0.026 * S, 0, h - 0.085 * S, nibDeco));
    const bw = W * 0.78, bh = 0.1 * S, R = 0.9 * S, cy = -0.01 * S;
    const da = (bw / 2) / R;
    const o1 = arc(0, cy - R + bh / 2, R, Math.PI / 2 + da, Math.PI / 2 - da), o2 = arc(0, cy - R - bh / 2, R, Math.PI / 2 + da, Math.PI / 2 - da);
    add(deco, o1, o2, line(...o1[0], ...o2[0]), line(...o1[o1.length - 1], ...o2[o2.length - 1]));
    for (const d of [-1, 1]) {
      const e = d < 0 ? o2[0] : o2[o2.length - 1];
      add(deco, [[e[0], e[1] + bh * 0.25], [e[0] + d * 0.05 * S, e[1] + bh * 0.25], [e[0] + d * 0.032 * S, e[1] - bh * 0.15], [e[0] + d * 0.05 * S, e[1] - bh * 0.55], [e[0] - d * 0.01 * S, e[1] - bh * 0.55], [e[0], e[1]]]);
      add(deco, swash(d * (bw / 2 + 0.06 * S), cy - 0.075 * S, 0.06 * S, 0.02 * S, d, -1));
    }
    const em = fitEm(nameChain, name, bw * 0.84, bh * 0.58);
    add(names, ...textOnArc(nameChain, name, em, 0, cy - R, R - layoutText(nameChain, name, em).capHeight / 2, true, nibName, 0));
    add(deco, ...textCentered(decoChain, (bottom || '').toUpperCase(), 0.024 * S, 0, -h + 0.1 * S, nibDeco));
    add(deco, ...filigree(0, -h + 0.05 * S, 0.14 * S, 0.025 * S, -1), ...hatchFill(diamond(0, -h + 0.02 * S, 0.008 * S, 0.014 * S), nibDeco));
  }

  else if (tpl === 'medallion') {
    // bảng ngang viền đôi đầu bo, huy chương tròn chữ cái phía trên, dòng chấm hai bên, phụ đề dưới
    const w = W / 2, h = H * 0.36;
    const plate = roundRect(0, -0.02 * S, W - 0.06 * S, h * 1.6, 0.03 * S), plate2 = roundRect(0, -0.02 * S, W - 0.08 * S, h * 1.6 - 0.02 * S, 0.022 * S);
    const r = 0.035 * S, my = -0.02 * S + h * 0.7;
    const med = circle(0, my, r + 0.006 * S);
    masks.push(med);
    add(deco, ...clip([plate, plate2], masks), circle(0, my, r), med);
    const mono = initials(name).slice(0, 1);
    if (mono) add(deco, ...textCentered(decoChain, mono, fitEm(decoChain, mono, r, r * 0.9), 0, my, nibDeco));
    for (const d of [-1, 1]) {
      add(deco, ...dotsAlong([[d * (r + 0.02 * S), my], [d * (w - 0.08 * S), my]], 0.012 * S, 0.0025 * S));
      add(deco, swash(d * (w - 0.03 * S), -0.02 * S, 0.05 * S, 0.03 * S, -d, 1), swash(d * (w - 0.03 * S), -0.02 * S, 0.05 * S, 0.03 * S, -d, -1));
    }
    add(deco, ...textCentered(decoChain, (top || '').toUpperCase(), 0.022 * S, 0, my - r - 0.024 * S, nibDeco));
    const em = fitEm(nameChain, name, W - 0.2 * S, 0.06 * S);
    add(names, ...textCentered(nameChain, name, em, 0, -0.037 * S, nibName));
    const by = -0.02 * S - h * 0.62;
    add(deco, line(-w * 0.62, by + 0.018 * S, w * 0.62, by + 0.018 * S), line(-w * 0.62, by - 0.018 * S, w * 0.62, by - 0.018 * S));
    add(deco, ...textCentered(decoChain, (bottom || '').toUpperCase(), 0.02 * S, 0, by, nibDeco));
    add(deco, ...textCentered(decoChain, small, 0.018 * S, 0, -H / 2 + 0.02 * S, nibDeco));
  }

  else if (tpl === 'heritage') {
    // nhãn cổ điển: vương miện hoa văn, chữ nhỏ, tên lớn, các vòm cong bên dưới kẹp chữ, hoa văn đáy
    const h = H / 2;
    add(deco, ...filigree(0, h - 0.03 * S, 0.15 * S, 0.026 * S, 1), ...hatchFill(diamond(0, h - 0.015 * S, 0.008 * S, 0.014 * S), nibDeco));
    add(deco, ...filigree(-W * 0.32, h - 0.08 * S, 0.06 * S, 0.015 * S, 1), ...filigree(W * 0.32, h - 0.08 * S, 0.06 * S, 0.015 * S, 1));
    add(deco, ...textCentered(decoChain, (top || '').toUpperCase(), 0.024 * S, 0, h - 0.075 * S, nibDeco));
    const em = fitEm(nameChain, name, W - 0.08 * S, 0.1 * S);
    add(names, ...textCentered(nameChain, name, em, 0, 0.015 * S, nibName));
    const R = 0.7 * S;
    for (const [k, off] of [[0, -0.06], [1, -0.075], [2, -0.14]]) {
      const da = (W * (k === 2 ? 0.3 : 0.42)) / R; add(deco, arc(0, off * S + R, R, -Math.PI / 2 - da, -Math.PI / 2 + da));
    }
    add(deco, ...textCentered(decoChain, small, 0.02 * S, 0, -0.105 * S, nibDeco));
    add(deco, ...textCentered(decoChain, (bottom || '').toUpperCase(), 0.022 * S, 0, -h + 0.045 * S, nibDeco));
    for (const d of [-1, 1]) add(deco, swash(d * 0.13 * S, -h + 0.045 * S, 0.07 * S, 0.015 * S, d, 1));
    add(deco, ...hatchFill(diamond(0, -h + 0.012 * S, 0.006 * S, 0.01 * S), nibDeco));
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
