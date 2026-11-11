const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Test Suite for Task 3: Core App State, Auth & Navigation Engine
async function runTests() {
    console.log('--- Starting Task 3 Tests ---');
    const appPath = path.join(__dirname, '..', 'public', 'app.js');
    assert(fs.existsSync(appPath), 'public/app.js file must exist');

    // Simulate browser environment
    const storage = {};
    global.localStorage = {
        getItem: (k) => storage[k] || null,
        setItem: (k, v) => { storage[k] = String(v); },
        removeItem: (k) => { delete storage[k]; }
    };
    global.document = {
        body: { dataset: {} },
        getElementById: () => null,
        querySelectorAll: () => []
    };

    // Load module logic
    const { StateManager, applyTheme } = await import('file:///' + appPath.replace(/\\/g, '/'));

    // Test 1: State manager save/load
    const sampleAuth = {
        idToken: 'mock_token_123',
        refreshToken: 'mock_refresh_456',
        localId: 'user_789',
        email: 'test@locket.vip',
        displayName: 'Yang Lee',
        expiresAt: Date.now() + 3600000
    };
    StateManager.saveAuth(sampleAuth);
    const loaded = StateManager.getAuth();
    assert.deepStrictEqual(loaded.localId, sampleAuth.localId, 'Auth localId must match');
    assert.strictEqual(StateManager.isTokenExpired(), false, 'Token should not be expired');
    console.log('✓ StateManager successfully persisted and loaded session');

    // Test 2: Token expiry detection
    StateManager.saveAuth({ ...sampleAuth, expiresAt: Date.now() - 1000 });
    assert.strictEqual(StateManager.isTokenExpired(), true, 'Expired token must be recognized');
    console.log('✓ Token expiry accurately calculated');

    // Test 3: Theme application
    applyTheme('hot-to-go');
    assert.strictEqual(global.document.body.dataset.theme, 'hot-to-go', 'Theme must be set on document.body');
    console.log('✓ Theme application successfully sets dataset.theme');

    console.log('--- All Task 3 Unit Tests Passed! ---');
}

runTests().catch(err => {
    console.error('Test Failed:', err.message);
    process.exit(1);
});
