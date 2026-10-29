import { Buffer } from 'buffer';
import { unzlibSync, gunzipSync, inflateSync } from 'fflate';
function un(b) { const u = new Uint8Array(b); if (u[0] === 0x1f && u[1] === 0x8b) return gunzipSync(u); try { return unzlibSync(u); } catch { return inflateSync(u); } }
export function unzip(buf, a, b) { const cb = typeof a === 'function' ? a : b; try { cb(null, Buffer.from(un(buf))); } catch (e) { cb(e); } }
export function gunzip(buf, a, b) { return unzip(buf, a, b); }
export function unzipSync(buf) { return Buffer.from(un(buf)); }
export default { unzip, gunzip, unzipSync };
