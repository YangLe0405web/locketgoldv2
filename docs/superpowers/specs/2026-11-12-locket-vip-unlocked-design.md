# Locket VIP Unlocked Studio - Design Document

## 1. Intent & The Why
Xây dựng một phiên bản tự lưu trữ (self-hosted) độc lập cho Locket VIP Studio dựa trên mã nguồn hiện có của dự án `locket-vip-clone` và khảo sát từ ứng dụng thực tế `https://locket.elingo.app/dashboard`.
Mục tiêu là mang lại trải nghiệm ứng dụng Web/PWA di động đầy đủ tính năng, tương tác trực tiếp với API Locket/Firebase, đồng thời **mở khóa 100% các tính năng vốn bị giới hạn hoặc yêu cầu donate** (Dual Cam, GIF, Custom Frames, Photobooth đa layout & hẹn giờ). Ngoài ra, hệ thống cho phép cài đặt WebClip Profile lên iPhone qua IP mạng nội bộ với chứng chỉ HTTPS tự động để dùng được camera trên iOS Safari.

---

## 2. Goals, Non-Goals & Anti-Goals
### Goals:
- Hoàn thiện toàn bộ logic frontend trong `public/app.js` và tối ưu `public/index.html` theo kiến trúc SPA mượt mà như app native.
- Mở khóa toàn bộ tính năng VIP:
  - **Dual Camera**: Hỗ trợ 2 chế độ hiển thị: PiP (Picture-in-Picture) và Split (chia đôi trên/dưới), tự động fallback sang Sequential Dual Shot (chụp sau rồi tự đảo chụp trước cực nhanh) nếu trình duyệt không cấp 2 camera cùng lúc.
  - **Ảnh động GIF**: Quay chuỗi khung hình liên tục và xuất thành short looping MP4 video (kèm `thumbnail_url` poster) chuẩn Locket Widget thông qua `canvas.captureStream` và `MediaRecorder` gốc của trình duyệt (không cần thư viện WASM nặng nề).
  - **Photobooth nâng cao**: Mở khóa 6 loại bố cục lưới (Dọc 1×2, Dọc 1×3, Dọc 1×4, Lưới 2×2, Lưới 2×3, Lưới 3×3) và 5 mốc hẹn giờ chụp (2s, 3s, 5s, 7s, 10s) với canvas compositor ghép ảnh tự động.
  - **Khung ảnh tùy chỉnh (Custom Frames)**: Cho phép tải khung viền PNG/SVG tùy chỉnh và chọn các khung mẫu có sẵn.
  - **14 Giao diện màu (Themes)** phong cách Locket Gold (Gold, Hot To Go, Sunrise, Jewels, Midnight,...).
- Đầy đủ 5 tab điều hướng:
  1. **Camera Studio**: Chụp/Quay/Upload/Photobooth/Dual/GIF/Caption gradient/Stickers/Audience.
  2. **Bảng tin (Feed)**: Khoảnh khắc bạn bè, xem ảnh/video, thả cảm xúc emoji nhanh (`/api/react`).
  3. **Kỷ niệm (Memories)**: Lịch thống kê, số lượng Lockets và chuỗi ngày (Streaks).
  4. **Hộp thư (Messages)**: Danh sách bạn bè, tương tác phản hồi khoảnh khắc.
  5. **Cài đặt & Hồ sơ**: Thông tin tài khoản (UID, Avatar), đổi theme, cài profile iOS, đăng xuất.
- Backend `server.js` hỗ trợ tự sinh chứng chỉ Root CA cố định lưu tại `certs/`, mở cổng HTTPS (3443) và HTTP (3000), tự phát hiện LAN IP máy tính.
- Nút tải `/install.mobileconfig` tích hợp sẵn payload Root Certificate (`com.apple.security.root`) kèm WebClip (`com.apple.webClip.managed`), giúp iPhone cài đặt và tin cậy chứng chỉ để chạy WebClip toàn màn hình có quyền Camera/Mic mà không bị lỗi SSL.

