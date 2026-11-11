const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Test Suite for Task 2: DOM Structure & Modal Sheets
function runTests() {
    console.log('--- Starting Task 2 Tests ---');
    const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    // Test 1: Required Modal Sheets
    const requiredSheets = [
        'photoboothSheet',
        'fxSheet',
        'frameSheet',
        'audienceSheet',
        'themeSheet',
        'countdownIndicator'
    ];
    for (const sheetId of requiredSheets) {
        assert(html.includes(`id="${sheetId}"`), `Missing required element #${sheetId} in index.html`);
        console.log(`✓ Found element #${sheetId}`);
    }

    // Test 2: Photobooth 6 Layouts
    const layouts = ['1x2', '1x3', '1x4', '2x2', '2x3', '3x3'];
    for (const layout of layouts) {
        assert(html.includes(`data-layout="${layout}"`), `Missing photobooth layout option data-layout="${layout}"`);
    }
    console.log('✓ All 6 Photobooth layout options exist');

    // Test 3: Photobooth 5 Timers
    const timers = ['2', '3', '5', '7', '10'];
    for (const timer of timers) {
        assert(html.includes(`data-timer="${timer}"`), `Missing photobooth timer option data-timer="${timer}"`);
    }
    console.log('✓ All 5 Photobooth timer options exist');

    // Test 4: Theme options
    const themes = ['default', 'gold', 'hot-to-go', 'sunrise', 'jewels', 'midnight'];
    for (const theme of themes) {
        assert(html.includes(`data-theme-name="${theme}"`), `Missing theme option data-theme-name="${theme}"`);
    }
    console.log('✓ Theme selection buttons exist');

    console.log('--- All Task 2 Unit Tests Passed! ---');
}

try {
    runTests();
} catch (err) {
    console.error('Test Failed:', err.message);
    process.exit(1);
}
