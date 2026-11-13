const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');
const selfsigned = require('selfsigned');
const { v4: uuidv4 } = require('uuid');

const localEnv = path.join(__dirname, '.env');
if (fs.existsSync(localEnv)) process.loadEnvFile(localEnv);

const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '70mb' }));
require('./local-ai')(app);
app.use(express.static('public'));
app.get('/vendor/gifenc.js', (_, res) => res.sendFile(path.join(__dirname, 'node_modules/gifenc/dist/gifenc.esm.js')));
app.get('/vendor/tf.js', (_, res) => res.sendFile(path.join(__dirname, 'node_modules/@tensorflow/tfjs/dist/tf.min.js')));
app.get('/vendor/mobilenet.js', (_, res) => res.sendFile(path.join(__dirname, 'node_modules/@tensorflow-models/mobilenet/dist/mobilenet.min.js')));
app.get('/vendor/blazeface.js', (_, res) => res.sendFile(path.join(__dirname, 'node_modules/@tensorflow-models/blazeface/dist/blazeface.min.umd.js')));

const FIREBASE_API_KEY = process.env.LOCKET_API_KEY || 'AIzaSyCQngaaXQIfJaH0aS2l7REgIjD7nL431So';
const LOCKET_API = 'https://api.locketcamera.com';
const FIRESTORE = 'https://firestore.googleapis.com/v1/projects/locket-4252a/databases/(default)/documents';
const BUCKET = 'locket-img';

const LOCKET_HEADERS = {
    'Content-Type': 'application/json',
    'User-Agent': 'com.locket.Locket/1.100.0 iPhone/18.2 hw/iPhone16_2',
    'X-Ios-Bundle-Identifier': 'com.locket.Locket'
};

function fail(res, error, status = 400) {
    const data = error.response?.data;
    const message = data?.error?.message
        || data?.error
        || (typeof data === 'string' ? data : null)
        || error.message
        || 'Yêu cầu thất bại';
    res.status(status).json({ error: message, detail: data || null });
}

function authHeaders(idToken) {
    return idToken ? { ...LOCKET_HEADERS, Authorization: `Bearer ${idToken}` } : LOCKET_HEADERS;
}

async function locketPost(path, idToken, data) {
    const response = await axios.post(`${LOCKET_API}${path}`, { data }, {
        headers: authHeaders(idToken),
        timeout: 30000,
        validateStatus: () => true
    });
    const result = response.data?.result;
    const status = Number(result?.status);
    if (response.status < 400 && status >= 400 && status <= 599) response.status = status;
    const detail = response.data?.error || (Array.isArray(result?.errors) ? result.errors[0] : result?.errors);
    if (/unauthenticated|missing or invalid authentication/i.test(detail?.message || String(detail || ''))) {
        response.status = 401;
    }
    return response;
}

