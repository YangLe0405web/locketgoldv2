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

const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '70mb' }));
app.use(express.static('public'));

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
    return { ...LOCKET_HEADERS, Authorization: `Bearer ${idToken}` };
}

async function locketPost(path, idToken, data) {
    const response = await axios.post(`${LOCKET_API}${path}`, { data }, {
        headers: authHeaders(idToken),
        timeout: 30000,
        validateStatus: () => true
    });
    return response;
}

async function uploadBuffer({ idToken, objectPath, buffer, contentType }) {
    const encoded = encodeURIComponent(objectPath);
    const start = await axios.post(
        `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encoded}?uploadType=resumable&name=${encoded}`,
        { name: objectPath, contentType },
        {
            headers: {
                Authorization: `Bearer ${idToken}`,
                'Content-Type': 'application/json; charset=UTF-8',
                'X-Goog-Upload-Protocol': 'resumable',
                'X-Goog-Upload-Command': 'start',
                'X-Goog-Upload-Header-Content-Length': buffer.length,
                'X-Goog-Upload-Header-Content-Type': contentType
            },
            timeout: 30000
        }
    );

    const sessionUri = start.headers['x-goog-upload-url'];
    if (!sessionUri) throw new Error('Firebase không trả phiên upload');

    await axios.put(sessionUri, buffer, {
        headers: {
            'Content-Type': 'application/octet-stream',
            'X-Goog-Upload-Command': 'upload, finalize',
            'X-Goog-Upload-Offset': '0'
        },
        timeout: 60000,
        maxBodyLength: Infinity
    });

    const meta = await axios.get(
        `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encoded}`,
        { headers: { Authorization: `Bearer ${idToken}` }, timeout: 20000 }
    );
    const token = meta.data.downloadTokens;
    return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encoded}?alt=media&token=${token}`;
}

function decodeDataUrl(dataUrl) {
    const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/s);
    if (!match) return { contentType: 'application/octet-stream', buffer: Buffer.from(String(dataUrl || ''), 'base64') };
    return { contentType: match[1], buffer: Buffer.from(match[2], 'base64') };
}

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
        const { email, password } = req.body || {};
        if (!email || !password) return res.status(400).json({ error: 'Nhập email và mật khẩu Locket' });
        const response = await axios.post(
            `https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyPassword?key=${FIREBASE_API_KEY}`,
            { email, password, returnSecureToken: true, clientType: 'CLIENT_TYPE_IOS' },
            { headers: LOCKET_HEADERS, timeout: 20000 }
        );
        const data = response.data;
        res.json({
            idToken: data.idToken,
            refreshToken: data.refreshToken,
            localId: data.localId,
            email: data.email,
            displayName: data.displayName || '',
            profilePicture: data.profilePicture || '',
            expiresIn: Number(data.expiresIn || 3600)
        });
    } catch (error) {
        fail(res, error);
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
        const { idToken, localId } = body;
        if (!idToken || !localId) return res.status(400).json({ error: 'Bạn cần đăng nhập lại' });
        if (!body.imageBase64 && !body.videoBase64) return res.status(400).json({ error: 'Chưa có ảnh hoặc video' });

        const captionPack = buildOverlays(body);
        const audience = body.audience || 'all';
        const picked = Array.isArray(body.recipients) ? body.recipients.filter(Boolean) : [];
        const payload = {
            caption: captionPack.text,
            sent_to_all: audience === 'all',
            recipients: audience === 'selected' ? picked : (audience === 'private' ? [localId] : []),
            overlays: captionPack.overlays
        };

        if (body.imageBase64) {
            const image = decodeDataUrl(body.imageBase64);
            const imagePath = `users/${localId}/moments/thumbnails/${Date.now()}_vip.webp`;
            payload.thumbnail_url = await uploadBuffer({
                idToken,
                objectPath: imagePath,
                buffer: image.buffer,
                contentType: 'image/webp'
            });
            payload.md5 = crypto.createHash('md5').update(image.buffer).digest('hex');
        }

        if (body.videoBase64) {
            const video = decodeDataUrl(body.videoBase64);
            const ext = video.contentType.includes('mp4') ? 'mp4' : 'webm';
            const videoPath = `users/${localId}/moments/videos/${Date.now()}_vip.${ext}`;
            payload.video_url = await uploadBuffer({
                idToken,
                objectPath: videoPath,
                buffer: video.buffer,
                contentType: video.contentType.includes('mp4') ? 'video/mp4' : video.contentType
            });
            payload.md5 = crypto.createHash('md5').update(video.buffer).digest('hex');
            if (!payload.thumbnail_url && body.imageBase64 == null) {
                return res.status(400).json({ error: 'Video cần ảnh bìa' });
            }
        }

        const posted = await locketPost('/postMomentV2', idToken, payload);
        if (posted.status >= 400 || posted.data?.error || posted.data?.result?.errors) {
            return res.status(posted.status >= 400 ? posted.status : 502).json({
                error: posted.data?.error?.message || posted.data?.result?.errors || posted.data || 'Locket từ chối moment'
            });
        }
        res.json({ success: true, result: posted.data });
    } catch (error) {
        fail(res, error, 500);
    }
});

app.post('/api/feed', async (req, res) => {
    try {
        const { idToken, syncToken } = req.body || {};
        if (!idToken) return res.status(400).json({ error: 'Bạn cần đăng nhập lại' });
        const data = {
            excluded_users: [],
            fetch_streak: true,
            should_count_missed_moments: true,
            last_fetch: {
                '@type': 'type.googleapis.com/google.protobuf.Int64Value',
                value: String(Date.now() - 7 * 24 * 60 * 60 * 1000)
            }
        };
        if (syncToken) data.sync_token = syncToken;
        const posted = await locketPost('/getLatestMomentV2', idToken, data);
        res.status(posted.status >= 400 ? posted.status : 200).json(posted.data);
    } catch (error) {
        fail(res, error, 500);
    }
});

app.post('/api/react', async (req, res) => {
    try {
        const { idToken, momentUid, reaction } = req.body || {};
        if (!idToken || !momentUid || !reaction) return res.status(400).json({ error: 'Thiếu moment hoặc nội dung cảm xúc' });
        const posted = await locketPost('/reactToMoment', idToken, { moment_uid: momentUid, reaction });
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
        const { idToken, localId } = req.body || {};
        if (!idToken || !localId) return res.status(400).json({ error: 'Bạn cần đăng nhập lại' });
        const listed = await axios.get(`${FIRESTORE}/users/${localId}/friends?pageSize=200`, {
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
            return { uid };
        }).filter((friend) => friend.uid);
        res.json({ friends });
    } catch (error) {
        fail(res, error, 500);
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
        extensions: [{ name: 'subjectAltName', altNames }]
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

function generateMobileConfigXml({ lanIp, port = 3443, certPem }) {
    const appUrl = `https://${lanIp}:${port}`;
    const profileUuid = uuidv4().toUpperCase();
    const webclipUuid = uuidv4().toUpperCase();
    const rootCertUuid = uuidv4().toUpperCase();
    const certData = pemToBase64(certPem);

    return `<?xml version="1.0" encoding="UTF-8"?>
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
    </dict>
    <dict>
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
    </dict>
  </array>
  <key>PayloadDescription</key>
  <string>Cai Locket VIP len man hinh chinh va tin cay chung chi HTTPS camera.</string>
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

app.get('/install.mobileconfig', async (req, res) => {
    try {
        const lanIp = getLanIp();
        const certs = await ensureCertificates(lanIp);
        const xml = generateMobileConfigXml({ lanIp, port: HTTPS_PORT, certPem: certs.cert });
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
