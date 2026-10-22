# Steampunk Writer – máy viết tên cho TikTok LIVE

App Electron chạy độc lập trên Windows, gồm 2 cửa sổ (từ v1.1.0 video phát trong khung nằm trong màn hiển thị):

| Cửa sổ | Dùng để |
|---|---|
| **Steampunk Writer - Display** (9:16) | Cảnh 3D máy viết. Thêm vào LIVE Studio bằng *Window capture* |
| **Bảng điều khiển** | Cài đặt mọi thứ. Đóng cửa sổ này là tắt cả app |

## Chạy
- Bản portable: giải nén `SteampunkWriter-1.0.0-win-x64.zip` → chạy `Steampunk Writer.exe`.
- Từ mã nguồn: `npm install` rồi `npm start`.
- Tạo bộ cài .exe: đẩy mã nguồn lên GitHub rồi chạy workflow **Build Windows installer** (tab Actions), hoặc chạy `npm run dist` trên Windows.

## Cập nhật từ xa (hot update)
1. Tạo repo **public** `koddrawer/steampunk-writer-updates` trên GitHub (có thể đổi tên ở tab *Cập nhật*).
2. Clone repo đó nằm cạnh thư mục mã nguồn: `git clone https://github.com/koddrawer/steampunk-writer-updates.git ../steampunk-writer-updates`
3. Mỗi lần sửa code trong `app/`: `npm run publish-update -- patch "ghi chú"`
   (script tự tăng version, chép `app/` sang repo cập nhật, rồi commit và push).
4. Các máy đang chạy sẽ tự kiểm tra (mặc định 30 phút/lần, hoặc bấm *Kiểm tra ngay*). App tải bản mới về rồi hiện nút **Khởi động lại để cập nhật**, nên không bị ngắt giữa buổi live.
   Nếu bản mới bị lỗi khi khởi động, app tự quay về bản cài sẵn.

Cập nhật nóng được: toàn bộ thư mục `app/` (giao diện, máy 3D, logic video/hàng chờ, kết nối TikTok, model, font).
Không cập nhật nóng được: `shell/` và các thư viện trong `node_modules` (phải cài lại bản mới).

## Thay model 3D
Sau khi sửa file .blend, chạy (cần Blender ≥ 4.2 hoặc `pip install bpy`):
```
blender -b --python tools/blender/export_glb.py -- your.blend app/assets
```
Script giữ nguyên tên các nhóm `Arm_*`, `Gear_*`, `RollAssembly`, `FrontAssembly`… mà app dùng để chuyển động.
Nếu đổi kích thước giấy/cuộn thì sửa hằng số `G` trong `app/renderer/js/machine.js`.

## Cấu trúc
```
shell/            vỏ app: đăng ký giao thức, chọn bản app mới nhất, bộ cập nhật GitHub
app/core/         main process: cửa sổ, TikTok, hàng chờ viết, lịch phát video
app/renderer/     display (three.js + IK + engine viết), panel, popup
app/assets/       machine.glb, machine.json (thông số khớp/bánh răng), texture giấy, font
tools/            publish-update.js, blender/export_glb.py
```
