const assert = require('assert');
const path = require('path');

// Test Suite for Task 5: Photobooth Compositor & Post Dispatcher
async function runTests() {
    console.log('--- Starting Task 5 Tests ---');
    const appPath = path.join(__dirname, '..', 'public', 'app.js');

    // Load module logic
    const { computePhotoboothGrid, buildMomentPayload } = await import('file:///' + appPath.replace(/\\/g, '/'));

    assert(typeof computePhotoboothGrid === 'function', 'computePhotoboothGrid must be a function');
    assert(typeof buildMomentPayload === 'function', 'buildMomentPayload must be a function');

    // Test 1: Grid layout cell counts and bounding boxes for 6 layouts
    const layouts = [
        { key: '1x2', expectedCells: 2, cols: 1, rows: 2 },
        { key: '1x3', expectedCells: 3, cols: 1, rows: 3 },
        { key: '1x4', expectedCells: 4, cols: 1, rows: 4 },
        { key: '2x2', expectedCells: 4, cols: 2, rows: 2 },
        { key: '2x3', expectedCells: 6, cols: 2, rows: 3 },
        { key: '3x3', expectedCells: 9, cols: 3, rows: 3 },
    ];

    for (const item of layouts) {
        const grid = computePhotoboothGrid(item.key, 1080, 1080, 20, 24);
        assert.strictEqual(grid.cells.length, item.expectedCells, `Layout ${item.key} must produce ${item.expectedCells} cells`);
        for (const cell of grid.cells) {
            assert(cell.w > 0 && cell.h > 0, `Cell width and height must be positive in ${item.key}`);
            assert(cell.x >= 0 && cell.y >= 0, `Cell coordinates must be non-negative in ${item.key}`);
            assert(cell.x + cell.w <= 1080, `Cell must not exceed canvas width in ${item.key}`);
            assert(cell.y + cell.h <= 1080, `Cell must not exceed canvas height in ${item.key}`);
        }
    }
    console.log('✓ All 6 Photobooth grid calculations verified');

    // Test 2: Moment payload builder
    const payloadAll = buildMomentPayload({
        idToken: 'token_abc',
        localId: 'user_xyz',
        imageBase64: 'data:image/webp;base64,mockImage',
        caption: 'Hello Locket VIP',
        overlayType: 'music',
        bgColorStart: '#ff0000',
        bgColorEnd: '#00ff00',
        textColor: '#ffffff',
        audience: 'all'
    });
    assert.strictEqual(payloadAll.idToken, 'token_abc');
    assert.strictEqual(payloadAll.localId, 'user_xyz');
    assert.strictEqual(payloadAll.caption, 'Hello Locket VIP');
    assert.strictEqual(payloadAll.overlayType, 'music');
    assert.strictEqual(payloadAll.audience, 'all');
    assert.deepStrictEqual(payloadAll.recipients, []);

    const payloadPrivate = buildMomentPayload({
        idToken: 'token_abc',
        localId: 'user_xyz',
        imageBase64: 'data:image/webp;base64,mockImage',
        audience: 'private'
    });
    assert.strictEqual(payloadPrivate.audience, 'private');

    const payloadSelected = buildMomentPayload({
        idToken: 'token_abc',
        localId: 'user_xyz',
        imageBase64: 'data:image/webp;base64,mockImage',
        audience: 'selected',
        recipients: ['friend_1', 'friend_2']
    });
    assert.strictEqual(payloadSelected.audience, 'selected');
    assert.deepStrictEqual(payloadSelected.recipients, ['friend_1', 'friend_2']);
    console.log('✓ Moment payload builder accurately formats audiences');

    console.log('--- All Task 5 Unit Tests Passed! ---');
}

runTests().catch(err => {
    console.error('Test Failed:', err.message);
    process.exit(1);
});
