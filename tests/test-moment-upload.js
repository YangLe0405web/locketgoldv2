const assert = require('node:assert/strict');
const axios = require('axios');
const { app } = require('../server');

(async () => {
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const original = { post: axios.post, put: axios.put, get: axios.get };
    let denied = false;
    let expired = false;
    let lookupError = null;
    let fallbackCalls = 0;
    let posted = 0;
    const buckets = [];
    try {
        axios.post = async (url, body, config) => {
            if (url.includes('/getAccountInfo?') || url.includes('/accounts:lookup?')) {
                if (url.includes('/getAccountInfo?')) fallbackCalls++;
                if (lookupError && (lookupError === 'always' || url.includes('/accounts:lookup?'))) throw { code: 'ECONNABORTED' };
                if (expired) throw { response: { status: 400, data: { error: { message: 'TOKEN_EXPIRED' } } } };
                return { data: { users: [{ localId: 'test-user' }] } };
            }
            if (url.includes('firebasestorage.googleapis.com')) {
                assert.equal(config.headers.Authorization, 'Firebase test-token');
                assert.deepEqual(body.metadata, { visibility: 'private', creator: 'test-user' });
                assert.match(body.name, /^users\/test-user\/moments\/(thumbnails|videos)\/[a-f0-9]{20}\.(webp|mp4)$/);
                assert.equal(config.headers['X-Goog-Upload-Content-Length'], '3');
                buckets.push(url.includes('/b/locket-video/') ? 'video' : 'image');
                if (denied) throw { response: { status: 403, data: { error: { message: 'Permission denied.' } } } };
                return { headers: { 'x-goog-upload-url': 'https://upload.invalid/session' } };
            }
            assert.equal(url, 'https://api.locketcamera.com/postMomentV2');
            assert.equal(config.headers.Authorization, 'Bearer test-token');
            assert(body.data.thumbnail_url.endsWith('token=download-token'));
            if (body.data.video_url) assert(body.data.video_url.includes('/b/locket-video/'));
            posted++;
            return { status: 200, data: { result: { status: 200 } } };
        };
        axios.put = async (url, bytes, config) => {
            assert.equal(bytes.toString(), 'abc');
            assert.equal(config.headers['X-Goog-Upload-Protocol'], 'resumable');
            return { data: { downloadTokens: 'download-token,second-token' } };
        };
        axios.get = async () => { throw new Error('Should use token from upload response'); };
        const request = (extra = {}) => fetch(`http://127.0.0.1:${server.address().port}/api/post-moment`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken: 'test-token', localId: 'stale-user', imageBase64: 'data:image/webp;base64,YWJj', ...extra })
        });
        assert.equal((await request()).status, 200);
        assert.equal((await request({ videoBase64: 'data:video/mp4;base64,YWJj' })).status, 200);
        assert.deepEqual(buckets, ['image', 'image', 'video']);
        denied = true;
        const failure = await request();
        assert.equal(failure.status, 403);
        assert.match((await failure.json()).error, /Khởi tạo tải ảnh: Permission denied/);
        assert.equal(posted, 2, 'Never create a moment after failed upload');
        expired = true;
        const attempts = buckets.length;
        assert.equal((await request()).status, 401);
        assert.equal(buckets.length, attempts, 'Expired login must be refreshed before storage upload');
        expired = false;
        denied = false;
        lookupError = 'primary';
        assert.equal((await request()).status, 200);
        assert.equal(fallbackCalls, 1, 'Transient lookup failure retries through alternate Firebase endpoint');
        lookupError = 'always';
        const uploadsBeforeTimeout = buckets.length;
        const timedOut = await request();
        assert.equal(timedOut.status, 502);
        assert.match((await timedOut.json()).error, /timeout/);
        assert.equal(buckets.length, uploadsBeforeTimeout, 'No upload before authentication succeeds');
        console.log('PASS moment upload auth, metadata, video bucket, download token and permission error');
    } finally {
        Object.assign(axios, original);
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
