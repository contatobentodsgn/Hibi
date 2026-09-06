const test = require('node:test'); const assert = require('node:assert/strict'); const bridge = require('./index.cjs');
test('reports a safe documented capability contract', () => { assert.equal(typeof bridge.available, 'function'); assert.equal(typeof bridge.promotionAvailable, 'function'); assert.equal(typeof bridge.screenGeometry, 'function'); assert.equal(typeof bridge.place, 'function'); assert.equal(typeof bridge.teardown, 'function'); assert.equal(bridge.promotionAvailable(), false); const screens = bridge.screenGeometry(); assert.ok(Array.isArray(screens)); for (const screen of screens) { assert.equal(typeof screen.safeAreaTop, 'number'); assert.equal(typeof screen.hasCameraHousing, 'boolean'); } if (!bridge.available()) assert.equal(bridge.place(), false); });

test('defaults to the distributable public adapter', () => {
  const adapter = bridge.createNotchAdapter({ platform: 'darwin', isPackaged: false });
  assert.equal(adapter.id, 'public');
  assert.equal(adapter.experimental, false);
});

test('blocks the experimental adapter in packaged builds', () => {
  const adapter = bridge.createNotchAdapter({ mode: 'experimental', platform: 'darwin', isPackaged: true, allowExperimental: true });
  assert.equal(adapter.id, 'public');
  assert.equal(adapter.reason, 'Experimental notch behavior is unavailable in packaged builds.');
});

test('requires an explicit local development opt-in for experimental mode', () => {
  const disabled = bridge.createNotchAdapter({ mode: 'experimental', platform: 'darwin', isPackaged: false, allowExperimental: false });
  assert.equal(disabled.id, 'public');
  const enabled = bridge.createNotchAdapter({ mode: 'experimental', platform: 'darwin', isPackaged: false, allowExperimental: true });
  assert.equal(enabled.id, 'experimental');
  assert.equal(enabled.experimental, true);
});
