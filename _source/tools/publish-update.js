#!/usr/bin/env node
// Đẩy bản cập nhật nóng lên repo GitHub.
// Dùng:  node tools/publish-update.js [patch|minor|major|x.y.z] "ghi chú"
// Biến môi trường UPDATE_REPO_DIR = thư mục đã clone repo cập nhật (mặc định ../steampunk-writer-updates)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const repoDir = path.resolve(process.env.UPDATE_REPO_DIR || path.join(root, '..', 'steampunk-writer-updates'));
const bump = process.argv[2] || 'patch';
const notes = process.argv[3] || '';

if (!fs.existsSync(path.join(repoDir, '.git'))) {
  console.error(`Không thấy repo git ở ${repoDir}.\nHãy clone trước:  git clone https://github.com/<tài-khoản>/steampunk-writer-updates.git "${repoDir}"`);
  process.exit(1);
}
const vf = path.join(root, 'app', 'version.json');
const v = JSON.parse(fs.readFileSync(vf, 'utf8'));
let [a, b, c] = v.version.split('.').map(Number);
if (/^\d+\.\d+\.\d+$/.test(bump)) [a, b, c] = bump.split('.').map(Number);
else if (bump === 'major') { a++; b = 0; c = 0; } else if (bump === 'minor') { b++; c = 0; } else c++;
v.version = `${a}.${b}.${c}`; v.notes = notes; v.date = new Date().toISOString();
v.minShell = v.minShell || require(path.join(root, 'package.json')).version;
fs.writeFileSync(vf, JSON.stringify(v, null, 2));

const dst = path.join(repoDir, 'app');
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(path.join(root, 'app'), dst, { recursive: true });
fs.writeFileSync(path.join(repoDir, 'version.json'), JSON.stringify(v, null, 2));
if (!fs.existsSync(path.join(repoDir, 'README.md')))
  fs.writeFileSync(path.join(repoDir, 'README.md'), '# Steampunk Writer – kho cập nhật\n\nThư mục `app/` và `version.json` được app tải về tự động. Không sửa tay.\n');

const run = (cmd) => execSync(cmd, { cwd: repoDir, stdio: 'inherit' });
run('git add -A');
run(`git commit -m "Cập nhật v${v.version}${notes ? ': ' + notes.replace(/"/g, "'") : ''}"`);
run('git push');
console.log(`\n✔ Đã đẩy v${v.version}. Các máy đang chạy app sẽ nhận bản mới trong lần kiểm tra kế tiếp.`);
