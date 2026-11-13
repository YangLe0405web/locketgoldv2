const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

async function runE2ESuite() {
    console.log('==============================================');
    console.log('🚀 RUNNING COMPREHENSIVE LOCKET VIP E2E SUITE');
    console.log('==============================================');

    const { app, getLanIp, ensureCertificates, generateMobileConfigXml } = require('../server.js');

    // 1. Check Lan IP and Certs
    const lanIp = getLanIp();
    assert(lanIp, 'LAN IP must be detected');
    console.log(`[PASS] LAN IP detected: ${lanIp}`);

    const certs = await ensureCertificates(lanIp);
    assert(certs.cert && certs.key, 'Certificates must exist');
    console.log(`[PASS] TLS Certificates verified in certs/ directory`);

    // 2. Check Static Assets
    const requiredFiles = [
        'public/index.html',
        'public/styles.css',
        'public/app.js',
        'public/manifest.json',
        'public/icon.svg'
    ];
    for (const f of requiredFiles) {
        assert(fs.existsSync(path.join(__dirname, '..', f)), `Static asset ${f} must exist`);
        console.log(`[PASS] Verified asset ${f}`);
    }

    // 3. Start test HTTP & HTTPS servers on ephemeral ports
    const testHttpPort = 3198;
    const testHttpsPort = 3498;

    const testHttpServer = http.createServer(app);
    const testHttpsServer = https.createServer({ key: certs.key, cert: certs.cert }, app);

    await new Promise(resolve => testHttpServer.listen(testHttpPort, resolve));
    await new Promise(resolve => testHttpsServer.listen(testHttpsPort, resolve));
    console.log(`[PASS] Test HTTP server listening on :${testHttpPort}`);
    console.log(`[PASS] Test HTTPS server listening on :${testHttpsPort}`);

    // 4. Test HTTP GET /install.mobileconfig
    const mobileConfigRes = await new Promise((resolve, reject) => {
        http.get(`http://localhost:${testHttpPort}/install.mobileconfig?root=1`, res => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
        }).on('error', reject);
    });

    assert.strictEqual(mobileConfigRes.status, 200, '/install.mobileconfig should return HTTP 200');
    assert(mobileConfigRes.headers['content-type'].includes('application/x-apple-aspen-config'), 'Content-type should be aspen config');
    assert(mobileConfigRes.body.includes('com.apple.webClip.managed'), 'MobileConfig should contain webClip');
    assert(mobileConfigRes.body.includes('com.apple.security.root'), 'MobileConfig should contain root CA payload');
    console.log('[PASS] /install.mobileconfig returned 200 with Aspen Config & Root CA payload');

    // 5. Test HTTPS GET / (with rejectUnauthorized: false for self-signed cert)
    const httpsRes = await new Promise((resolve, reject) => {
        https.get(`https://localhost:${testHttpsPort}/`, { rejectUnauthorized: false }, res => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body }));
        }).on('error', reject);
    });

    assert.strictEqual(httpsRes.status, 200, 'HTTPS root should return 200');
    assert(httpsRes.body.includes('Locket VIP'), 'Response should contain Locket VIP title');
    console.log('[PASS] HTTPS server returned 200 and served index.html securely');
    const encoderResponse = await fetch(`http://localhost:${testHttpPort}/vendor/gifenc.js`);
    assert.strictEqual(encoderResponse.status, 200);
    const encoderSource = await encoderResponse.text();
    const { GIFEncoder } = await import('data:text/javascript;base64,' + Buffer.from(encoderSource).toString('base64'));
    const gif = GIFEncoder();
    const palette = [[0, 0, 0], [255, 255, 255]];
    gif.writeFrame(Uint8Array.of(0), 1, 1, { palette, delay: 125 });
    gif.writeFrame(Uint8Array.of(1), 1, 1, { palette, delay: 125 });
    gif.finish();
    assert.strictEqual(Buffer.from(gif.bytes()).subarray(0, 6).toString(), 'GIF89a');
    console.log('[PASS] Browser GIF module is served and encodes animation frames');
    for (const script of ['tf.js', 'mobilenet.js', 'blazeface.js']) {
        const response = await fetch(`http://localhost:${testHttpPort}/vendor/${script}`);
        assert.strictEqual(response.status, 200);
        await response.arrayBuffer();
    }

    const axios = require('axios');
    const originalPost = axios.post;
    const originalGet = axios.get;
    const originalOpenAIKey = process.env.OPENAI_API_KEY;
    const originalGeminiKey = process.env.GEMINI_API_KEY;
    const originalProvider = process.env.IMAGE_API_PROVIDER;
    const request = async (route, body) => {
        const response = await fetch(`http://localhost:${testHttpPort}${route}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken: 'test-token', ...body })
        });
        assert.strictEqual(response.status, 200);
        return response.json();
    };
    try {
        process.env.OPENAI_API_KEY = 'mock-openai-key';
        process.env.IMAGE_API_PROVIDER = 'openai';
        delete process.env.GEMINI_API_KEY;
        axios.post = async (url, body) => {
            if (url.startsWith('https://generativelanguage.googleapis.com/')) {
                assert.deepStrictEqual(body.generationConfig.responseModalities, ['IMAGE']);
                assert.deepStrictEqual(body.contents[0].parts.slice(1).map(part => part.inlineData.mimeType), ['image/webp', 'image/png']);
                return { data: { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'YWJj' } }] } }] } };
            }
            if (url === 'https://api.openai.com/v1/images/edits') {
                assert.strictEqual(body.images.length, 2);
                assert(body.prompt.includes('second image'));
                return { data: { data: [{ b64_json: 'YWJj' }] } };
            }
            if (url.endsWith('/getLatestMomentV2')) {
                assert.strictEqual(body.data.last_fetch, undefined);
                assert.deepStrictEqual(body.data.users, ['friend']);
                return { status: 200, data: { result: { status: 200, data: [{ canonical_uid: 'moment' }] } } };
            }
            if (url.endsWith('/signInWithPhonePassword')) {
                assert.strictEqual(body.data.phone, '+84901234567');
                return { status: 200, data: { result: { token: 'custom-token' } } };
            }
            if (url.includes('/verifyCustomToken?')) {
                assert.strictEqual(body.token, 'custom-token');
                return { data: { idToken: 'phone-token', localId: 'me' } };
            }
            if (url.endsWith('/getFriendsV2')) {
                return { status: 200, data: { result: { status: 200, data: [{ uid: 'friend', first_name: 'An' }] } } };
            }
            assert(url.endsWith('/sendChatMessageV2'));
            assert.strictEqual(body.data.receiver_uid, 'friend');
            assert.strictEqual(body.data.msg, 'Chào An');
            return { status: 200, data: { result: { status: 200 } } };
        };
        axios.get = async url => ({
            data: { documents: url.endsWith('/users/me/conversations') ? [{
                name: 'users/me/conversations/thread',
                fields: { members: { arrayValue: { values: [{ stringValue: 'me' }, { stringValue: 'friend' }] } } }
            }] : [{
                fields: { body: { stringValue: 'Chào An' }, sender: { stringValue: 'me' } }
            }] }
        });
        assert.deepStrictEqual(await request('/api/friends', {}), {
            friends: [{ uid: 'friend', name: 'An', username: '', photoUrl: '' }]
        });
        assert.deepStrictEqual((await request('/api/feed', { users: ['friend'] })).result.data, [{ canonical_uid: 'moment' }]);
        assert.strictEqual((await request('/api/login', { phone: '+84901234567', password: 'test-password' })).localId, 'me');
        const sent = await request('/api/chat/send', { friendUid: 'friend', message: ' Chào An ' });
        assert.strictEqual(sent.success, true);
        assert(sent.clientToken);
        assert.deepStrictEqual(await request('/api/chat/history', { localId: 'me', friendUid: 'friend' }), {
            conversationId: 'thread',
            messages: [{ text: 'Chào An', mine: true }]
        });
        console.log('[PASS] Friends, chat send, and history with mocked upstream responses');
        assert.deepStrictEqual(await request('/api/ai/transform', {
            style: 'reference', image: 'data:image/webp;base64,YWJj', reference: 'data:image/png;base64,ZGVm'
        }), { image: 'data:image/webp;base64,YWJj' });
        process.env.GEMINI_API_KEY = 'mock-gemini-key';
        assert.deepStrictEqual(await request('/api/ai/transform', {
            style: 'reference', image: 'data:image/webp;base64,YWJj', reference: 'data:image/png;base64,ZGVm'
        }), { image: 'data:image/webp;base64,YWJj' });
        delete process.env.IMAGE_API_PROVIDER;
        assert.deepStrictEqual(await request('/api/ai/transform', {
            style: 'reference', image: 'data:image/webp;base64,YWJj', reference: 'data:image/png;base64,ZGVm'
        }), { image: 'data:image/png;base64,YWJj' });
        assert.deepStrictEqual(await request('/api/chat/inbox', { localId: 'me' }), {
            conversations: [{ friendUid: 'friend', conversationId: 'thread', text: '', timestamp: '', unread: 0 }]
        });
    } finally {
        axios.post = originalPost;
        axios.get = originalGet;
        if (originalOpenAIKey === undefined) delete process.env.OPENAI_API_KEY;
        else process.env.OPENAI_API_KEY = originalOpenAIKey;
        if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
        else process.env.GEMINI_API_KEY = originalGeminiKey;
        if (originalProvider === undefined) delete process.env.IMAGE_API_PROVIDER;
        else process.env.IMAGE_API_PROVIDER = originalProvider;
    }

    // Clean up test servers
    await new Promise(resolve => testHttpServer.close(resolve));
    await new Promise(resolve => testHttpsServer.close(resolve));
    console.log('[PASS] Test servers safely closed');

    console.log('==============================================');
    console.log('🎉 ALL E2E INTEGRATION CHECKS PASSED 100%!');
    console.log('==============================================');
}

runE2ESuite().catch(err => {
    console.error('E2E Test Failed:', err);
    process.exit(1);
});