async function uploadBuffer({ idToken, localId, objectPath, buffer, contentType, bucket = BUCKET }) {
    let stage = 'Khởi tạo tải ảnh';
    try {
    const encoded = encodeURIComponent(objectPath);
    const start = await axios.post(
        `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encoded}?uploadType=resumable&name=${encoded}`,
        { bucket: '', name: objectPath, contentType,
            metadata: { visibility: 'private', creator: localId },
            cacheControl: 'public, max-age=604800' },
        {
            headers: {
                Authorization: `Firebase ${idToken}`,
                'Content-Type': 'application/json; charset=UTF-8',
                'X-Goog-Upload-Protocol': 'resumable',
                'X-Goog-Upload-Command': 'start',
                'X-Goog-Upload-Content-Length': String(buffer.length),
                'X-Goog-Upload-Content-Type': contentType,
                'X-Firebase-Storage-Version': 'ios/12.12.1',
                'X-Firebase-Gmpid': '1:641029076083:ios:cc8eb46290d69b234fa606',
                'User-Agent': `${LOCKET_HEADERS['User-Agent']} (GTMSUF/1)`
            },
            timeout: 30000
        }
    );

    const sessionUri = start.headers['x-goog-upload-url'];
    if (!sessionUri) throw new Error('Firebase không trả phiên upload');

    stage = 'Truyền dữ liệu ảnh/video';
    const uploaded = await axios.put(sessionUri, buffer, {
        headers: {
            'Content-Type': 'application/octet-stream',
            'X-Goog-Upload-Protocol': 'resumable',
            'X-Goog-Upload-Content-Length': String(buffer.length),
            'X-Goog-Upload-Command': 'upload, finalize',
            'X-Goog-Upload-Offset': '0'
        },
        timeout: 60000,
        maxBodyLength: Infinity
    });

    stage = 'Lấy liên kết ảnh/video';
    let tokens = uploaded.data?.downloadTokens;
    if (!tokens) {
        const meta = await axios.get(
            `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encoded}`,
            { headers: { Authorization: `Firebase ${idToken}` }, timeout: 20000 }
        );
        tokens = meta.data?.downloadTokens;
    }
    const token = String(tokens || '').split(',')[0];
    if (!token) throw new Error('Firebase chưa trả liên kết tải ảnh.');
    return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encoded}?alt=media&token=${encodeURIComponent(token)}`;
    } catch (error) {
        const detail = error.response?.data?.error?.message || error.message;
        const wrapped = new Error(`${stage}: ${detail}`);
        wrapped.response = { status: error.response?.status || 502, data: { error: { message: wrapped.message } } };
        throw wrapped;
    }
}

function decodeDataUrl(dataUrl) {
    const match = String(dataUrl || '').match(/^data:([^;,]+)(?:;[^;,]+)*;base64,(.+)$/s);
    if (!match) return { contentType: 'application/octet-stream', buffer: Buffer.from(String(dataUrl || ''), 'base64') };
    return { contentType: match[1], buffer: Buffer.from(match[2], 'base64') };
}

const portraitStyles = new Map([
    ['anime', 'Turn the subject into a hand-drawn anime portrait with expressive linework and soft cel shading.'],
    ['clay', 'Render the subject as a stylized stop-motion clay character with tactile clay textures and soft studio light.'],
    ['idol', 'Give the subject a realistic pop-idol makeover with editorial hair styling, makeup and studio lighting.'],
    ['fantasy', 'Give the subject a fantasy royal makeover with a crown, ornate costume and warm cinematic lighting.']
]);

app.post('/api/ai/transform', async (req, res) => {
    const remote = req.socket.remoteAddress;
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)) {
        return res.status(403).json({ error: 'Mở Studio bằng localhost trên máy chạy server để tạo ảnh AI.' });
    }
    if (req.get('Sec-Fetch-Site') && req.get('Sec-Fetch-Site') !== 'same-origin') {
        return res.status(403).json({ error: 'Hãy tạo ảnh trực tiếp trong Studio.' });
    }
    const { image, reference, style } = req.body || {};
    const validImage = value => typeof value === 'string' && value.length <= 8_000_000 &&
        /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
    const instruction = portraitStyles.get(style);
    if (!validImage(image) || (reference && !validImage(reference)) || (!instruction && !(style === 'reference' && reference))) {
        return res.status(400).json({ error: 'Chọn một ảnh gốc và một kiểu biến hình hoặc ảnh mẫu hợp lệ.' });
    }
    const useOpenAI = process.env.IMAGE_API_PROVIDER === 'openai';
    const key = useOpenAI
        ? process.env.OPENAI_API_KEY?.trim()
        : process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
    if (!key) {
        const name = useOpenAI ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY';
        return res.status(503).json({ error: `Thêm ${name} vào .env rồi khởi động lại Studio.` });
    }
    try {
        const images = [image, reference].filter(Boolean).map(image_url => ({ image_url }));
        const prompt = [
            'Edit the person in the first image, preserving their recognizable identity, pose and framing.',
            instruction || 'Transform their outfit, hair, makeup and visual style to match the second image.',
            reference && 'Use the second image only as an appearance and style reference. Keep the person from the first image.',
            'Return one finished image.'
        ].filter(Boolean).join(' ');
        if (!useOpenAI) {
            const model = encodeURIComponent(process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image');
            const parts = [image, reference].filter(Boolean).map(value => {
                const { contentType, buffer } = decodeDataUrl(value);
                return { inlineData: { mimeType: contentType, data: buffer.toString('base64') } };
            });
            const { data } = await axios.post(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`, {
                contents: [{ parts: [{ text: prompt }, ...parts] }],
                generationConfig: { responseModalities: ['IMAGE'] }
            }, { headers: { 'x-goog-api-key': key }, timeout: 180000 });
            const result = data.candidates?.flatMap(candidate => candidate.content?.parts || [])
                .filter(part => !part.thought)
                .map(part => part.inlineData)
                .find(part => part?.data && ['image/png', 'image/jpeg', 'image/webp'].includes(part.mimeType));
            if (!result) return res.status(502).json({ error: 'Gemini không trả về ảnh. Hãy thử ảnh hoặc kiểu biến hình khác.' });
            return res.json({ image: `data:${result.mimeType};base64,${result.data}` });
        }
        const { data } = await axios.post('https://api.openai.com/v1/images/edits', {
            model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
            images, prompt, size: '1024x1024', quality: 'medium', output_format: 'webp'
        }, { headers: { Authorization: `Bearer ${key}` }, timeout: 180000 });
        const result = data.data?.[0]?.b64_json;
        if (!result) return res.status(502).json({ error: 'AI chưa trả về ảnh. Hãy thử lại.' });
        res.json({ image: `data:image/webp;base64,${result}` });
    } catch (error) {
        const status = error.response?.status;
        const details = error.response?.data?.error?.details;
        const reasons = Array.isArray(details) ? details.map(detail => detail.reason) : [];
        const quotaViolations = Array.isArray(details)
            ? details.flatMap(detail => Array.isArray(detail.violations) ? detail.violations : [])
            : [];
        const hasZeroQuota = quotaViolations.some(violation => ['0', 0].includes(violation.quotaValue));
        const retryDelay = Array.isArray(details) ? details.find(detail => /^\d+(\.\d+)?s$/.test(detail.retryDelay || ''))?.retryDelay : undefined;
        const quotaMessage = hasZeroQuota
            ? 'Hạn mức tạo ảnh của project cho mô hình này là 0. Kiểm tra hạn mức và thanh toán trong Google AI Studio.'
            : retryDelay
                ? `Gemini đang giới hạn yêu cầu. Thử lại sau ít nhất ${Math.ceil(parseFloat(retryDelay))} giây.`
                : 'Gemini từ chối vì giới hạn yêu cầu hoặc hạn mức. Kiểm tra mục Usage trong Google AI Studio.';
        const message = status === 429 ? (useOpenAI ? 'OpenAI đang giới hạn yêu cầu hoặc hết hạn mức.' : quotaMessage)
            : useOpenAI && (status === 401 || error.response?.data?.error?.code === 'invalid_api_key') ? 'OpenAI từ chối OPENAI_API_KEY. Thay khóa trong .env rồi khởi động lại Studio.'
            : reasons.some(reason => /^API_KEY_/.test(reason || '')) ? 'Google từ chối khóa Gemini. Kiểm tra khóa còn hiệu lực và được phép dùng Gemini API.'
            : status === 401 || status === 403 ? 'Kiểm tra quyền dùng mô hình chỉnh ảnh và thiết lập thanh toán của project.'
            : status === 404 ? 'Không tìm thấy mô hình chỉnh ảnh. Kiểm tra tên mô hình và quyền truy cập.'
            : status === 400 ? 'API không xử lý được ảnh hoặc kiểu biến hình đã chọn.'
            : 'Không nhận được ảnh từ AI. Hãy thử lại.';
        res.status(status === 429 ? 429 : 502).json({ error: message });
    }
});

