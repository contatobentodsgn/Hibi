const crypto = require('node:crypto');

const MAX_BODY_BYTES = 256 * 1024;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_AUDIT_ENTRIES = 200;
const MAX_IMPORT_CANDIDATES = 1_000;
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

async function safeExecutionResult(value) {
  if (value && typeof value === 'object' && typeof value.status === 'number' && typeof value.json === 'function') {
    let body = {};
    try { body = await value.json(); } catch { /* a successful remote action does not require a JSON body */ }
    const remoteId = typeof body?.id === 'string' && body.id.length <= 240 ? body.id : undefined;
    const revisionValue = body?.revision ?? body?.last_edited_time;
    const revision = typeof revisionValue === 'string' && revisionValue.length <= 240 ? revisionValue : undefined;
    // O Slack recusa uma chamada com HTTP 200 e `ok: false` no corpo, então o status
    // sozinho transformaria uma recusa em escrita bem-sucedida. Quando a resposta traz
    // essa flag, ela decide; e-mail, notificações remotas e Notion nunca a enviam, e
    // para eles o resultado continua vindo só do código HTTP.
    const ok = value.ok === true && body?.ok !== false;
    const error = ok ? undefined : redact(boundedText(body?.error, 240) ? body.error : 'The remote service refused this action.');
    return { ok, status: value.status, ...(error === undefined ? {} : { error }), ...(remoteId === undefined ? {} : { remoteId }), ...(revision === undefined ? {} : { revision }) };
  }
  if (value && typeof value === 'object') {
    const remoteId = typeof value.remoteId === 'string' && value.remoteId.length <= 240 ? value.remoteId : undefined;
    const revision = typeof value.revision === 'string' && value.revision.length <= 240 ? value.revision : undefined;
    const items = Array.isArray(value.items) ? value.items.slice(0, 500).flatMap((item) => {
      if (!item || typeof item !== 'object' || !boundedText(item.key, 240)) return [];
      const status = Number.isInteger(item.status) && item.status >= 100 && item.status <= 599 ? item.status : undefined;
      const itemRemoteId = boundedText(item.remoteId, 240) ? item.remoteId : undefined;
      const itemRevision = boundedText(item.revision, 240) ? item.revision : undefined;
      const error = boundedText(item.error, 500) ? redact(item.error) : undefined;
      return [{ key: item.key, ok: item.ok === true, ...(status === undefined ? {} : { status }), ...(itemRemoteId === undefined ? {} : { remoteId: itemRemoteId }), ...(itemRevision === undefined ? {} : { revision: itemRevision }), ...(error === undefined ? {} : { error }) }];
    }) : undefined;
    return { ok: value.ok === true, ...(remoteId === undefined ? {} : { remoteId }), ...(revision === undefined ? {} : { revision }), ...(items === undefined ? {} : { items }) };
  }
  return { ok: false };
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

// Envolve o fetch seguro recusando qualquer método que possa escrever, para que
// um teste de conexão não consiga alterar nada no serviço remoto nem por engano.
function createReadOnlyFetch(request) {
  return async (url, init = {}) => {
    const method = String(init.method ?? 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') throw new Error('A connection test cannot perform writes.');
    if (init.body !== undefined && init.body !== null) throw new Error('A connection test cannot send a request body.');
    return request(url, { ...init, method });
  };
}

// O log de auditoria não pode viver dentro do gerenciador: trocar o endpoint de um
// conector reconstrói o gerenciador (o allowlist de hosts vem do `baseUrl`) e levaria
// o histórico junto. Ele é dono do próprio limite e é passado adiante na reconstrução.
function createIntegrationAuditLog({ limit = MAX_AUDIT_ENTRIES } = {}) {
  const entries = [];
  return {
    append(value) { const event = sanitizeIntegrationAudit(value); if (!event) return; entries.unshift({ at: value.at, ...event }); if (entries.length > limit) entries.length = limit; },
    list() { return entries.map(({ at, action, connectorId, detail }) => ({ at, action, connectorId, detail })); },
  };
}

function createIntegrationManager({ connectors = [], keychain, now = () => new Date().toISOString(), fetch, auditLog = createIntegrationAuditLog() } = {}) {
  if (!keychain || typeof keychain.set !== 'function' || typeof keychain.get !== 'function' || typeof keychain.has !== 'function' || typeof keychain.remove !== 'function') throw new Error('A Keychain implementation is required.');
  const registered = new Map(connectors.map((connector) => { validateConnector(connector); return [connector.id, connector]; }));
  if (registered.size !== connectors.length) throw new Error('Integration connector IDs must be unique.');
  const prepared = new Map();
  const accountFor = (id) => `integration:${id}`;
  const appendAudit = (value) => auditLog.append({ at: now(), ...value });
  const getConnector = (id) => { const connector = registered.get(id); if (!connector) throw new Error('Unknown integration connector.'); return connector; };
  const safeFetchFor = (connector) => createSafeIntegrationFetch({ connector, ...(fetch ? { fetch } : {}) });
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
      const preparedAction = typeof connector.prepareWrite === 'function'
        ? connector.prepareWrite({ kind: input.kind, payload: input.payload ?? {} })
        : { kind: input.kind, payload: input.payload ?? {} };
      if (!preparedAction || preparedAction.kind !== input.kind || !preparedAction.payload || typeof preparedAction.payload !== 'object') throw new Error('Integration action preparation is invalid.');
      const serialized = JSON.stringify(preparedAction.payload);
      if (Buffer.byteLength(serialized) > MAX_BODY_BYTES) throw new Error('Integration action exceeds the size limit.');
      const id = `action-${crypto.randomUUID()}`;
      const confirmationId = `confirm-${crypto.randomUUID()}`;
      prepared.set(id, { connector, kind: preparedAction.kind, payload: JSON.parse(serialized), confirmationId });
      appendAudit({ action: 'prepare', connectorId: connector.id, detail: `Prepared ${input.kind}.` });
      return { id, connectorId: connector.id, kind: input.kind, confirmationId, requiresConfirmation: true };
    },
    async executeApproved(input) {
      const action = prepared.get(input?.actionId);
      if (!action || input?.confirmationId !== action.confirmationId) throw new Error('A matching confirmation is required before executing this integration action.');
      prepared.delete(input.actionId);
      if (typeof action.connector.executeApproved !== 'function') throw new Error('This integration does not support approved execution.');
      const credential = await keychain.get(accountFor(action.connector.id));
      if (!boundedText(credential, 8_192)) throw new Error('Integration credential is unavailable.');
      const result = await safeExecutionResult(await action.connector.executeApproved({ kind: action.kind, payload: action.payload, credential, request: safeFetchFor(action.connector) }));
      appendAudit({ action: 'execute', connectorId: action.connector.id, detail: result.ok ? `Executed approved ${action.kind}.` : `The service refused approved ${action.kind}: ${result.error ?? 'no reason given'}` });
      return result;
    },
    async testConnection(id) {
      const connector = getConnector(id);
      if (typeof connector.testConnection !== 'function') throw new Error('This integration does not offer a connection test.');
      const credential = await keychain.get(accountFor(id));
      if (!boundedText(credential, 8_192)) throw new Error('Integration credential is unavailable.');
      try {
        const result = await connector.testConnection({ credential, request: createReadOnlyFetch(safeFetchFor(connector)) });
        const detail = boundedText(result?.detail) ? redact(result.detail) : 'Credential accepted.';
        appendAudit({ action: 'test-connection', connectorId: id, detail });
        return { ok: true, detail };
      } catch (error) {
        const detail = redact(error instanceof Error ? error.message : 'The connection test failed.');
        appendAudit({ action: 'test-connection', connectorId: id, detail });
        return { ok: false, detail };
      }
    },
    async listImportTargets(id) {
      const connector = getConnector(id);
      if (typeof connector.listImportTargets !== 'function') throw new Error('This integration does not expose import targets.');
      const credential = await keychain.get(accountFor(id));
      if (!boundedText(credential, 8_192)) throw new Error('Integration credential is unavailable.');
      const targets = await connector.listImportTargets({ credential, request: safeFetchFor(connector) });
      const safe = (Array.isArray(targets) ? targets : []).slice(0, 200).flatMap((target) => boundedText(target?.id, 240) ? [{ id: target.id, label: boundedText(target?.label, 240) ? target.label : target.id }] : []);
      appendAudit({ action: 'list-import-targets', connectorId: id, detail: `Listed ${safe.length} import targets.` });
      return safe;
    },
    async readCalendarEvents(id, input = {}) {
      const connector = getConnector(id);
      if (typeof connector.fetchCalendarEvents !== 'function') throw new Error('This integration does not expose calendar events.');
      const credential = await keychain.get(accountFor(id));
      if (!boundedText(credential, 8_192)) throw new Error('Integration credential is unavailable.');
      const events = await connector.fetchCalendarEvents({ credential, calendarId: input.calendarId, timeMin: input.timeMin, timeMax: input.timeMax, request: safeFetchFor(connector) });
      const safe = (Array.isArray(events) ? events : []).slice(0, MAX_IMPORT_CANDIDATES).flatMap((event) => {
        if (!boundedText(event?.remoteId, 240) || !boundedText(event?.title, 240) || !boundedText(event?.startsAt, 240) || !boundedText(event?.endsAt, 240)) return [];
        if (Number.isNaN(Date.parse(event.startsAt)) || Number.isNaN(Date.parse(event.endsAt))) return [];
        return [{ remoteId: event.remoteId, ...(boundedText(event.revision, 240) ? { revision: event.revision } : {}), title: event.title, startsAt: event.startsAt, endsAt: event.endsAt, allDay: event.allDay === true, ...(event.cancelled === true ? { cancelled: true } : {}) }];
      });
      appendAudit({ action: 'calendar-read', connectorId: id, detail: `Read ${safe.length} calendar events.` });
      return safe;
    },
    async discoverDataSource(id, databaseId) {
      const connector = getConnector(id);
      if (typeof connector.discoverDataSource !== 'function' || !boundedText(databaseId, 240)) throw new Error('This integration cannot discover a data source.');
      const credential = await keychain.get(accountFor(id));
      if (!boundedText(credential, 8_192)) throw new Error('Integration credential is unavailable.');
      const result = await connector.discoverDataSource({ credential, databaseId, request: safeFetchFor(connector) });
      if (!boundedText(result?.databaseId, 240) || !boundedText(result?.dataSourceId, 240)) throw new Error('Integration returned an invalid data source.');
      const safe = { databaseId: result.databaseId, dataSourceId: result.dataSourceId, label: boundedText(result?.label, 240) ? result.label : 'Hibi Tasks' };
      appendAudit({ action: 'discover-data-source', connectorId: id, detail: 'Discovered one data source.' });
      return safe;
    },
    // Importação é leitura: busca nos alvos escolhidos e normaliza com o mesmo
    // normalizeImport já coberto por fixtures. Nada é gravado no workspace aqui;
    // a decisão por item continua sendo da pessoa usuária, na prévia.
    async listImportCandidates(id, input = {}) {
      const connector = getConnector(id);
      if (!connector.capabilities.includes('import') || typeof connector.fetchImports !== 'function' || typeof connector.normalizeImport !== 'function') throw new Error('This integration does not support importing.');
      const targets = (Array.isArray(input.targets) ? input.targets : []).flatMap((target) => boundedText(target?.id, 240) ? [{ id: target.id }] : []);
      if (targets.length === 0) throw new Error('Choose at least one source before importing.');
      const credential = await keychain.get(accountFor(id));
      if (!boundedText(credential, 8_192)) throw new Error('Integration credential is unavailable.');
      const raw = await connector.fetchImports({ credential, request: safeFetchFor(connector), targets });
      const candidates = (Array.isArray(raw) ? raw : []).slice(0, MAX_IMPORT_CANDIDATES).flatMap((item) => {
        const candidate = connector.normalizeImport(item);
        if (!candidate || !boundedText(candidate.remoteId, 240) || !boundedText(candidate.title, 240)) return [];
        const status = ['open', 'paused', 'completed'].includes(candidate.status) ? candidate.status : undefined;
        const deadline = boundedText(candidate.deadline, 240) && !Number.isNaN(Date.parse(candidate.deadline)) ? candidate.deadline : undefined;
        const durationMinutes = Number.isFinite(candidate.durationMinutes) && candidate.durationMinutes >= 0 && candidate.durationMinutes <= 525_600 ? Math.round(candidate.durationMinutes) : undefined;
        return [{ remoteId: candidate.remoteId, title: candidate.title.slice(0, 240), kind: candidate.kind === 'email' ? 'email' : 'task', ...(boundedText(candidate.revision, 240) ? { revision: candidate.revision } : {}), ...(boundedText(candidate.source, 240) ? { source: candidate.source } : {}), ...(boundedText(candidate.hibiId, 240) ? { hibiId: candidate.hibiId } : {}), ...(status ? { status } : {}), ...(deadline ? { deadline } : {}), ...(durationMinutes === undefined ? {} : { durationMinutes }), ...(boundedText(candidate.description, 2_000) ? { description: candidate.description } : {}) }];
      });
      appendAudit({ action: 'import-read', connectorId: id, detail: `Read ${candidates.length} items from ${targets.length} selected sources.` });
      return candidates;
    },
    async audit() { return auditLog.list(); },
    // Reconstrói o gerenciador com outros conectores preservando o histórico. As ações já
    // preparadas continuam sendo descartadas de propósito: uma ação preparada contra o
    // endpoint anterior não deve ser executada contra um endpoint novo.
    withConnectors(nextConnectors) { return createIntegrationManager({ connectors: nextConnectors, keychain, now, auditLog, ...(fetch ? { fetch } : {}) }); },
    getConnector,
    createSafeFetch(id, options = {}) { return createSafeIntegrationFetch({ connector: getConnector(id), ...(fetch ? { fetch } : {}), ...options }); },
  };
}

module.exports = { MAX_BODY_BYTES, MAX_RESPONSE_BYTES, createIntegrationManager, createReadOnlyFetch, createSafeIntegrationFetch, sanitizeIntegrationAudit };
