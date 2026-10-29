// Đóng gói thư viện TikTok + lõi (hàng đợi, lịch video) thành ES module chạy trong WebView Android.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const S = (f) => path.join(root, 'shims', f);
const alias = { 'node:events': 'events', 'node:zlib': S('zlib.js'), 'node:util': S('util.js'), 'node:net': S('net.js'), 'ws': S('ws.js'), 'got': S('got.js'),
  'fs': S('fs.js'), 'path': S('path.js'), 'zlib': S('zlib.js'), 'util': S('util.js') };
const common = {
  bundle: true, format: 'esm', platform: 'browser', target: ['chrome90'], minify: true, legalComments: 'none', logLevel: 'info',
  define: { 'process.env': '{}', 'process.platform': '"android"', global: 'globalThis' },
  inject: [S('inject.js')], alias, mainFields: ['browser', 'module', 'main'], conditions: ['browser', 'import', 'default'],
};
const out = path.join(root, '..', 'app', 'renderer', 'js', 'mobile');
// axios -> bản dùng HTTP native (trừ chính file shim)
const axiosPlugin = { name: 'axios-native', setup(b) { b.onResolve({ filter: /^axios$/ }, a => a.importer.endsWith('axios.js') && a.importer.includes('shims') ? undefined : { path: S('axios.js') }); } };
await build({ ...common, entryPoints: [S('tiktok-entry.js')], outfile: path.join(out, 'tiktok.bundle.js'), plugins: [axiosPlugin] });
await build({ ...common, entryPoints: [S('core-entry.js')], outfile: path.join(out, 'core.bundle.js') });
await build({ ...common, entryPoints: [S('fflate-entry.js')], outfile: path.join(out, 'fflate.bundle.js') });