function buildOverlays({ caption, overlayType, bgColorStart, bgColorEnd, textColor, place }) {
    let text = (caption || '').trim();
    if (overlayType === 'time') {
        const now = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        text = text ? `${now}  •  ${text}` : now;
    } else if (overlayType === 'music') {
        text = text ? `♪  ${text}` : '♪  Đang nghe';
    } else if (overlayType === 'place' && place) {
        text = text ? `${place}  •  ${text}` : place;
    }
    if (!text) return { text: '', overlays: [] };
    return {
        text,
        overlays: [{
            overlay_id: 'caption:standard',
            overlay_type: 'caption',
            alt_text: text,
            data: {
                text,
                text_color: textColor || '#FFFFFFE6',
                type: 'standard',
                max_lines: 4,
                background: {
                    material_blur: 'ultra_thin',
                    colors: (bgColorStart && bgColorEnd) ? [bgColorStart, bgColorEnd] : []
                }
            }
        }]
    };
}

app.post('/api/login', async (req, res) => {
    try {
        const { email, phone, password } = req.body || {};
        if ((!email && !phone) || !password) return res.status(400).json({ error: 'Nhập email hoặc số điện thoại và mật khẩu Locket.' });
        let method = 'verifyPassword';
        let credentials = { email, password };
        if (phone) {
            if (!/^\+[1-9]\d{7,14}$/.test(phone)) return res.status(400).json({ error: 'Nhập số điện thoại kèm mã quốc gia, ví dụ +84.' });
            const signed = await locketPost('/signInWithPhonePassword', null, { phone, password });
            const token = signed.data?.result?.token;
            if (!token) {
                return res.status(signed.status >= 400 ? signed.status : 401).json({ error: signed.data?.result?.errors?.[0] || 'Locket từ chối đăng nhập bằng số điện thoại.' });
            }
            method = 'verifyCustomToken';
            credentials = { token };
        }
        const response = await axios.post(
            `https://www.googleapis.com/identitytoolkit/v3/relyingparty/${method}?key=${FIREBASE_API_KEY}`,
            { ...credentials, returnSecureToken: true, clientType: 'CLIENT_TYPE_IOS' },
            { headers: LOCKET_HEADERS, timeout: 20000 }
        );
        const data = response.data;
        res.json({
            idToken: data.idToken,
            refreshToken: data.refreshToken,
            localId: data.localId || tokenUserId(data.idToken),
            email: data.email,
            displayName: data.displayName || '',
            photoUrl: data.profilePicture || '',
            expiresIn: Number(data.expiresIn || 3600)
        });
    } catch (error) {
        const code = error.response?.data?.error?.message;
        if (['EMAIL_NOT_FOUND', 'INVALID_PASSWORD', 'INVALID_LOGIN_CREDENTIALS'].includes(code)) {
            return res.status(401).json({ error: 'Thông tin đăng nhập chưa đúng. Dùng email hoặc số điện thoại đã liên kết với Locket.' });
        }
        if (!error.response) return res.status(502).json({ error: 'Máy chủ chưa kết nối được với dịch vụ đăng nhập Locket.' });
        res.status(error.response.status).json({ error: code || 'Locket từ chối đăng nhập.' });
    }
});

