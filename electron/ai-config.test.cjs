const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createAiConfiguration, createMacKeychain, verifyAndSaveAiConfiguration } = require('./ai-config.cjs');

const tempFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hibi-ai-config-')), 'config.json');

test('stores provider preferences without persisting the API key', async () => {
  const calls = [];
  const config = createAiConfiguration({ filePath: tempFile(), keychain: { set: async (...args) => calls.push(['set', ...args]), has: async () => true, remove: async () => true } });

  const status = await config.save({ provider: 'openai-compatible', endpoint: 'https://api.example.test/v1/chat/completions', model: 'gpt-test', apiKey: 'secret-value' });

  assert.deepEqual(JSON.parse(fs.readFileSync(config.filePath, 'utf8')), { provider: 'openai-compatible', endpoint: 'https://api.example.test/v1/chat/completions', model: 'gpt-test' });
  assert.deepEqual(calls, [['set', 'openai-compatible', 'secret-value']]);
  assert.deepEqual(status, { provider: 'openai-compatible', endpoint: 'https://api.example.test/v1/chat/completions', model: 'gpt-test', hasApiKey: true });
});

test('rejects unsafe endpoints and never reports an API key', async () => {
  const config = createAiConfiguration({ filePath: tempFile(), keychain: { set: async () => undefined, has: async () => false, remove: async () => true } });

  await assert.rejects(() => config.save({ provider: 'openai-compatible', endpoint: 'http://example.test', model: 'gpt-test' }), /HTTPS/);
  assert.deepEqual(await config.getStatus(), { provider: 'local', endpoint: '', model: 'local-tool-provider', hasApiKey: false });
});

test('uses the native Keychain bridge without serializing the API key', async () => {
  const calls = [];
  const keychain = createMacKeychain({ bridge: { available: () => true, set: (...args) => calls.push(['set', ...args]), has: () => true, remove: () => true } });

  await keychain.set('openai-compatible', 'secret-value');

  assert.deepEqual(calls, [['set', 'openai-compatible', 'secret-value']]);
});

test('does not accept credentials for the local-only provider', async () => {
  const config = createAiConfiguration({ filePath: tempFile(), keychain: { set: async () => { throw new Error('must not write'); }, has: async () => false, remove: async () => true } });

  await assert.rejects(() => config.save({ provider: 'local', endpoint: '', model: 'local-tool-provider', apiKey: 'secret-value' }), /external provider/);
});

test('does not persist a candidate configuration when its connection test fails', async () => {
  const filePath = tempFile();
  const calls = [];
  const config = createAiConfiguration({ filePath, keychain: { set: async (...args) => calls.push(args), has: async () => false, get: async () => 'secret-value', remove: async () => true } });

  await assert.rejects(() => verifyAndSaveAiConfiguration({ configuration: config, value: { provider: 'openai-compatible', endpoint: 'https://api.example.test/v1', model: 'gpt-test', apiKey: 'secret-value' }, verifyCandidate: async (candidate) => { assert.equal(candidate.apiKey, 'secret-value'); throw new Error('Provider request failed (401).'); } }), /401/);

  assert.equal(fs.existsSync(filePath), false);
  assert.deepEqual(calls, []);
});

test('saves only after a candidate connection succeeds', async () => {
  const config = createAiConfiguration({ filePath: tempFile(), keychain: { set: async () => undefined, has: async () => true, get: async () => 'secret-value', remove: async () => true } });
  let candidate;

  const status = await verifyAndSaveAiConfiguration({ configuration: config, value: { provider: 'openai-compatible', endpoint: 'https://api.example.test/v1', model: 'gpt-test', apiKey: 'secret-value' }, verifyCandidate: async (value) => { candidate = value; } });

  assert.equal(candidate.model, 'gpt-test');
  assert.equal(status.hasApiKey, true);
});
