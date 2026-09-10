const test = require('node:test'); const assert = require('node:assert/strict');
const { BASE_WIDTH, BASE_HEIGHT, activationBounds, notchBounds, scaleForDisplay, resolveNotchDisplay } = require('./notch-geometry.cjs');
const display = { id: 1, bounds: { x: 0, y: 0, width: 1512, height: 982 } };
test('uses the documented base host dimensions and clamped auto scale', () => { assert.equal(BASE_WIDTH, 392); assert.equal(BASE_HEIGHT, 296); assert.equal(scaleForDisplay(display), 0.94); assert.equal(scaleForDisplay({ bounds: { x: 0, y: 0, width: 600, height: 500 } }), 0.78); });
test('centers in display bounds rather than work area', () => { const bounds = notchBounds(display); assert.equal(bounds.y, 0); assert.equal(bounds.x, Math.round((1512 - bounds.width) / 2)); });
test('clamps dormant activation zone', () => { assert.deepEqual(activationBounds({ bounds: { x: 0, y: 0, width: 5000, height: 5000 } }).width, 320); assert.deepEqual(activationBounds({ bounds: { x: 0, y: 0, width: 500, height: 500 } }).height, 38); });

const internal = { id: 1, bounds: { x: 570, y: -956, width: 1470, height: 956 } };
const external = { id: 2, bounds: { x: 0, y: 0, width: 2560, height: 1080 } };

test('usa o monitor preferido quando ele está conectado', () => {
  assert.deepEqual(resolveNotchDisplay([external, internal], external, { preferredDisplayId: 2, cameraHousingIds: [1] }), { display: external, reason: 'preferred' });
});

test('sem preferência, escolhe a tela com câmera mesmo quando outra é a principal', () => {
  assert.deepEqual(resolveNotchDisplay([external, internal], external, { preferredDisplayId: null, cameraHousingIds: [1] }), { display: internal, reason: 'camera-housing' });
});

test('preferido desconectado cai para a tela com câmera e, sem ela, para a principal', () => {
  assert.deepEqual(resolveNotchDisplay([external, internal], external, { preferredDisplayId: 9, cameraHousingIds: [1] }), { display: internal, reason: 'camera-housing' });
  assert.deepEqual(resolveNotchDisplay([external], external, { preferredDisplayId: 9, cameraHousingIds: [] }), { display: external, reason: 'primary' });
  assert.deepEqual(resolveNotchDisplay([external], external), { display: external, reason: 'primary' });
});