app.post('/api/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body || {};
        if (!refreshToken) return res.status(400).json({ error: 'Thiếu refreshToken' });
        const response = await axios.post(
            `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`,
            new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 20000 }
        );
        res.json({
            idToken: response.data.id_token,
            refreshToken: response.data.refresh_token,
            localId: response.data.user_id,
            expiresIn: Number(response.data.expires_in || 3600)
        });
    } catch (error) {
        fail(res, error);
    }
});

app.post('/api/me', async (req, res) => {
    try {
        const { idToken } = req.body || {};
        if (!idToken) return res.status(400).json({ error: 'Thiếu idToken' });
        const response = await axios.post(
            `https://www.googleapis.com/identitytoolkit/v3/relyingparty/getAccountInfo?key=${FIREBASE_API_KEY}`,
            { idToken },
            { headers: LOCKET_HEADERS, timeout: 20000 }
        );
        const user = response.data.users?.[0] || {};
        let gold = false;
        try {
            const attrs = JSON.parse(user.customAttributes || '{}');
            const entitlements = attrs.revenueCatEntitlements || attrs.entitlements || [];
            gold = Array.isArray(entitlements) && entitlements.some((item) => /gold/i.test(String(item)));
        } catch (_) { /* tài khoản thường không có customAttributes */ }
        res.json({
            localId: user.localId,
            email: user.email || '',
            displayName: user.displayName || '',
            photoUrl: user.photoUrl || '',
            gold
        });
    } catch (error) {
        fail(res, error);
    }
});

app.post('/api/post-moment', async (req, res) => {
    try {
        const body = req.body || {};
        const { idToken } = body;
        if (!idToken) return res.status(401).json({ error: 'Bạn cần đăng nhập lại' });
        if (!body.imageBase64 && !body.videoBase64) return res.status(400).json({ error: 'Chưa có ảnh hoặc video' });
        if (body.videoBase64 && !body.imageBase64) return res.status(400).json({ error: 'Video cần ảnh bìa' });

        // Resolve ownership from Firebase, not an old UID cached by the browser.
        let localId;
        try {
            let account;
            try {
                account = await axios.post(
                    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
                    { idToken }, { headers: LOCKET_HEADERS, timeout: 12000 }
                );
            } catch (error) {
                // Retry only read-only lookup on a transport/server failure.
                if (error.response && error.response.status < 500) throw error;
                account = await axios.post(
                    `https://www.googleapis.com/identitytoolkit/v3/relyingparty/getAccountInfo?key=${FIREBASE_API_KEY}`,
                    { idToken }, { headers: LOCKET_HEADERS, timeout: 12000 }
                );
            }
            localId = account.data.users?.[0]?.localId;
            if (!localId) return res.status(401).json({ error: 'Phiên Locket không xác định được tài khoản. Hãy đăng nhập lại.' });
        } catch (error) {
            const code = error.response?.data?.error?.message || '';
            if (/INVALID_ID_TOKEN|TOKEN_EXPIRED|USER_DISABLED|USER_NOT_FOUND|CREDENTIAL_TOO_OLD/.test(code)) {
                return res.status(401).json({ error: 'Phiên Locket hết hạn hoặc không còn hợp lệ. Hãy đăng nhập lại.' });
            }
            const networkErrors = {
                ECONNABORTED: 'Firebase phản hồi quá chậm (timeout).',
                ETIMEDOUT: 'Kết nối Firebase quá thời gian chờ.',
                ENOTFOUND: 'Không tìm được địa chỉ Firebase (DNS).',
                EAI_AGAIN: 'Tra cứu DNS của Firebase đang lỗi.',
                ECONNRESET: 'Kết nối tới Firebase bị ngắt.',
                ECONNREFUSED: 'Kết nối tới Firebase bị từ chối.'
            };
            let message = networkErrors[error.code];
            if (!message && error.response) {
                if (/API_KEY|blocked|PERMISSION_DENIED/i.test(code)) {
                    message = 'Firebase từ chối cấu hình API hoặc nhận dạng ứng dụng Locket.';
                } else {
                    // Expose only the error identifier, never tokens, request headers or URLs with keys.
                    const identifier = code.match(/^[A-Z][A-Z0-9_]{2,80}(?=\s|:|$)/)?.[0];
                    message = `Firebase trả HTTP ${error.response.status}${identifier ? ` (${identifier})` : ''}.`;
                }
            }
            return res.status(502).json({ error: `Chưa xác minh được phiên đăng nhập. ${message || 'Không kết nối được Firebase.'} Ảnh vẫn được giữ để bạn thử gửi lại hoặc tải về.` });
        }

        const captionPack = buildOverlays(body);
        const audience = body.audience || 'all';
        const picked = Array.isArray(body.recipients) ? body.recipients.filter(Boolean) : [];
        const payload = {
            caption: captionPack.text,
            sent_to_all: audience === 'all',
            sent_to_self_only: audience === 'private',
            recipients: audience === 'selected' ? picked : [],
            overlays: captionPack.overlays
        };

        if (body.imageBase64) {
            const image = decodeDataUrl(body.imageBase64);
            const ext = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' }[image.contentType];
            if (!ext) return res.status(400).json({ error: 'Định dạng ảnh bìa không được hỗ trợ' });
            const imagePath = `users/${localId}/moments/thumbnails/${crypto.randomBytes(10).toString('hex')}.${ext}`;
            payload.thumbnail_url = await uploadBuffer({
                idToken,
                localId,
                objectPath: imagePath,
                buffer: image.buffer,
                contentType: image.contentType
            });
            payload.md5 = crypto.createHash('md5').update(image.buffer).digest('hex');
        }

        if (body.videoBase64) {
            const video = decodeDataUrl(body.videoBase64);
            const ext = video.contentType.includes('mp4') ? 'mp4' : video.contentType === 'video/quicktime' ? 'mov' : 'webm';
            const videoPath = `users/${localId}/moments/videos/${crypto.randomBytes(10).toString('hex')}.${ext}`;
            payload.video_url = await uploadBuffer({
                idToken,
                localId,
                bucket: 'locket-video',
                objectPath: videoPath,
                buffer: video.buffer,
                contentType: video.contentType.includes('mp4') ? 'video/mp4' : video.contentType
            });
            payload.md5 = crypto.createHash('md5').update(video.buffer).digest('hex');
        }

        const posted = await locketPost('/postMomentV2', idToken, payload);
        if (posted.status >= 400 || posted.data?.error || posted.data?.result?.errors?.length) {
            const errors = posted.data?.result?.errors;
            return res.status(posted.status >= 400 ? posted.status : 502).json({
                error: 'Tạo bài đăng trên Locket: ' + (posted.data?.error?.message || (Array.isArray(errors) ? errors[0]?.message || errors[0] : errors) || 'Locket từ chối đăng ảnh.')
            });
        }
        res.json({ success: true, result: posted.data });
    } catch (error) {
        if (error.response?.status === 403) {
            return res.status(403).json({ error: `${error.message} Phiên đăng nhập đã được Firebase xác minh, nhưng Storage vẫn từ chối quyền tải lên.` });
        }
        fail(res, error, error.response?.status || 502);
    }
});

