const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const app = express();

// Bắt buộc trên Render để nhận diện đúng HTTPS khi xuất file cấu hình iOS và mở Camera
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

const LOCKET_API_KEY = process.env.LOCKET_API_KEY || "";
const LOCKET_HEADERS = {
    'Content-Type': 'application/json',
    'User-Agent': 'com.locket.Locket/1.43.1 iPhone/17.4 hw/iPhone15_3'
};

// 1. API Đăng nhập bằng Email/Mật khẩu (Dùng khi có cấu hình LOCKET_API_KEY)
app.post('/api/login', async (req, res) => {
    try {
        if (!LOCKET_API_KEY) {
            return res.status(400).json({ error: 'Chưa cấu hình LOCKET_API_KEY. Hãy dùng ô Dán JSON từ tab Response!' });
        }
        const { email, password } = req.body;
        const url = `https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyPassword?key=${LOCKET_API_KEY}`;
        const response = await axios.post(url, {
            email,
            password,
            returnSecureToken: true
        }, { headers: LOCKET_HEADERS });

        res.json({
            idToken: response.data.idToken,
            refreshToken: response.data.refreshToken,
            localId: response.data.localId,
            email: response.data.email,
            displayName: response.data.displayName
        });
    } catch (error) {
        res.status(400).json({ error: error.response?.data?.error?.message || 'Đăng nhập thất bại' });
    }
});

// 2. API Làm mới Token tự động (Nếu có LOCKET_API_KEY)
app.post('/api/refresh', async (req, res) => {
    try {
        if (!LOCKET_API_KEY) {
            return res.status(200).json({ skipped: true });
        }
        const { refreshToken } = req.body;
        const url = `https://securetoken.googleapis.com/v1/token?key=${LOCKET_API_KEY}`;
        const response = await axios.post(url, {
            grant_type: 'refresh_token',
            refresh_token: refreshToken
        });
        res.json({
            idToken: response.data.id_token,
            refreshToken: response.data.refresh_token,
            localId: response.data.user_id
        });
    } catch (error) {
        res.status(200).json({ skipped: true });
    }
});

// 3. API Upload ảnh lên Firebase Storage của Locket & Bắn ra Widget
app.post('/api/post-moment', async (req, res) => {
    try {
        const { idToken, localId, imageBase64, caption, overlayType, bgColorStart, bgColorEnd, textColor } = req.body;
        if (!idToken || !localId) {
            return res.status(400).json({ error: 'Thiếu idToken hoặc localId. Vui lòng dán lại JSON đăng nhập!' });
        }

        const base64Clean = imageBase64.replace(/^data:image\/\w+;base64,/, "");
        const imageBuffer = Buffer.from(base64Clean, 'base64');
        const fileName = `${Date.now()}_vip.webp`;
        const storagePath = encodeURIComponent(`users/${localId}/moments/thumbnails/${fileName}`);

        // Bước 3.1: Khởi tạo phiên Resumable Upload lên kho ảnh Locket
        const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/locket-img/o/${storagePath}?uploadType=resumable&name=${storagePath}`;
        const initRes = await axios.post(uploadUrl, JSON.stringify({
            name: `users/${localId}/moments/thumbnails/${fileName}`,
            contentType: 'image/webp'
        }), {
            headers: {
                'Authorization': `Bearer ${idToken}`,
                'Content-Type': 'application/json; charset=UTF-8',
                'X-Goog-Upload-Protocol': 'resumable',
                'X-Goog-Upload-Command': 'start',
                'X-Goog-Upload-Header-Content-Length': imageBuffer.length,
                'X-Goog-Upload-Header-Content-Type': 'image/webp'
            }
        });

        // Bước 3.2: Đẩy dữ liệu nhị phân của ảnh lên Firebase
        const sessionUri = initRes.headers['x-goog-upload-url'];
        await axios.put(sessionUri, imageBuffer, {
            headers: {
                'Content-Type': 'application/octet-stream',
                'X-Goog-Upload-Command': 'upload, finalize',
                'X-Goog-Upload-Offset': 0
            }
        });

        // Bước 3.3: Lấy Download Token tạo link ảnh công khai
        const metaRes = await axios.get(`https://firebasestorage.googleapis.com/v0/b/locket-img/o/${storagePath}`, {
            headers: { 'Authorization': `Bearer ${idToken}` }
        });
        const downloadToken = metaRes.data.downloadTokens;
        const finalImageUrl = `https://firebasestorage.googleapis.com/v0/b/locket-img/o/${storagePath}?alt=media&token=${downloadToken}`;

        // Bước 3.4: Tạo hiệu ứng Overlay VIP (Màu Gradient, Giờ, Nhạc)
        const overlays = [];
        let finalText = caption || "";
        if (overlayType === 'time') {
            const now = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
            finalText = `🕒 ${now} ${caption ? '• ' + caption : ''}`;
        } else if (overlayType === 'music') {
            finalText = `🎵 ${caption || 'Locket VIP Audio'}`;
        }

        if (finalText.trim() !== '') {
            overlays.push({
                data: {
                    text: finalText,
                    text_color: textColor || "#FFFFFFE6",
                    type: "standard",
                    max_lines: 4,
                    background: {
                        material_blur: "ultra_thin",
                        colors: (bgColorStart && bgColorEnd) ? [bgColorStart, bgColorEnd] : []
                    }
                },
                alt_text: finalText,
                overlay_id: "caption:standard",
                overlay_type: "caption"
            });
        }

        // Bước 3.5: Gọi postMomentV2 để hiển thị ảnh lên Widget bạn bè
        const postRes = await axios.post('https://api.locketcamera.com/postMomentV2', {
            data: {
                thumbnail_url: finalImageUrl,
                caption: finalText,
                sent_to_all: true,
                overlays: overlays
            }
        }, {
            headers: {
                ...LOCKET_HEADERS,
                'Authorization': `Bearer ${idToken}`
            }
        });

        res.json({ success: true, result: postRes.data });
    } catch (error) {
        res.status(500).json({ error: error.response?.data || error.message });
    }
});

