const test = require('node:test');
const assert = require('node:assert/strict');
const { createUpdateService } = require('./updates.cjs');

test('keeps updates disabled without a packaged feed', async () => {
  const service = createUpdateService({ isPackaged: false, feedUrl: 'https://updates.example.test', autoUpdater: {} });
  assert.equal(service.state().status, 'disabled');
  await service.check();
  assert.equal(service.state().status, 'disabled');
});

test('requires explicit download and reports the update lifecycle', async () => {
  const events = [];
  const listeners = new Map();
  const updater = { on: (event, fn) => listeners.set(event, fn), setFeedURL: () => {}, checkForUpdates: async () => listeners.get('update-available')({ version: '0.2.0' }), downloadUpdate: async () => listeners.get('update-downloaded')({ version: '0.2.0' }), quitAndInstall: () => { events.push('install'); } };
  const service = createUpdateService({ isPackaged: true, feedUrl: 'https://updates.example.test', autoUpdater: updater, onEvent: (state) => events.push(state.status) });
  await service.check();
  assert.equal(service.state().status, 'available');
  await service.download();
  assert.equal(service.state().status, 'downloaded');
  service.install();
  assert.deepEqual(events, ['available', 'downloaded', 'install']);
});