app.post('/api/feed', async (req, res) => {
    try {
        const { idToken, syncToken, users } = req.body || {};
        if (!idToken) return res.status(401).json({ error: 'Bạn cần đăng nhập lại' });
        const data = {
            excluded_users: [],
            include_group_moments: true,
            fetch_streak: true,
            should_count_missed_moments: true
        };
        if (Array.isArray(users) && users.length) {
            data.users = users.filter(uid => typeof uid === 'string' && /^[\w-]{1,128}$/.test(uid)).slice(0, 200);
        }
        if (syncToken) data.sync_token = syncToken;
        const posted = await locketPost('/getLatestMomentV2', idToken, data);
        const status = Number(posted.data?.result?.status);
        res.status(posted.status >= 400 ? posted.status : status >= 400 && status <= 599 ? status : 200).json(posted.data);
    } catch (error) {
        fail(res, error, 500);
    }
});

app.post('/api/react', async (req, res) => {
    try {
        const { idToken, momentUid, reaction } = req.body || {};
        if (!idToken || !momentUid || !reaction) return res.status(400).json({ error: 'Thiếu moment hoặc nội dung cảm xúc' });
        const posted = await locketPost('/reactToMoment', idToken, {
            moment_uid: momentUid, reaction, from_memory: false,
            intensity: { '@type': 'type.googleapis.com/google.protobuf.Int64Value', value: '0' }
        });
        res.status(posted.status >= 400 ? posted.status : 200).json(posted.data);
    } catch (error) {
        fail(res, error, 500);
    }
});

app.post('/api/delete-moment', async (req, res) => {
    try {
        const { idToken, momentUid, ownerUid } = req.body || {};
        if (!idToken || !momentUid || !ownerUid) return res.status(400).json({ error: 'Thiếu thông tin moment' });
        const posted = await locketPost('/deleteMomentV2', idToken, {
            moment_uid: momentUid,
            owner_uid: ownerUid,
            delete_globally: true
        });
        res.status(posted.status >= 400 ? posted.status : 200).json(posted.data);
    } catch (error) {
        fail(res, error, 500);
    }
});

app.post('/api/views', async (req, res) => {
    try {
        const { idToken, momentUid } = req.body || {};
        if (!idToken || !momentUid) return res.status(400).json({ error: 'Thiếu moment' });
        const posted = await locketPost('/getMomentViews', idToken, { moment_uid: momentUid });
        res.status(posted.status >= 400 ? posted.status : 200).json(posted.data);
    } catch (error) {
        fail(res, error, 500);
    }
});

app.post('/api/user', async (req, res) => {
    try {
        const { idToken, userUid } = req.body || {};
        if (!idToken || !userUid) return res.status(400).json({ error: 'Thiếu uid' });
        const posted = await locketPost('/fetchUserV2', idToken, { user_uid: userUid });
        res.status(posted.status >= 400 ? posted.status : 200).json(posted.data);
    } catch (error) {
        fail(res, error, 500);
    }
});

