// Lớp WebSocket kiểu thư viện "ws" chạy trên WebSocket native (OkHttp) để gửi được Cookie/Origin/User-Agent
import { EventEmitter } from 'events';
import { Buffer } from 'buffer';
import { Ws, b64ToBytes, bytesToB64 } from './native.js';
let seq = 0; const live = new Map(); let hooked = false;
function hook() {
  if (hooked) return; hooked = true;
  const P = Ws();
  P.addListener('open', e => live.get(e.id)?._open());
  P.addListener('message', e => live.get(e.id)?._msg(e));
  P.addListener('close', e => live.get(e.id)?._close(e.code ?? 1006, e.reason || ''));
  P.addListener('error', e => live.get(e.id)?._err(e.message || 'WebSocket error'));
}
export class WebSocket extends EventEmitter {
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
  constructor(url, opts = {}) {
    super(); hook();
    this.url = url; this.readyState = 0; this.id = 'ws' + (++seq) + '_' + Date.now().toString(36);
    live.set(this.id, this);
    Ws().connect({ id: this.id, url, headers: opts.headers || {} }).catch(e => this._err(e.message || String(e)));
  }
  get CONNECTING() { return 0; } get OPEN() { return 1; } get CLOSING() { return 2; } get CLOSED() { return 3; }
  _open() { this.readyState = 1; this.emit('open'); }
  _msg(e) { const data = e.binary ? Buffer.from(b64ToBytes(e.data)) : Buffer.from(e.data || ''); this.emit('message', data, !!e.binary); }
  _close(code, reason) { if (this.readyState === 3) return; this.readyState = 3; live.delete(this.id); this.emit('close', code, Buffer.from(reason)); }
  _err(m) { const er = new Error(m); this.emit('error', er); if (this.readyState !== 3) this._close(1006, m); }
  send(data, _o, cb) {
    if (this.readyState !== 1) { cb && cb(new Error('not open')); return; }
    const u = data instanceof Uint8Array ? data : typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
    Ws().send({ id: this.id, data: bytesToB64(u) }).then(() => cb && cb(), e => cb && cb(e));
  }
  ping() { } pong() { }
  close(code = 1000, reason = '') { if (this.readyState >= 2) return; this.readyState = 2; Ws().close({ id: this.id, code, reason: String(reason || '') }).catch(() => { }); setTimeout(() => this._close(code, String(reason || '')), 1500); }
  terminate() { this.close(1000, 'terminate'); }
}
export default WebSocket;
