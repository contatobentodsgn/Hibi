const test = require('node:test'); const assert = require('node:assert/strict');
const { BASE_WIDTH, BASE_HEIGHT, activationBounds, notchBounds, scaleForDisplay, selectDisplay } = require('./notch-geometry.cjs');
const display = { id: 1, bounds: { x: 0, y: 0, width: 1512, height: 982 } };
test('uses the documented base host dimensions and clamped auto scale', () => { assert.equal(BASE_WIDTH, 392); assert.equal(BASE_HEIGHT, 296); assert.equal(scaleForDisplay(display), 0.94); assert.equal(scaleForDisplay({ bounds: { x: 0, y: 0, width: 600, height: 500 } }), 0.78); });
test('centers in display bounds rather than work area', () => { const bounds = notchBounds(display); assert.equal(bounds.y, 0); assert.equal(bounds.x, Math.round((1512 - bounds.width) / 2)); });
test('clamps dormant activation zone and falls back to primary display', () => { assert.deepEqual(activationBounds({ bounds: { x: 0, y: 0, width: 5000, height: 5000 } }).width, 320); assert.deepEqual(activationBounds({ bounds: { x: 0, y: 0, width: 500, height: 500 } }).height, 38); const screen = { getAllDisplays: () => [display], getPrimaryDisplay: () => display }; assert.equal(selectDisplay(screen, 99), display); });
