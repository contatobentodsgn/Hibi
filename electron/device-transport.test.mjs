import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeviceTransport } from './device-transport.mjs';

test('connects once and requests through the transport', async () => {
  let connects = 0;
  const transport = createDeviceTransport({ connect: async () => { connects += 1; return { request: async (message) => ({ ok: true, message }) }; } });
  assert.deepEqual(await transport.request({ type: 'hello' }), { ok: true, message: { type: 'hello' } });
  assert.deepEqual(await transport.request({ type: 'state' }), { ok: true, message: { type: 'state' } });
  assert.equal(connects, 1);
  transport.close();
});

test('fails closed when the device does not connect in time', async () => {
  const transport = createDeviceTransport({ connect: () => new Promise(() => {}), timeoutMs: 5 });
  await assert.rejects(transport.connect(), /timed out/);
});
