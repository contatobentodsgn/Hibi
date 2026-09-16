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

test('não deixa o limite de tempo armado quando a conexão falha', async () => {
  const transport = createDeviceTransport({ connect: async () => { throw new Error('porta ocupada'); }, timeoutMs: 30_000 });

  await assert.rejects(transport.connect(), /porta ocupada/);

  // Um timer sobrevivente seguraria o event loop por 30 segundos e rejeitaria uma promessa órfã.
  assert.deepEqual(process.getActiveResourcesInfo().filter((resource) => resource === 'Timeout'), []);
});

test('uma conexão que falhou não é reaproveitada', async () => {
  let attempts = 0;
  const transport = createDeviceTransport({
    connect: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('aparelho ausente');
      return { request: async (message) => ({ ok: true, message }) };
    },
  });

  await assert.rejects(transport.request({ type: 'hello' }), /aparelho ausente/);
  assert.deepEqual(await transport.request({ type: 'hello' }), { ok: true, message: { type: 'hello' } });
  assert.equal(attempts, 2);
  transport.close();
});
