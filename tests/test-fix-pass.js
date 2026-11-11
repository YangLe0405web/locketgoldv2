const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

async function runFixPassTests() {
    console.log('--- Starting Fix Pass Verification Tests ---');

    // 1. Check Root CA Basic Constraints cA: true
    const { getLanIp, ensureCertificates } = require('../server.js');
    const lanIp = getLanIp();
    const certs = await ensureCertificates(lanIp);
    const x509 = new crypto.X509Certificate(certs.cert);
    assert.strictEqual(x509.ca, true, 'Certificate must have basicConstraints cA: true for iOS Certificate Trust Settings');
    console.log('✓ X.509 certificate has basicConstraints cA: true');

    // 2. Check Cover Image Aspect Ratio Calculator
    const appPath = path.join(__dirname, '..', 'public', 'app.js');
    const { computeCoverCrop, CameraEngine } = await import('file:///' + appPath.replace(/\\/g, '/'));

    assert(typeof computeCoverCrop === 'function', 'computeCoverCrop must be a function');
    // Given video 1920x1080 (16:9), target cell 1000x250 (4:1)
    const crop1 = computeCoverCrop(1920, 1080, 1000, 250);
    assert(crop1.sw === 1920, 'Width should be fully used');
    assert.strictEqual(crop1.sh, 480, 'Height should be cropped to 480 to match 4:1 aspect ratio');
    assert.strictEqual(crop1.sy, (1080 - 480) / 2, 'Crop should be vertically centered');
    console.log('✓ computeCoverCrop accurately computes aspect-preserving source crop');

    // 3. Check Dual Cam Sequential Fallback method exists
    assert(typeof CameraEngine.captureSequentialDualShot === 'function', 'CameraEngine.captureSequentialDualShot must be implemented');
    console.log('✓ CameraEngine.captureSequentialDualShot exists');

    console.log('--- All Fix Pass Tests Passed! ---');
}

runFixPassTests().catch(err => {
    console.error('Fix Pass Test Failed:', err.message);
    process.exit(1);
});
