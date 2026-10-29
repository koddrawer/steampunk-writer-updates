# Steampunk Writer – kho cập nhật nóng

- `app/` + `version.json`: được app trên các máy live tải về (updater trong `_source/shell/updater.js`). App chỉ nhận bản khi `version.json` có version lớn hơn bản đang chạy.
- `_source/`: phần còn lại của mã nguồn (shell, tools, package.json, workflow build Windows). Ghép lại: copy `app/` vào `_source/` → `npm install` → `npm start`.

## Quy trình phát hành (luôn làm theo)
1. Sửa code trong `app/` (cần thì sửa `_source/`).
2. Kiểm tra cú pháp: `node --check` các file core; test màn hiển thị bằng Chromium headless nếu đụng renderer.
3. Tăng version (semver) ở CẢ `app/version.json` và `version.json` gốc, ghi `notes` tiếng Việt.
4. Nếu sửa `_source/shell` hoặc thêm thư viện npm: tăng `minShell` và `package.json` version → phải build lại bản zip Windows (`npx electron-builder --win zip --x64`) gửi người dùng.
5. Commit + push lên `main`.

## Bản Android (mobile/)
- Capacitor 8; lõi chạy trong WebView: `app/renderer/js/mobile/api.js` (thay main process), bundle `tiktok.bundle.js`/`core.bundle.js`/`fflate.bundle.js` tạo bằng `cd mobile && node tools/bundle.mjs` (shims trong `mobile/shims`). WebSocket TikTok qua plugin native `NativeWsPlugin.java` (OkHttp).
- Phần web của bản Android cập nhật nóng như máy tính (tải `app/renderer` + `app/assets` rồi `WebView.setServerBasePath`). `version.json` có `minApk`: tăng khi đổi native/plugin → phải build APK mới.
- Build APK: GitHub Actions `.github/workflows/build-android.yml` (chạy khi push `mobile/**`), tăng `mobile/apk.json` (code + name) mỗi lần build APK mới; APK ra ở Releases `apk-v<name>`.
