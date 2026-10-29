export function isIP(s) { s = String(s); if (/^(\d{1,3}\.){3}\d{1,3}$/.test(s)) return 4; if (/^[0-9a-f:]+$/i.test(s) && s.includes(':')) return 6; return 0; }
export default { isIP };
