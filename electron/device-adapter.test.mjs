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

const handshake = (response) => createDeviceAdapter({ connect: async () => ({ request: async () => response }) });

test('recusa um handshake de outro protocolo e continua indisponível', async () => {
  for (const response of [{ type: 'hello', version: 2 }, { type: 'bye', version: 1 }, null, 'hello']) {
    const adapter = handshake(response);
    await assert.rejects(adapter.connect(), /Unsupported device protocol/);
    assert.equal(adapter.state().status, 'unavailable');
    await assert.rejects(adapter.sendSettings({ schema: 'hibi.device-settings', version: 1, payload: {} }), /unavailable/);
  }
});

test('recusa um pacote de ajustes malformado ou grande demais, sem enviar nada', async () => {
  const sent = [];
  const adapter = createDeviceAdapter({
    connect: async () => ({ request: async (message) => { if (message.type === 'hello') return { type: 'hello', version: 1 }; sent.push(message); return { accepted: true }; } }),
  });
  await adapter.connect();

  const valid = { schema: 'hibi.device-settings', version: 1, payload: { screenTimeout: 60 } };
  for (const settings of [
    undefined,
    { ...valid, schema: '' },
    { ...valid, schema: 'x'.repeat(121) },
    { ...valid, version: 0 },
    { ...valid, version: '1' },
    { ...valid, payload: 'muito texto' },
    { ...valid, payload: ['lista'] },
    { ...valid, payload: { grande: 'a'.repeat(9_000) } },
  ])
    await assert.rejects(adapter.sendSettings(settings), /invalid/);

  assert.deepEqual(sent, []);
  assert.deepEqual(await adapter.sendSettings(valid), { accepted: true });
  assert.deepEqual(sent, [{ type: 'settings', ...valid }]);
});