app.post('/api/friends', async (req, res) => {
    try {
        const { idToken, localId = tokenUserId(idToken) } = req.body || {};
        if (!idToken) return res.status(401).json({ error: 'Bạn cần đăng nhập lại' });
        const upstream = await locketPost('/getFriendsV2', idToken, {}).catch(() => null);
        const result = upstream?.data?.result || upstream?.data;
        const list = [result?.friends, result?.data?.friends, result?.data, result].find(Array.isArray);
        if (upstream && upstream.status < 400 && !(result?.status >= 400) && !result?.errors?.length && list) {
            const friends = list.map(friend => ({
                uid: typeof friend === 'string' ? friend : friend?.uid || friend?.user_id || friend?.user?.uid || friend?.user,
                name: [friend?.first_name, friend?.last_name].filter(Boolean).join(' ') || friend?.display_name || '',
                username: friend?.username || '',
                photoUrl: friend?.profile_picture_url || ''
            })).filter(friend => typeof friend.uid === 'string' && friend.uid);
            if (friends.length || !list.length) return res.json({ friends });
        }
        if (!localId) return res.status(502).json({ error: 'Không tải được bạn bè. Hãy đăng nhập lại bằng tài khoản Locket.' });
        const listed = await axios.get(`${FIRESTORE}/users/${encodeURIComponent(localId)}/friends?pageSize=200`, {
            headers: { Authorization: `Bearer ${idToken}` },
            timeout: 20000,
            validateStatus: () => true
        });
        if (listed.status >= 400) {
            return res.status(listed.status).json({ error: listed.data?.error?.message || 'Không đọc được danh sách bạn' });
        }
        const friends = (listed.data.documents || []).map((doc) => {
            const parts = String(doc.name || '').split('/');
            const uid = doc.fields?.user?.stringValue || parts[parts.length - 1];
            return {
                uid,
                name: [doc.fields?.first_name?.stringValue, doc.fields?.last_name?.stringValue].filter(Boolean).join(' '),
                username: doc.fields?.username?.stringValue || '',
                photoUrl: doc.fields?.profile_picture_url?.stringValue || ''
            };
        }).filter((friend) => friend.uid);
        for (let start = 0; start < friends.length; start += 6) {
            await Promise.all(friends.slice(start, start + 6).filter(friend => !friend.name).map(async friend => {
                const profile = await locketPost('/fetchUserV2', idToken, { user_uid: friend.uid }).catch(() => null);
                const data = profile?.data?.result?.data;
                if (!data) return;
                friend.name = [data.first_name, data.last_name].filter(Boolean).join(' ');
                friend.username = data.username || friend.username;
                friend.photoUrl = data.profile_picture_url || friend.photoUrl;
            }));
        }
        res.json({ friends });
    } catch (error) {
        fail(res, error, 500);
    }
});

function tokenUserId(token) {
    try {
        return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).sub;
    } catch {
        return null;
    }
}

app.post('/api/chat/inbox', async (req, res) => {
    const { idToken, localId = tokenUserId(idToken) } = req.body || {};
    if (!idToken || !localId) return res.status(401).json({ error: 'Bạn cần đăng nhập lại' });
    try {
        const conversations = [];
        let pageToken;
        do {
            const { data } = await axios.get(`${FIRESTORE}/users/${encodeURIComponent(localId)}/conversations`, {
                headers: { Authorization: `Bearer ${idToken}` },
                timeout: 12000,
                params: { pageSize: 100, pageToken }
            });
            for (const doc of data.documents || []) {
                const fields = doc.fields || {};
                const members = fields.members?.arrayValue?.values?.map(member => member.stringValue);
                if (members?.length !== 2 || !members.includes(localId)) continue;
                const latest = fields.latest_message?.mapValue?.fields;
                conversations.push({
                    friendUid: members.find(uid => uid !== localId),
                    conversationId: doc.name.split('/').pop(),
                    text: latest?.body?.stringValue || '',
                    timestamp: latest?.created_at?.timestampValue || '',
                    unread: Number(fields.unread_count?.integerValue) || 0
                });
            }
            pageToken = data.nextPageToken;
        } while (pageToken);
        res.json({ conversations });
    } catch (error) {
        res.status(error.response?.status || 502).json({ error: 'Không đọc được hộp thư từ Locket.' });
    }
});

