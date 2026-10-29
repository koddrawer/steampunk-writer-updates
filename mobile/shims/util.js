export function promisify(fn) { return (...a) => new Promise((res, rej) => fn(...a, (e, v) => e ? rej(e) : res(v))); }
export function inspect(o) { try { return JSON.stringify(o); } catch { return String(o); } }
export const types = {}; export function inherits(c, p) { Object.setPrototypeOf(c.prototype, p.prototype); }
export default { promisify, inspect, types, inherits };
