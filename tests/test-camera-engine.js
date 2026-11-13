const assert = require('assert');
const path = require('path');

// Test Suite for Task 4: Camera Controller, Dual Cam, Video & GIF Engine
async function runTests() {
    console.log('--- Starting Task 4 Tests ---');
    const appPath = path.join(__dirname, '..', 'public', 'app.js');

    // Load module logic
    const { CameraEngine, calculateDualCamLayout } = await import('file:///' + appPath.replace(/\\/g, '/'));

    assert(CameraEngine, 'CameraEngine must be exported');
    assert(typeof calculateDualCamLayout === 'function', 'calculateDualCamLayout must be a function');

    // Test 1: Dual Cam Coordinate Calculations
    // Canvas 1080x1080
    const pipCoords = calculateDualCamLayout('pip', 1080, 1080);
    assert(pipCoords.main, 'PiP must define main viewport');
    assert(pipCoords.sub, 'PiP must define sub viewport');
    assert.strictEqual(pipCoords.main.w, 1080);
    assert.strictEqual(pipCoords.main.h, 1080);
    // Sub should be roughly bottom right 34%
    assert(pipCoords.sub.w < 500 && pipCoords.sub.w > 300, 'PiP sub width should be ~34%');
    assert(pipCoords.sub.x > 500, 'PiP sub should be located at right');
    assert(pipCoords.sub.y > 500, 'PiP sub should be located at bottom');
    console.log('✓ PiP geometry calculations passed');

    const splitCoords = calculateDualCamLayout('split', 1080, 1080);
    assert.strictEqual(splitCoords.main.h, 540, 'Split main height should be half (540)');
    assert.strictEqual(splitCoords.sub.h, 540, 'Split sub height should be half (540)');
    assert.strictEqual(splitCoords.sub.y, 540, 'Split sub y offset should start at 540');
    console.log('✓ Split screen geometry calculations passed');

    // Test 2: Dual Cam state cycling
    assert.strictEqual(CameraEngine.cycleDualMode('off'), 'pip');
    assert.strictEqual(CameraEngine.cycleDualMode('pip'), 'split');
    assert.strictEqual(CameraEngine.cycleDualMode('split'), 'off');
    console.log('✓ Dual Cam state cycling verified');

    // Test 3: Camera facing toggle
    assert.strictEqual(CameraEngine.toggleFacing('user'), 'environment');
    assert.strictEqual(CameraEngine.toggleFacing('environment'), 'user');
    console.log('✓ Camera facing toggle verified');

    let grantPermission;
    let trackStopped = false;
    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: { mediaDevices: { getUserMedia: () => new Promise(resolve => { grantPermission = resolve; }) } }
    });
    const opening = CameraEngine.startCamera();
    CameraEngine.stopAll();
    grantPermission({ getTracks: () => [{ stop: () => { trackStopped = true; } }] });
    assert.strictEqual(await opening, null);
    assert.strictEqual(CameraEngine.mainStream, null);
    assert.strictEqual(trackStopped, true);
    console.log('✓ Camera stream granted after cancellation is released');

    console.log('--- All Task 4 Unit Tests Passed! ---');
}

runTests().catch(err => {
    console.error('Test Failed:', err.message);
    process.exit(1);
});