app.post('/api/chat/history', async (req, res) => {
    try {
        const { idToken, friendUid, conversationId: previousId, localId = tokenUserId(idToken) } = req.body || {};
        if (!idToken) return res.status(401).json({ error: 'Bạn cần đăng nhập lại' });
        if (!localId || !friendUid) return res.status(400).json({ error: 'Thiếu thông tin cuộc trò chuyện.' });
        const options = { headers: { Authorization: `Bearer ${idToken}` }, timeout: 12000 };
        const userPath = `users/${encodeURIComponent(localId)}/conversations`;
        let conversationId;
        let pageToken;
        if (typeof previousId === 'string' && /^[\w-]{1,128}$/.test(previousId)) {
            const { data: conversation } = await axios.get(`${FIRESTORE}/conversations/${previousId}`, options);
            const ids = conversation.fields?.members?.arrayValue?.values?.map(member => member.stringValue);
            if (ids?.length === 2 && ids.includes(localId) && ids.includes(friendUid)) conversationId = previousId;
        }
        while (!conversationId) {
            const { data } = await axios.get(`${FIRESTORE}/${userPath}`, { ...options, params: { pageSize: 100, pageToken } });
            for (const doc of data.documents || []) {
                const id = doc.name.split('/').pop();
                let members = doc.fields?.members?.arrayValue?.values;
                if (!members) {
                    const { data: conversation } = await axios.get(`${FIRESTORE}/conversations/${encodeURIComponent(id)}`, options);
                    members = conversation.fields?.members?.arrayValue?.values;
                }
                const ids = members?.map(member => member.stringValue);
                if (ids?.length === 2 && ids.includes(localId) && ids.includes(friendUid)) {
                    conversationId = id;
                    break;
                }
            }
            pageToken = data.nextPageToken;
            if (!pageToken) break;
        }
        if (!conversationId) return res.json({ messages: [] });
        const { data } = await axios.get(`${FIRESTORE}/conversations/${encodeURIComponent(conversationId)}/messages`, {
            ...options, params: { pageSize: 50, orderBy: 'created_at desc' }
        });
        const messages = (data.documents || []).reverse().map(({ name, fields }) => ({
            id: name?.split('/').pop(),
            clientToken: fields?.client_token?.stringValue,
            text: fields?.body?.stringValue || '',
            mine: fields?.sender?.stringValue === localId
        })).filter(message => message.text);
        res.json({ conversationId, messages });
    } catch (error) {
        fail(res, error, error.response?.status || 502);
    }
});

app.post('/api/chat/send', async (req, res) => {
    try {
        const { idToken, friendUid, message } = req.body || {};
        if (!idToken) return res.status(401).json({ error: 'Bạn cần đăng nhập lại' });
        const text = typeof message === 'string' ? message.trim() : '';
        if (!/^[\w-]{1,128}$/.test(friendUid || '') || !text || text.length > 1000) {
            return res.status(400).json({ error: 'Người nhận hoặc nội dung tin nhắn không hợp lệ.' });
        }
        const clientToken = crypto.randomUUID().toUpperCase();
        const posted = await locketPost('/sendChatMessageV2', idToken, {
            receiver_uid: friendUid,
            client_token: clientToken,
            msg: text,
            moment_uid: null,
            from_memory: false,
            intensity: { '@type': 'type.googleapis.com/google.protobuf.Int64Value', value: '0' }
        });
        const result = posted.data?.result;
        if (posted.status >= 400 || result?.status >= 400 || result?.errors?.length || posted.data?.error || !result) {
            const status = posted.status >= 400 ? posted.status : result?.status >= 400 ? result.status : 502;
            const detail = Array.isArray(result?.errors) ? result.errors[0] : result?.errors;
            return res.status(status).json({ error: detail?.message || detail || posted.data?.error?.message || 'Locket chưa xác nhận gửi tin nhắn.' });
        }
        res.json({ success: true, clientToken });
    } catch (error) {
        fail(res, error, 502);
    }
});

app.get('/api/place', async (req, res) => {
    try {
        const lat = Number(req.query.lat);
        const lon = Number(req.query.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ error: 'Thiếu toạ độ' });
        const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
            params: { format: 'jsonv2', lat, lon, zoom: 14 },
            headers: { 'User-Agent': 'locket-vip-clone/1.0 (personal photobooth)' },
            timeout: 12000
        });
        const address = response.data.address || {};
        const label = address.suburb || address.quarter || address.city || address.town || address.village || response.data.name || '';
        res.json({ label });
    } catch (error) {
        fail(res, error, 500);
    }
});

function getLanIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name] || []) {
            if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('127.')) {
                return net.address;
            }
        }
    }
    return '127.0.0.1';
}

async function ensureCertificates(lanIp) {
    const certsDir = path.join(__dirname, 'certs');
    if (!fs.existsSync(certsDir)) {
        fs.mkdirSync(certsDir, { recursive: true });
    }
    const crtPath = path.join(certsDir, 'server.crt');
    const keyPath = path.join(certsDir, 'server.key');

    if (fs.existsSync(crtPath) && fs.existsSync(keyPath)) {
        return {
            cert: fs.readFileSync(crtPath, 'utf8'),
            key: fs.readFileSync(keyPath, 'utf8')
        };
    }

    const attrs = [{ name: 'commonName', value: lanIp || 'LocketVIP' }, { name: 'organizationName', value: 'Locket VIP Studio' }];
    const altNames = [
        { type: 2, value: 'localhost' },
        { type: 7, ip: '127.0.0.1' }
    ];
    if (lanIp && lanIp !== '127.0.0.1') {
        altNames.push({ type: 7, ip: lanIp });
    }

    const pems = await selfsigned.generate(attrs, {
        days: 365,
        keySize: 2048,
        algorithm: 'sha256',
        extensions: [
            { name: 'basicConstraints', cA: true },
            { name: 'subjectAltName', altNames }
        ]
    });

    fs.writeFileSync(crtPath, pems.cert, 'utf8');
    fs.writeFileSync(keyPath, pems.private, 'utf8');

    return {
        cert: pems.cert,
        key: pems.private
    };
}

