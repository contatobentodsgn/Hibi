const fs = require('node:fs');
const path = require('node:path');
const nativeKeychain = require('../native/notch/keychain.cjs');
const SERVICE = 'com.hibi.study.ai';
const DEFAULT_CONFIG = Object.freeze({ provider: 'local', endpoint: '', model: 'local-tool-provider' });
const PROVIDERS = new Set(['local', 'openai-compatible']);

const isBoundedText = (value, maximum) => typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
const isSafeEndpoint = (value) => {
  if (value === '') return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || (url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname));
  } catch { return false; }
};

function validateConfig(value) {
  if (!value || typeof value !== 'object' || !PROVIDERS.has(value.provider)) throw new Error('Invalid AI provider.');
  const provider = value.provider;
  const endpoint = typeof value.endpoint === 'string' ? value.endpoint.trim() : '';
  const model = typeof value.model === 'string' ? value.model.trim() : '';
  if (!isSafeEndpoint(endpoint)) throw new Error('AI endpoint must use HTTPS or local loopback HTTP.');
  if (provider === 'openai-compatible' && (!isBoundedText(endpoint, 2_048) || !isBoundedText(model, 240))) throw new Error('External AI requires an endpoint and model.');
  if (provider === 'local') return { ...DEFAULT_CONFIG };
  return { provider, endpoint, model };
}

function createMacKeychain({ bridge = nativeKeychain } = {}) {
  const available = () => bridge.available?.() === true;
  const requireBridge = () => { if (!available()) throw new Error('macOS Keychain bridge is unavailable.'); };
  return {
    async set(account, secret) {
      if (!isBoundedText(secret, 8_192)) throw new Error('Invalid API key.');
      requireBridge(); bridge.set(account, secret);
    },
    async has(account) {
      return available() && bridge.has(account) === true;
    },
    async get(account) {
      requireBridge(); const secret = bridge.get(account); if (typeof secret !== 'string' || !secret) throw new Error('No API key is stored for this provider.'); return secret;
    },
    async remove(account) {
      return available() && bridge.remove(account) === true;
    },
  };
}

function createAiConfiguration({ filePath, keychain = createMacKeychain() }) {
  if (!isBoundedText(filePath, 4_096)) throw new Error('A configuration file path is required.');
  const read = () => {
    try { return validateConfig(JSON.parse(fs.readFileSync(filePath, 'utf8'))); }
    catch { return { ...DEFAULT_CONFIG }; }
  };
  const redact = async (config) => ({ ...config, hasApiKey: config.provider === 'local' ? false : await keychain.has(config.provider) });
  const write = (config) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
    fs.writeFileSync(filePath, JSON.stringify(config), { encoding: 'utf8', mode: 0o600 });
    fs.chmodSync(filePath, 0o600);
  };
  /**
   * A chave guardada pertence ao servidor para o qual foi emitida. Trocar o endereço para outro
   * servidor sem colar chave nova mandaria a chave antiga — a do Groq, por exemplo — para o servidor
   * novo: primeiro no teste de conexão, depois em toda pergunta. Mesmo servidor com caminho diferente
   * (`/v1` para `/openai/v1`) continua usando a chave.
   */
  const originOf = (endpoint) => { try { return new URL(endpoint).origin; } catch { return null; } };
  const reusesKeyForAnotherServer = async (config, value) => {
    if (typeof value.apiKey === 'string' && value.apiKey.trim()) return false;
    const saved = read();
    if (saved.provider === config.provider && originOf(saved.endpoint) === originOf(config.endpoint)) return false;
    return Boolean(await keychain.get(config.provider));
  };
  const NEEDS_OWN_KEY = 'A new endpoint needs its own API key. Paste the key issued for this server.';

  return {
    filePath,
    getStatus: async () => redact(read()),
    save: async (value) => {
      const config = validateConfig(value);
      if (config.provider === 'local' && value.apiKey) throw new Error('An API key requires an external provider.');
      if (config.provider !== 'local' && await reusesKeyForAnotherServer(config, value)) throw new Error(NEEDS_OWN_KEY);
      if (value.apiKey !== undefined && value.apiKey !== '') await keychain.set(config.provider, value.apiKey);
      write(config);
      return redact(config);
    },
    deleteKey: async () => {
      const config = read();
      await keychain.remove(config.provider);
      return redact(config);
    },
    getSecret: async () => {
      const config = read();
      return config.provider === 'local' ? null : keychain.get(config.provider);
    },
    getRuntimeConfig: async () => {
      const config = read();
      return config.provider === 'local' ? {} : { ...config, apiKey: await keychain.get(config.provider) };
    },
    getCandidateRuntimeConfig: async (value) => {
      const config = validateConfig(value);
      if (config.provider === 'local') return {};
      if (await reusesKeyForAnotherServer(config, value)) throw new Error(NEEDS_OWN_KEY);
      const apiKey = typeof value.apiKey === 'string' && value.apiKey.trim() ? value.apiKey : await keychain.get(config.provider);
      return { ...config, apiKey };
    },
  };
}

async function verifyAndSaveAiConfiguration({ configuration, value, verifyCandidate }) {
  const candidate = await configuration.getCandidateRuntimeConfig(value);
  if (candidate.apiKey) await verifyCandidate(candidate);
  return configuration.save(value);
}

module.exports = { DEFAULT_CONFIG, SERVICE, createAiConfiguration, createMacKeychain, validateConfig, verifyAndSaveAiConfiguration };
