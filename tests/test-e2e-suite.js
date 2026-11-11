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
