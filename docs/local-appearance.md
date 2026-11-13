# Tạo diện mạo trên máy

Trong **Tạo diện mạo**, chọn:

- **Ghép hóa trang**: Noel hoặc người lốp xe vẽ bằng canvas, đặt theo khuôn mặt; không dùng API. Cần mạng lần đầu để tải nhận diện khuôn mặt. Đây là hình ghép minh họa, không phải ảnh chụp trang phục thật.
- **AI trên máy**: InstructPix2Pix chỉnh ảnh theo mô tả Noel/người lốp xe. Ảnh không gửi tới Gemini/OpenAI. Mô hình có thể thay đổi nét mặt, chưa hỗ trợ ảnh mẫu và không bảo đảm tái tạo bộ đồ chính xác.

Máy hiện tại: RTX 3050 Laptop 4 GB. AI dùng ảnh 384×384, 15 bước và chuyển từng mô-đun giữa RAM/GPU. Mỗi lần tải lại mô hình; có thể mất vài phút. Chỉ xử lý một ảnh tại một thời điểm. Mở app qua localhost trên máy tính để dùng AI này.

Nếu cần cài lại, chạy `powershell -ExecutionPolicy Bypass -File scripts/setup-local-ai.ps1` từ thư mục dự án. Tải thư viện GPU và mô hình vài GB vào ổ D; không cần API key. Cache `.local-ai-cache` và môi trường `.venv-local-ai` không đưa vào Git. Sau khi cài xong, các lượt tạo ảnh dùng mô hình trong cache, không tải mạng.

Mô hình: https://huggingface.co/timbrooks/instruct-pix2pix