function pemToBase64(pem) {
    return pem.replace(/-----[^\n]+-----/g, '').replace(/\s+/g, '');
}

function generateMobileConfigXml({ lanIp, port = 3443, includeRootCa = false, certPem }) {
    const appUrl = `https://${lanIp}:${port}`;
    const profileUuid = uuidv4().toUpperCase();
    const webclipUuid = uuidv4().toUpperCase();
    const rootCertUuid = uuidv4().toUpperCase();
    const certData = certPem ? pemToBase64(certPem) : '';

    const webClipDict = `    <dict>
      <key>FullScreen</key>
      <true/>
      <key>IgnoreManifestScope</key>
      <true/>
      <key>IsRemovable</key>
      <true/>
      <key>Label</key>
      <string>Locket VIP</string>
      <key>PayloadDescription</key>
      <string>Mo Locket VIP toan man hinh tu man hinh chinh</string>
      <key>PayloadDisplayName</key>
      <string>Locket VIP</string>
      <key>PayloadIdentifier</key>
      <string>com.locketvip.webclip</string>
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
    </dict>`;

    const rootCertDict = `    <dict>
      <key>PayloadCertificateFileName</key>
      <string>LocketVIPRoot.crt</string>
      <key>PayloadContent</key>
      <data>${certData}</data>
      <key>PayloadDescription</key>
      <string>Chung chi goc tin cay cho ket noi HTTPS noi mang Locket VIP</string>
      <key>PayloadDisplayName</key>
      <string>Locket VIP Root CA</string>
      <key>PayloadIdentifier</key>
      <string>com.locketvip.root</string>
      <key>PayloadType</key>
      <string>com.apple.security.root</string>
      <key>PayloadUUID</key>
      <string>${rootCertUuid}</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
    </dict>`;

    const payloadContent = includeRootCa && certData ? `${webClipDict}\n${rootCertDict}` : webClipDict;

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
${payloadContent}
  </array>
  <key>PayloadDescription</key>
  <string>Cai Locket VIP len man hinh chinh iPhone.</string>
  <key>PayloadDisplayName</key>
  <string>Locket VIP Configuration</string>
  <key>PayloadIdentifier</key>
  <string>com.locketvip.profile</string>
  <key>PayloadOrganization</key>
  <string>Locket VIP Studio</string>
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
}

app.get('/ca.crt', async (req, res) => {
    try {
        const lanIp = getLanIp();
        const certs = await ensureCertificates(lanIp);
        res.setHeader('Content-Type', 'application/x-x509-ca-cert');
        res.setHeader('Content-Disposition', 'attachment; filename="LocketVIPRoot.crt"');
        res.send(certs.cert);
    } catch (err) {
        res.status(500).send('Lỗi tải chứng chỉ: ' + err.message);
    }
});

app.get('/install.mobileconfig', async (req, res) => {
    try {
        const lanIp = getLanIp();
        const certs = await ensureCertificates(lanIp);
        const includeRoot = req.query.root === '1';
        const xml = generateMobileConfigXml({ lanIp, port: HTTPS_PORT, includeRootCa: includeRoot, certPem: certs.cert });
        res.setHeader('Content-Type', 'application/x-apple-aspen-config');
        res.setHeader('Content-Disposition', 'attachment; filename="LocketVIP.mobileconfig"');
        res.send(xml);
    } catch (err) {
        res.status(500).send('Lỗi tạo cấu hình iOS: ' + err.message);
    }
});

const HTTP_PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

let httpServer = null;
let httpsServer = null;

if (require.main === module) {
    (async () => {
        const lanIp = getLanIp();
        const certs = await ensureCertificates(lanIp);

        httpServer = http.createServer(app).listen(HTTP_PORT, () => {
            console.log(`⚡ Locket VIP (HTTP):  http://localhost:${HTTP_PORT} | http://${lanIp}:${HTTP_PORT}`);
        });

        httpsServer = https.createServer({ key: certs.key, cert: certs.cert }, app).listen(HTTPS_PORT, () => {
            console.log(`🔒 Locket VIP (HTTPS): https://localhost:${HTTPS_PORT} | https://${lanIp}:${HTTPS_PORT}`);
            console.log(`📲 Cài lên iPhone: Mở https://${lanIp}:${HTTPS_PORT}/install.mobileconfig trên Safari`);
        });
    })().catch(console.error);
}

module.exports = {
    app,
    getLanIp,
    ensureCertificates,
    generateMobileConfigXml
};
