# ⚡ Locket VIP Studio (Unlocked & Self-Hosted)

Hệ thống chụp ảnh Photobooth, Dual Camera, ảnh động GIF, và đăng ảnh/video lên widget Locket mở khóa 100% tính năng VIP, tự lưu trữ và cài đặt lên iPhone qua IP/DNS nội mạng.

---

## 🌟 Các tính năng đã mở khóa vĩnh viễn (Unlocked 100%)
- **Dual Camera**: Chụp song song 2 camera Trước & Sau (hỗ trợ chế độ góc PiP và chia đôi màn hình Split screen). Tự động fallback nếu thiết bị chỉ mở được 1 camera.
- **Tạo ảnh động GIF**: Quay chuỗi khung hình lặp 2-3s và xuất video lặp kèm poster gửi lên widget Locket.
- **Photobooth Studio**: Mở khóa toàn bộ **6 bố cục lưới** (1×2, 1×3, 1×4, 2×2, 2×3, 3×3) và **5 mốc hẹn giờ chụp** (2s, 3s, 5s, 7s, 10s) với bộ ghép canvas chuẩn 1080×1080.
- **Khung ảnh tùy chỉnh (Custom Frames)**: Hỗ trợ tự tải ảnh viền khung PNG và các mẫu khung Polaroid, Film, Gold VIP, Trái tim.
- **14 Giao diện màu (Themes)** phong cách Locket Gold (Gold VIP, Hot To Go, Sunrise, Jewels, Neptune, Midnight,...).
- **Hộp thư & Bạn bè**: Xem danh sách bạn bè, gửi moment chọn lọc (`sent_to_all: false` hoặc chọn bạn thân), thả biểu tượng cảm xúc.
- **Tự sinh chứng chỉ SSL HTTPS**: Tự động sinh chứng chỉ TLS trong thư mục `certs/` để iPhone Safari truy cập Camera/Microphone qua IP mạng nội bộ không bị chặn.

---

## 🚀 Hướng dẫn khởi động Server

### 1. Cài đặt thư viện:
```bash
npm install
```

### 2. Khởi động máy chủ:
```bash
npm start
```
Khi khởi động, console sẽ hiển thị địa chỉ IP nội mạng của máy tính bạn (ví dụ):
```
⚡ Locket VIP (HTTP):  http://localhost:3000 | http://192.168.1.13:3000
🔒 Locket VIP (HTTPS): https://localhost:3443 | https://192.168.1.13:3443
📲 Cài lên iPhone: Mở https://192.168.1.13:3443/install.mobileconfig trên Safari
```

---

## 📲 Hướng dẫn cài đặt lên iPhone qua IP / DNS nội mạng

1. **Kết nối chung mạng WiFi**: Đảm bảo iPhone và máy tính đang cùng kết nối chung một mạng WiFi.
2. **Mở Safari trên iPhone**: Nhập địa chỉ HTTPS của server:
   ```
   https://<IP_MÁY_TÍNH>:3443
   ```
   *(Ví dụ: `https://192.168.1.13:3443`)*
3. **Cài đặt WebClip Profile**:
   - Bấm vào nút **"📲 Cài lên iPhone"** hoặc truy cập thẳng `https://<IP_MÁY_TÍNH>:3443/install.mobileconfig`.
   - Bấm **Cho phép** tải hồ sơ cấu hình về máy.
   - Mở **Cài đặt (Settings)** trên iPhone -> Bấm vào dòng **Đã tải về hồ sơ (Profile Downloaded)** ở ngay đầu -> Bấm **Cài đặt (Install)** ở góc phải trên.
4. **Tin cậy chứng chỉ Root CA (để cấp quyền Camera trên iOS)**:
   - Vào **Cài đặt (Settings)** -> **Cài đặt chung (General)** -> **Giới thiệu (About)**.
   - Kéo xuống dưới cùng chọn **Cài đặt tin cậy chứng nhận (Certificate Trust Settings)**.
   - Bật công tắc xanh cho **"Locket VIP Root CA"**.
5. **Mở App từ màn hình chính**: Icon **Locket VIP** sẽ xuất hiện trên màn hình chính của iPhone, mở lên toàn màn hình không có thanh địa chỉ Safari, cấp quyền Camera và sử dụng đầy đủ 100% tính năng VIP!

---

## 🧪 Chạy kiểm thử tự động
```bash
npm test
# hoặc chạy full E2E suite:
node tests/test-e2e-suite.js
```