// 4. API Tạo file cấu hình .mobileconfig (Cài trực tiếp vào Cài đặt iPhone như DNS)
app.get('/install.mobileconfig', (req, res) => {
    const host = req.get('host');
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const appUrl = `${protocol}://${host}`;
    const profileUuid = uuidv4();
    const webclipUuid = uuidv4();

    const mobileConfigXml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>PayloadContent</key>
    <array>
        <dict>
            <key>FullScreen</key>
            <true/>
            <key>IgnoreManifestScope</key>
            <true/>
            <key>IsRemovable</key>
            <true/>
            <key>Label</key>
            <string>Locket VIP</string>
            <key>PayloadDescription</key>
            <string>Web Clip Locket Photobooth &amp; Filter VIP</string>
            <key>PayloadDisplayName</key>
            <string>Locket VIP App</string>
            <key>PayloadIdentifier</key>
            <string>com.locketvip.webclip.${webclipUuid}</string>
            <key>PayloadType</key>
            <string>com.apple.webClip.managed</string>
            <key>PayloadUUID</key>
            <string>${webclipUuid}</string>
            <key>PayloadVersion</key>
            <integer>1</integer>
            <key>Precomposed</key>
            <true/>
            <key>URL</key>
            <string>${appUrl}</string>
        </dict>
    </array>
    <key>PayloadDescription</key>
    <string>Cấu hình mở khóa Locket Photobooth, Filter AI và Caption Gradient</string>
    <key>PayloadDisplayName</key>
    <string>Locket VIP Configuration</string>
    <key>PayloadIdentifier</key>
    <string>com.locketvip.profile.${profileUuid}</string>
    <key>PayloadOrganization</key>
    <string>Yang Lee Studio</string>
    <key>PayloadRemovalDisallowed</key>
    <false/>
    <key>PayloadType</key>
    <string>Configuration</string>
    <key>PayloadUUID</key>
    <string>${profileUuid}</string>
    <key>PayloadVersion</key>
    <integer>1</integer>
</dict>
</plist>`;

    res.setHeader('Content-Type', 'application/x-apple-aspen-config');
    res.setHeader('Content-Disposition', 'attachment; filename="LocketVIP.mobileconfig"');
    res.send(mobileConfigXml);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server chạy tại: http://localhost:${PORT}`));