### Non-Goals:
- Không can thiệp hoặc bẻ khóa hệ thống server gốc của Locket/Firebase ngoài phạm vi các API hợp lệ mà Locket client sử dụng.
- Không tích hợp cổng thanh toán / donate SePay (toàn bộ tính năng mở khóa vĩnh viễn miễn phí cho người dùng).

### Anti-Goals:
- Không bắt buộc người dùng phụ thuộc vào dịch vụ proxy hay tunnel trả phí từ bên ngoài nếu chỉ sử dụng trong mạng WiFi gia đình.
- Tránh làm vỡ các trường dữ liệu tiêu chuẩn mà Locket API yêu cầu (ví dụ kích thước thumbnail, MD5 hash, Firebase storage token).

---

## 3. Constraints
- **iOS Safari WebRTC Constraint**: iOS Safari chỉ cho phép truy cập Camera/Microphone (`navigator.mediaDevices.getUserMedia`) trên các nguồn an toàn (`https://` hoặc `http://localhost`). Khi truy cập qua IP LAN (`http://192.168.x.x`), Safari sẽ từ chối cấp quyền camera. Do đó, backend phải phục vụ cổng **HTTPS** kèm chứng chỉ TLS tự ký và Root CA được cài qua profile iOS.

---

## 4. Approaches & Evaluation

### Approach 1: Standalone PWA + Tự sinh Root CA & HTTPS nội mạng (Được chọn)
- Backend tích hợp module tự sinh cặp khóa/chứng chỉ TLS (lưu trong `certs/` để không đổi fingerprint khi restart server). Chạy đồng thời HTTP (port 3000) và HTTPS (port 3443) trên LAN IP.
- Endpoint `/install.mobileconfig` đóng gói cả Root CA certificate (`com.apple.security.root`) và WebClip URL. Khi cài profile trên iOS, chứng chỉ được tin cậy và app mở ra như ứng dụng gốc.
- Frontend là Vanilla JS module đóng gói trong `public/app.js`, không phụ thuộc framework cồng kềnh, tải tức thì trên Safari iOS.
- *Lý do chọn*: Hoàn toàn độc lập, tốc độ cực nhanh, chạy được offline/local network, bảo mật đầy đủ cho WebRTC Camera.

### Approach 2: PWA thuần HTTP + Phụ thuộc Cloudflare Tunnel
- Server chỉ chạy HTTP 3000, yêu cầu người dùng cài đặt và mở lệnh `cloudflared tunnel` để có URL HTTPS công khai.
- *Đánh giá loại trừ*: Người dùng cần phải cài thêm CLI bên ngoài, phụ thuộc kết nối Internet và đường truyền bên thứ 3.

---

## 5. System Architecture & Detailed Design

### 5.1. Backend (`server.js`)
- **Tự động sinh và lưu trữ SSL Certificate**:
  - Tạo thư mục `certs/` nếu chưa có. Tự sinh `rootCA.key`, `rootCA.crt`, `server.key`, `server.crt` sử dụng `selfsigned` hoặc `node-forge`. Chứng chỉ có Subject Alternative Name (SAN) chứa IP LAN máy tính và `localhost`.
  - Mở cổng HTTPS (mặc định 3443) song song với cổng HTTP (3000).
- **Phát hiện LAN IP**: Quét `os.networkInterfaces()` lấy địa chỉ IPv4 nội mạng (ví dụ `192.168.1.15`) để hiển thị thông báo hướng dẫn kết nối rõ ràng trên console.
- **Dynamic `.mobileconfig` Generator**:
  - Endpoint `/install.mobileconfig`: Đọc Host header, trỏ URL WebClip về `https://${lanIp}:3443`, chèn payload Root Certificate dạng DER/PEM base64 vào mảng `PayloadContent` cùng payload `com.apple.webClip.managed`.
