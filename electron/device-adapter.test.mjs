import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeviceAdapter } from './device-adapter.mjs';

test('remains unavailable without a transport', async () => { const adapter = createDeviceAdapter(); assert.equal(adapter.state().status, 'unavailable'); await assert.rejects(adapter.connect(), /unavailable/); });
test('performs a versioned handshake and reports bounded capabilities', async () => {
  const adapter = createDeviceAdapter({ connect: async () => ({ request: async (message) => message.type === 'hello' ? { type: 'hello', version: 1, firmwareVersion: '0.1', capabilities: ['display', 7, 'audio'] } : { accepted: true } }) });
  assert.deepEqual(await adapter.connect(), { status: 'available', firmwareVersion: '0.1', capabilities: ['display', 'audio'] });
  assert.deepEqual(await adapter.sendSettings({ schema: 'hibi.device-settings', version: 1, payload: { screenTimeout: 60 } }), { accepted: true });
  adapter.close(); assert.equal(adapter.state().status, 'unavailable');
});
