// Gom giao diện + tài nguyên từ app/ (thư mục cập nhật nóng) vào www/ cho Capacitor
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const app = path.join(root, '..', 'app'); const www = path.join(root, 'www');
fs.rmSync(www, { recursive: true, force: true }); fs.mkdirSync(www, { recursive: true });
for (const d of ['renderer', 'assets']) fs.cpSync(path.join(app, d), path.join(www, d), { recursive: true, filter: (s) => !/(^|[\\/])(_test|_dm)([\\/]|$)/.test(s) });
fs.copyFileSync(path.join(app, 'version.json'), path.join(www, 'version.json'));
fs.writeFileSync(path.join(www, 'index.html'), '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>html{background:#0d0b09}</style><script>location.replace("renderer/display.html")</script>');
console.log('www ready', fs.readdirSync(www));
