// Truy cập plugin native của Capacitor (HTTP không CORS, WebSocket có header tuỳ ý)
export const Cap = () => window.Capacitor;
export const Http = () => Cap().Plugins.CapacitorHttp || Cap().registerPlugin('CapacitorHttp');
export const Ws = () => Cap().Plugins.NativeWs || (Cap().Plugins.NativeWs = Cap().registerPlugin('NativeWs'));
export function b64ToBytes(b64) { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
export function bytesToB64(u) { let s = ''; const C = 0x8000; for (let i = 0; i < u.length; i += C) s += String.fromCharCode.apply(null, u.subarray(i, i + C)); return btoa(s); }
// gọi HTTP qua native: trả { status, headers, bytes|text }
export async function nativeRequest({ url, method = 'GET', headers = {}, body, binary }) {
  const opt = { url, method, headers, responseType: binary ? 'arraybuffer' : 'text', connectTimeout: 15000, readTimeout: 20000 };
  if (body !== undefined && body !== null) {
    const ct = Object.entries(headers).find(([k]) => k.toLowerCase() === 'content-type');
    opt.data = ct && /json/i.test(ct[1]) && typeof body === 'string' ? JSON.parse(body) : body;
  }
  const r = await Http().request(opt);
  let data = r.data;
  if (binary) data = typeof data === 'string' ? b64ToBytes(data) : new Uint8Array(data || []);
  else if (typeof data !== 'string') data = data == null ? '' : JSON.stringify(data);
  return { status: r.status, headers: r.headers || {}, data, url: r.url || url };
}
export function setCookieList(headers) {
  const out = [];
  for (const [k, v] of Object.entries(headers || {})) {
    if (k.toLowerCase() !== 'set-cookie') continue;
    for (const x of (Array.isArray(v) ? v : String(v).split(/,(?=\s*[^;,=\s]+=)/))) out.push(x.trim());
  }
  return out;
}
