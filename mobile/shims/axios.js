// axios dùng HTTP native (không bị chặn CORS, gửi được User-Agent)
import axios from 'axios/dist/browser/axios.cjs';
import { nativeRequest } from './native.js';
async function adapter(config) {
  let url = config.baseURL && !/^https?:/i.test(config.url) ? config.baseURL.replace(/\/$/, '') + '/' + config.url.replace(/^\//, '') : config.url;
  if (config.params) { const sp = new URLSearchParams(); for (const [k, v] of Object.entries(config.params)) if (v != null) sp.append(k, v); const q = sp.toString(); if (q) url += (url.includes('?') ? '&' : '?') + q; }
  const headers = {}; const h = config.headers && config.headers.toJSON ? config.headers.toJSON() : (config.headers || {});
  for (const [k, v] of Object.entries(h)) if (v != null && typeof v !== 'object') headers[k] = String(v);
  const r = await nativeRequest({ url, method: (config.method || 'get').toUpperCase(), headers, body: config.data, binary: config.responseType === 'arraybuffer' });
  let data = r.data;
  if (config.responseType !== 'arraybuffer' && typeof data === 'string') { try { data = JSON.parse(data); } catch { } }
  const res = { data, status: r.status, statusText: String(r.status), headers: r.headers, config, request: {} };
  const ok = config.validateStatus ? config.validateStatus(r.status) : r.status >= 200 && r.status < 300;
  if (!ok) { const e = new Error('Request failed with status code ' + r.status); e.response = res; e.config = config; throw e; }
  return res;
}
axios.defaults.adapter = adapter;
export default axios;
export const { create, isAxiosError, AxiosError, AxiosHeaders } = axios;
