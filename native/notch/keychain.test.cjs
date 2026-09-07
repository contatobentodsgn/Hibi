const test = require('node:test');
const assert = require('node:assert/strict');
const bridge = require('./keychain.cjs');

test('exposes a bounded Keychain bridge contract', () => {
  for (const method of ['available', 'set', 'get', 'has', 'remove']) assert.equal(typeof bridge[method], 'function');
});
