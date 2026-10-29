export function basename(p, ext) { let b = String(p || '').split(/[\\/]/).pop(); if (ext && b.endsWith(ext)) b = b.slice(0, -ext.length); return b; }
export function extname(p) { const b = basename(p); const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i) : ''; }
export function join(...a) { return a.join('/').replace(/\/+/g, '/'); }
export function parse(p) { const base = basename(p); const ext = extname(p); return { base, ext, name: ext ? base.slice(0, -ext.length) : base, dir: String(p).slice(0, -base.length - 1) }; }
export default { basename, extname, join, parse };
