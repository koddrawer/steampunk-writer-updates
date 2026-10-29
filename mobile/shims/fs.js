// fs tối giản cho lõi chạy trong WebView: file người dùng nằm trong bộ nhớ app, coi như luôn tồn tại
export function existsSync(p) { return !!p; }
export default { existsSync };