- **Firebase & Locket Endpoints**:
  - `/api/login` (Xác thực Firebase qua API Key)
  - `/api/refresh` (Gia hạn token tự động)
  - `/api/me` (Lấy thông tin người dùng)
  - `/api/friends` (Lấy danh sách bạn bè qua Firestore)
  - `/api/feed` (Lấy moment mới nhất `/getLatestMomentV2`)
  - `/api/post-moment` (Upload buffer lên Firebase Storage bucket `locket-img` và gọi `/postMomentV2` với overlays caption, text_color, audience recipients)
  - `/api/react`, `/api/delete-moment`, `/api/views`, `/api/user`, `/api/place`.

### 5.2. Frontend (`public/index.html` & `public/app.js`)
- **State Management**: Quản lý phiên (`idToken`, `refreshToken`, `localId`, `userProfile`, `friendsList`), lưu trữ an toàn trong `localStorage` (`locket_vip_session`).
- **Camera Controller**:
  - `startCamera({ facingMode, audio })`: Khởi tạo stream `getUserMedia`.
  - Hỗ trợ đổi camera trước/sau.
  - Hỗ trợ quay video bằng `MediaRecorder` (`video/mp4` hoặc `video/webm`).
  - Hỗ trợ Dual Cam: Stream camera chính + stream phụ (nếu thiết bị hỗ trợ) hoặc cơ chế chụp liên hoàn trước-sau siêu nhanh ghép PiP/Split trên Canvas.
- **Photobooth Engine**:
  - Cấu hình layout: 1×2 (2 ảnh), 1×3 (3 ảnh), 1×4 (4 ảnh), 2×2 (4 ảnh), 2×3 (6 ảnh), 3×3 (9 ảnh).
  - Countdown timer: 2s, 3s, 5s, 7s, 10s có âm thanh/hiệu ứng đếm ngược trực quan.
  - Tự động chụp tuần tự N ảnh, vẽ lên Canvas độ phân giải chuẩn (1080×1080) với viền bo tròn thẩm mỹ và màu nền tùy chọn.
- **GIF Recorder**:
  - Quay chuỗi 2-3 giây bằng MediaRecorder / Canvas captureStream, xuất `videoBase64` kèm `imageBase64` poster, gửi lên Locket hiển thị vòng lặp chuẩn widget.
- **Editor & Overlays**:
  - Caption dải màu tùy chọn (Gradient Start, Gradient End, Text Color).
  - Preset overlay: Thời gian thực (time), Âm nhạc (music), Vị trí địa lý (place).
  - Custom Frame: Vẽ khung viền đè lên ảnh trước khi xuất ra WebP.
  - Audience Selector: Gửi tất cả bạn bè (`sent_to_all: true`) hoặc chỉ gửi cho danh sách UID bạn bè được chọn.
- **Feed & Memories & Messages**:
  - Tab Feed: Cuộn xem các khoảnh khắc gần nhất, nút thả biểu tượng cảm xúc, phản hồi nhanh.
  - Tab Memories: Hiển thị thống kê tổng số Lockets và chuỗi ngày (Streaks).
  - Tab Messages: Liệt kê danh sách bạn bè để bắt đầu trò chuyện / phản hồi.
  - Tab More / Settings: Chọn 14 chủ đề theme màu, xem UID, tải cấu hình iPhone `.mobileconfig`, nút Đăng xuất.

---

## 6. What's Left to the Builder
- Tinh chỉnh CSS responsive để các modal sheet (bảng chọn layout Photobooth, bảng chọn khung ảnh, bảng chọn đối tượng bạn bè) hiển thị mượt mà trên Safari iOS.
- Xử lý tương thích fallback khi một số trình duyệt không hỗ trợ mở 2 camera phần cứng đồng thời (sẽ chuyển sang chế độ Sequential Dual Shot: chụp camera sau rồi tự đảo chụp camera trước ngay lập tức để ghép PiP).
