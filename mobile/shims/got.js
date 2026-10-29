// "got" tối giản trên HTTP native của Capacitor (đủ cho tiktok-live-connector)
import { Buffer } from 'buffer';
import { nativeRequest, setCookieList } from './native.js';
class HTTPError extends Error { constructor(res) { super(`Response code ${res.statusCode}`); this.name = 'HTTPError'; this.response = res; } }
function make(defaults = {}) {
  const inst = async (url, opts = {}) => {
    const o = { ...defaults, ...opts, headers: { ...(defaults.headers || {}), ...(opts.headers || {}) } };
    let u = String(url);
    if (o.searchParams) { const sp = new URLSearchParams(o.searchParams); u += (u.includes('?') ? '&' : '?') + sp; }
    const jar = o.cookieJar;
    if (jar && jar.getCookieString) { const c = await jar.getCookieString(u); if (c) o.headers.Cookie = c; }
    let body = o.body; if (o.json !== undefined) { body = JSON.stringify(o.json); o.headers['Content-Type'] = o.headers['Content-Type'] || 'application/json'; }
    const binary = o.responseType === 'buffer';
    const r = await nativeRequest({ url: u, method: (o.method || 'GET').toUpperCase(), headers: o.headers, body, binary });
    if (jar && jar.setCookie) for (const c of setCookieList(r.headers)) await jar.setCookie(c, u);
    let b = r.data;
    if (binary) b = Buffer.from(b);
    else if (o.responseType === 'json') { try { b = JSON.parse(b); } catch { } }
    const res = { statusCode: r.status, headers: Object.fromEntries(Object.entries(r.headers).map(([k, v]) => [k.toLowerCase(), v])), body: b, url: r.url, rawBody: b };
    if (o.throwHttpErrors !== false && r.status >= 400) throw new HTTPError(res);
    return res;
  };
  for (const m of ['get', 'post', 'put', 'delete', 'head', 'patch']) inst[m] = (url, opts = {}) => inst(url, { ...opts, method: m.toUpperCase() });
  inst.extend = (o = {}) => make({ ...defaults, ...o, headers: { ...(defaults.headers || {}), ...(o.headers || {}) } });
  inst.defaults = { options: defaults };
  return inst;
}
const got = make();
export default got;
export { HTTPError };
