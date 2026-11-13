const assert = require('assert');
const path = require('path');

// Test Suite for Task 6: Feed Timeline, Reactions & Memories
async function runTests() {
    console.log('--- Starting Task 6 Tests ---');
    const appPath = path.join(__dirname, '..', 'public', 'app.js');

    // Load module logic
    const { formatRelativeTime, computeMemoriesSummary, buildReactionPayload } = await import('file:///' + appPath.replace(/\\/g, '/'));

    assert(typeof formatRelativeTime === 'function', 'formatRelativeTime must be a function');
    assert(typeof computeMemoriesSummary === 'function', 'computeMemoriesSummary must be a function');
    assert(typeof buildReactionPayload === 'function', 'buildReactionPayload must be a function');

    // Test 1: Relative time formatting
    const now = Date.now();
    assert.strictEqual(formatRelativeTime(now - 30 * 1000), 'Vừa xong');
    assert.strictEqual(formatRelativeTime(now - 5 * 60 * 1000), '5 phút trước');
    assert.strictEqual(formatRelativeTime(now - 3 * 3600 * 1000), '3 giờ trước');
    assert.strictEqual(formatRelativeTime(now - 2 * 86400 * 1000), '2 ngày trước');
    console.log('✓ Relative time formatted accurately');

    // Test 2: Reaction payload builder
    const reactionPayload = buildReactionPayload('id_token_123', 'moment_abc', '🔥');
    assert.deepStrictEqual(reactionPayload, {
        idToken: 'id_token_123',
        momentUid: 'moment_abc',
        reaction: '🔥'
    });
    console.log('✓ Reaction payload formatted accurately');

    // Test 3: Memories summary calculation
    const sampleMoments = [
        { uid: 'm1', created_at: now },
        { uid: 'm2', created_at: now - 86400000 },
        { uid: 'm3', created_at: now - 86400000 * 2 }
    ];
    const sampleFriends = [{ uid: 'f1' }, { uid: 'f2' }];
    const summary = computeMemoriesSummary(sampleMoments, sampleFriends);
    assert.strictEqual(summary.totalLockets, 3);
    assert.strictEqual(summary.totalFriends, 2);
    assert(summary.streak >= 1, 'Streak should be calculated');
    console.log('✓ Memories summary calculation verified');

    console.log('--- All Task 6 Unit Tests Passed! ---');
}

runTests().catch(err => {
    console.error('Test Failed:', err.message);
    process.exit(1);
});
