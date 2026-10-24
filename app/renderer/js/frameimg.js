// Xử lý ảnh khung logo của người dùng:
//  1) tìm khung viền XANH LÁ đánh dấu vùng viết tên
//  2) xoá nền + mảng màu, chỉ giữ nét hoa văn (ngưỡng thích nghi theo độ tối cục bộ)
//  3) làm mảnh nét (skeleton) rồi dò thành các đường để ngòi bút vẽ thật, kèm độ dày từng nét
const cache = new Map();

export function processFrame(url, opts = {}) {
  const o = { sens: 0.5, clearBox: true, maxDim: 1200, minSpeck: 10, ink: '#281a0f', ...opts };
  const key = url + '|' + JSON.stringify(o);
  if (!cache.has(key)) cache.set(key, run(url, o).catch(e => { cache.delete(key); throw e; }));
  return cache.get(key);
}

async function run(url, o) {
  const im = new Image(); im.crossOrigin = 'anonymous'; im.src = url; await im.decode();
  const k = Math.min(1, o.maxDim / Math.max(im.width, im.height));
  const w = Math.max(8, Math.round(im.width * k)), h = Math.max(8, Math.round(im.height * k));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(im, 0, 0, w, h);
  const px = cx.getImageData(0, 0, w, h).data;
  const N = w * h;

  // ---- 1. khung xanh lá đánh dấu vùng tên
  const green = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2], a = px[i * 4 + 3];
    if (a > 100 && g > 130 && g - r > 70 && g - b > 60 && g > r * 1.6 && g > b * 1.45) green[i] = 1;
  }
  const comps = components(green, w, h);
  let box = null, best = 0;
  for (const c of comps) {
    if (c.n < 20) continue;
    const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1; if (bw < 12 || bh < 8) continue;
    const fillRatio = c.n / (bw * bh);
    const score = bw * bh * (fillRatio < 0.6 ? 1 : 0.4);          // ưu tiên dạng viền chữ nhật
    if (score > best) { best = score; box = { ...c, bw, bh, fillRatio }; }
  }
  let nameBox = null;
  if (box) {
    const t = box.fillRatio < 0.6 ? Math.max(1, Math.round(box.n / (2 * (box.bw + box.bh)))) : 0;
    nameBox = { x: box.x0 + t + 1, y: box.y0 + t + 1, w: Math.max(4, box.bw - 2 * t - 2), h: Math.max(4, box.bh - 2 * t - 2) };
  }
  // xoá toàn bộ điểm xanh (và viền 1px quanh) để không bị coi là nét
  const greenD = dilate(green, w, h, 2);

  // ---- 2. tách nét hoa văn
  const L = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = px[i * 4 + 3] / 255; const lum = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255;
    L[i] = greenD[i] ? 1 : lum * a + (1 - a);                       // nền trong suốt coi như trắng
  }
  const rad = Math.max(4, Math.round(Math.max(w, h) / 45));
  const M = boxBlur(L, w, h, rad);
  const off = 0.16 - 0.13 * o.sens;                                 // độ nhạy cao -> giữ nhiều nét mảnh hơn
  const dark = 0.16 + 0.1 * o.sens;                                // đen đậm tuyệt đối luôn là nét
  let mask = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (!greenD[i] && (M[i] - L[i] > off || L[i] < dark)) mask[i] = 1;
  if (nameBox && o.clearBox) {
    for (let y = nameBox.y; y < nameBox.y + nameBox.h; y++) for (let x = nameBox.x; x < nameBox.x + nameBox.w; x++) mask[y * w + x] = 0;
  }
  // bỏ đốm nhỏ
  for (const c of components(mask, w, h)) if (c.n < o.minSpeck) for (const i of c.idx) mask[i] = 0;

  // ảnh mực xem trước
  const ink = document.createElement('canvas'); ink.width = w; ink.height = h;
  const ix = ink.getContext('2d'); const id = ix.createImageData(w, h);
  const ic = parseInt((o.ink || '#281a0f').replace('#', ''), 16);
  for (let i = 0; i < N; i++) if (mask[i]) { id.data[i * 4] = ic >> 16 & 255; id.data[i * 4 + 1] = ic >> 8 & 255; id.data[i * 4 + 2] = ic & 255; id.data[i * 4 + 3] = 255; }
  ix.putImageData(id, 0, 0);

  // ---- 3. làm mảnh + dò đường + độ dày
  const dt = distance(mask, w, h);
  const skel = thin(mask, w, h);
  const strokes = trace(skel, w, h).map(pts => {
    const ds = pts.map(([x, y]) => dt[y * w + x]).sort((a, b) => a - b);
    const half = ds[Math.floor(ds.length / 2)] || 1;
    return { pts: rdp(pts.map(([x, y]) => [x + 0.5, y + 0.5]), 0.7), width: Math.max(1, half * 2 - 0.5) };
  }).filter(s => s.pts.length > 1);
  return { w, h, nameBox, found: !!nameBox, strokes, inkCanvas: ink, maskCount: mask.reduce((a, b) => a + b, 0) };
}

