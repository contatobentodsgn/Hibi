const crypto = require('node:crypto');

const MAX_BODY_BYTES = 256 * 1024;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_AUDIT_ENTRIES = 200;
const MAX_TEXT = 500;

const boundedText = (value, maximum = MAX_TEXT) => typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
const connectorId = (value) => boundedText(value, 80) && /^[a-z0-9-]+$/.test(value);
const redact = (value) => String(value ?? '')
  .replace(/authorization\s*:\s*(?:Bearer|Basic)\s+[^\s,;]+/gi, 'Authorization: [redacted]')
  .replace(/(?:Bearer\s+|Basic\s+|token[\s:=]+|api[_-]?key[\s:=]+)[^\s,;]+/gi, (match) => `${match.split(/[\s:=]/, 1)[0]} [redacted]`)
  .replace(/sk-[^\s,;]+/gi, '[redacted]')
  .slice(0, MAX_TEXT);

function sanitizeIntegrationAudit(value) {
  if (!value || typeof value !== 'object') return null;
  if (!boundedText(value.action, 80) || !connectorId(value.connectorId) || !boundedText(value.detail)) return null;
  return { action: value.action, connectorId: value.connectorId, detail: redact(value.detail) };
}

function validateConnector(connector) {
  if (!connector || typeof connector !== 'object' || !connectorId(connector.id) || !boundedText(connector.label, 120)) throw new Error('Invalid integration connector.');
  if (!Array.isArray(connector.allowedHosts) || connector.allowedHosts.length === 0 || connector.allowedHosts.some((host) => !boundedText(host, 253) || host !== host.toLowerCase())) throw new Error('Integration connector requires a safe host allowlist.');
  if (!Array.isArray(connector.capabilities) || connector.capabilities.some((value) => !boundedText(value, 80))) throw new Error('Invalid connector capabilities.');
  return connector;
}

async function boundedResponse(response) {
  const contentLength = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) throw new Error('Integration response exceeds the size limit.');
  if (!response.body?.getReader) return response;
  const reader = response.body.getReader();
  const parts = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new Error('Integration response exceeds the size limit.'); }
      parts.push(Buffer.from(value));
    }
  } finally { reader.releaseLock?.(); }
  return new Response(Buffer.concat(parts), { status: response.status, statusText: response.statusText, headers: response.headers });
}

function createSafeIntegrationFetch({ connector, fetch = globalThis.fetch, timeoutMs = 10_000 }) {
  validateConnector(connector);
  if (typeof fetch !== 'function') throw new Error('A fetch implementation is required.');
  return async (rawUrl, init = {}) => {
    let url;
    try { url = new URL(rawUrl); } catch { throw new Error('Invalid integration URL.'); }
    if (url.protocol !== 'https:') throw new Error('Integration requests require HTTPS.');
    if (!connector.allowedHosts.includes(url.hostname.toLowerCase())) throw new Error('Integration URL is not allowed for this connector.');
    const body = init.body;
    const bodyBytes = typeof body === 'string' || Buffer.isBuffer(body) || body instanceof Uint8Array ? Buffer.byteLength(body) : 0;
    if (bodyBytes > MAX_BODY_BYTES) throw new Error('Integration request exceeds the size limit.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(Math.max(1, timeoutMs), 60_000));
    try {
      const response = await fetch(url.toString(), { ...init, redirect: 'error', signal: controller.signal });
      return boundedResponse(response);
    } catch (error) {
      if (error?.message?.includes('size limit')) throw error;
      throw new Error('Integration request failed.');
    } finally { clearTimeout(timer); }
  };
}

function createIntegrationManager({ connectors = [], keychain, now = () => new Date().toISOString() } = {}) {
  if (!keychain || typeof keychain.set !== 'function' || typeof keychain.has !== 'function' || typeof keychain.remove !== 'function') throw new Error('A Keychain implementation is required.');
  const registered = new Map(connectors.map((connector) => { validateConnector(connector); return [connector.id, connector]; }));
  if (registered.size !== connectors.length) throw new Error('Integration connector IDs must be unique.');
  const prepared = new Map();
  const audits = [];
  const accountFor = (id) => `integration:${id}`;
  const appendAudit = (value) => { const event = sanitizeIntegrationAudit(value); if (event) audits.unshift({ at: now(), ...event }); if (audits.length > MAX_AUDIT_ENTRIES) audits.length = MAX_AUDIT_ENTRIES; };
  const getConnector = (id) => { const connector = registered.get(id); if (!connector) throw new Error('Unknown integration connector.'); return connector; };
  const statusFor = async (connector) => ({ id: connector.id, label: connector.label, state: await keychain.has(accountFor(connector.id)) ? 'connected' : 'disconnected', capabilities: [...connector.capabilities], hasCredential: await keychain.has(accountFor(connector.id)) });
  return {
    async listStatus() { return Promise.all([...registered.values()].map(statusFor)); },
    async connect(id, input) {
      const connector = getConnector(id);
      if (!boundedText(input?.credential, 8_192)) throw new Error('A credential is required to connect this integration.');
      await keychain.set(accountFor(id), input.credential);
      appendAudit({ action: 'connect', connectorId: id, detail: 'Integration connected.' });
      return statusFor(connector);
    },
    async revoke(id) {
      const connector = getConnector(id);
      await keychain.remove(accountFor(id));
      appendAudit({ action: 'revoke', connectorId: id, detail: 'Integration credential revoked.' });
      return statusFor(connector);
    },
    async prepareAction(input) {
      const connector = getConnector(input?.connectorId);
      if (!connector.capabilities.includes('write') || !boundedText(input?.kind, 120)) throw new Error('This integration cannot prepare that action.');
      const serialized = JSON.stringify(input.payload ?? {});
      if (Buffer.byteLength(serialized) > MAX_BODY_BYTES) throw new Error('Integration action exceeds the size limit.');
      const id = `action-${crypto.randomUUID()}`;
      const confirmationId = `confirm-${crypto.randomUUID()}`;
      prepared.set(id, { connector, kind: input.kind, payload: JSON.parse(serialized), confirmationId });
      appendAudit({ action: 'prepare', connectorId: connector.id, detail: `Prepared ${input.kind}.` });
      return { id, connectorId: connector.id, kind: input.kind, confirmationId, requiresConfirmation: true };
    },
    async executeApproved(input) {
      const action = prepared.get(input?.actionId);
      if (!action || input?.confirmationId !== action.confirmationId) throw new Error('A matching confirmation is required before executing this integration action.');
      prepared.delete(input.actionId);
      if (typeof action.connector.executeApproved !== 'function') throw new Error('This integration does not support approved execution.');
      const result = await action.connector.executeApproved({ kind: action.kind, payload: action.payload });
      appendAudit({ action: 'execute', connectorId: action.connector.id, detail: `Executed approved ${action.kind}.` });
      return result;
    },
    async audit() { return audits.map(({ at, action, connectorId, detail }) => ({ at, action, connectorId, detail })); },
    getConnector,
    createSafeFetch(id, options = {}) { return createSafeIntegrationFetch({ connector: getConnector(id), ...options }); },
  };
}

module.exports = { MAX_BODY_BYTES, MAX_RESPONSE_BYTES, createIntegrationManager, createSafeIntegrationFetch, sanitizeIntegrationAudit };
