const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// Test Suite for Task 1: Server SSL & MobileConfig
async function runTests() {
    console.log('--- Starting Task 1 Tests ---');
    const { ensureCertificates, getLanIp, generateMobileConfigXml } = require('../server.js');

    // Test 1: LAN IP detection
    const lanIp = getLanIp();
    assert(lanIp && typeof lanIp === 'string', 'LAN IP should be a non-empty string');
    console.log('✓ getLanIp returned:', lanIp);

    // Test 2: Certificate generation & persistence
    const certsDir = path.join(__dirname, '..', 'certs');
    const certFiles = await ensureCertificates(lanIp);
    assert(fs.existsSync(certsDir), 'certs directory should exist');
    assert(fs.existsSync(path.join(certsDir, 'server.crt')), 'server.crt should exist');
    assert(fs.existsSync(path.join(certsDir, 'server.key')), 'server.key should exist');
    assert(certFiles.cert && certFiles.key, 'ensureCertificates should return cert and key');
    console.log('✓ Certificates generated and verified on disk');

    // Test 3: MobileConfig XML generation with Root CA & WebClip
    const xml = generateMobileConfigXml({ lanIp, port: 3443, includeRootCa: true, certPem: certFiles.cert });
    assert(xml.includes('com.apple.webClip.managed'), 'MobileConfig should contain webClip payload');
    assert(xml.includes('com.apple.security.root'), 'MobileConfig should contain root certificate payload');
    assert(xml.includes(`https://${lanIp}:3443`), 'MobileConfig WebClip URL should point to HTTPS LAN IP');
    console.log('✓ MobileConfig XML successfully generated with Root CA and WebClip');

    console.log('--- All Task 1 Unit Tests Passed! ---');
}

runTests().catch(err => {
    console.error('Test Failed:', err.message);
    process.exit(1);
});