// ---------------- tiện ích ảnh
function components(m, w, h) {
  const seen = new Uint8Array(w * h); const out = []; const st = [];
  for (let s = 0; s < w * h; s++) {
    if (!m[s] || seen[s]) continue;
    const c = { n: 0, x0: w, y0: h, x1: 0, y1: 0, idx: [] }; st.push(s); seen[s] = 1;
    while (st.length) {
      const i = st.pop(); const x = i % w, y = (i / w) | 0; c.n++; c.idx.push(i);
      if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx; if (m[j] && !seen[j]) { seen[j] = 1; st.push(j); }
      }
    }
    out.push(c);
  }
  return out;
}
function dilate(m, w, h, r) {
  const o = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x])
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < w && ny < h) o[ny * w + nx] = 1; }
  return o;
}
function boxBlur(src, w, h, r) {
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += src[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; } }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(w, x + r + 1), y1 = Math.min(h, y + r + 1);
    out[y * w + x] = (I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0]) / ((x1 - x0) * (y1 - y0));
  }
  return out;
}
function distance(m, w, h) {         // khoảng cách tới nền (chamfer 3-4) / 3 ≈ pixel
  const INF = 1e9, d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = m[i] ? INF : 0;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : d[y * w + x];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (!d[i]) continue;
    d[i] = Math.min(d[i], at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4); }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) { const i = y * w + x; if (!d[i]) continue;
    d[i] = Math.min(d[i], at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4); }
  for (let i = 0; i < w * h; i++) d[i] /= 3;
  return d;
}
function thin(src, w, h) {           // Zhang–Suen
  const m = src.slice(); let changed = true; const del = [];
  const P = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : m[y * w + x];
  for (let it = 0; changed && it < 60; it++) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      del.length = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (!m[y * w + x]) continue;
        const p2 = P(x, y - 1), p3 = P(x + 1, y - 1), p4 = P(x + 1, y), p5 = P(x + 1, y + 1), p6 = P(x, y + 1), p7 = P(x - 1, y + 1), p8 = P(x - 1, y), p9 = P(x - 1, y - 1);
        const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9; if (B < 2 || B > 6) continue;
        const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2]; let A = 0; for (let k = 0; k < 8; k++) if (!seq[k] && seq[k + 1]) A++;
        if (A !== 1) continue;
        if (pass === 0 ? (p2 * p4 * p6 === 0 && p4 * p6 * p8 === 0) : (p2 * p4 * p8 === 0 && p2 * p6 * p8 === 0)) del.push(y * w + x);
      }
      if (del.length) { changed = true; for (const i of del) m[i] = 0; }
    }
  }
  return m;
}
const NB = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]];
function trace(sk, w, h) {
  const vis = new Uint8Array(w * h); const lines = [];
  const deg = (x, y) => { let n = 0; for (const [dx, dy] of NB) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < w && ny < h && sk[ny * w + nx]) n++; } return n; };
  const walk = (sx, sy) => {
    const pts = [[sx, sy]]; vis[sy * w + sx] = 1; let x = sx, y = sy, pdx = 0, pdy = 0;
    for (;;) {
      let bx = -1, by = -1, bs = -Infinity;
      for (const [dx, dy] of NB) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx; if (!sk[j] || vis[j]) continue;
        const sc = (dx * pdx + dy * pdy) - (Math.abs(dx) + Math.abs(dy) > 1 ? 0.3 : 0);
        if (sc > bs) { bs = sc; bx = nx; by = ny; }
      }
      if (bx < 0) break;
      pdx = bx - x; pdy = by - y; x = bx; y = by; vis[y * w + x] = 1; pts.push([x, y]);
    }
    return pts;
  };
  // bắt đầu từ các điểm đầu mút, sau đó tới các vòng kín
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (sk[i] && !vis[i] && deg(x, y) === 1) lines.push(walk(x, y)); }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (sk[i] && !vis[i]) { const p = walk(x, y); if (p.length > 2) p.push(p[0]); lines.push(p); } }
  return lines.filter(p => p.length >= 2 || true).map(p => p.length === 1 ? [p[0], [p[0][0] + 0.6, p[0][1]]] : p);
}
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const [sx, sy] = pts[0], [ex, ey] = pts[pts.length - 1];
  if (Math.hypot(ex - sx, ey - sy) < 1e-6) {                 // đường khép kín: tách tại điểm xa nhất rồi làm gọn từng nửa
    let fi = 1, fd = -1; for (let i = 1; i < pts.length - 1; i++) { const d = Math.hypot(pts[i][0] - sx, pts[i][1] - sy); if (d > fd) { fd = d; fi = i; } }
    return rdp(pts.slice(0, fi + 1), eps).slice(0, -1).concat(rdp(pts.slice(fi), eps));
  }
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1]; const L = Math.hypot(bx - ax, by - ay) || 1;
  let md = 0, mi = 0;
  for (let i = 1; i < pts.length - 1; i++) { const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L; if (d > md) { md = d; mi = i; } }
  if (md <= eps) return [pts[0], pts[pts.length - 1]];
  return rdp(pts.slice(0, mi + 1), eps).slice(0, -1).concat(rdp(pts.slice(mi), eps));
}
function offsetLine(pts, d) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    return [p[0] - dy / L * d, p[1] + dx / L * d];
  });
}
