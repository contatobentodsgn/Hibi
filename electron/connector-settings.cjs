const fs = require('node:fs');
const path = require('node:path');

const MAX_TARGETS = 50;
const MAX_CHECKPOINTS = 5_000;
const isConnectorId = (value) => typeof value === 'string' && /^[a-z0-9-]{1,80}$/.test(value);
const isTargetId = (value) => typeof value === 'string' && value.trim().length > 0 && value.length <= 240;

// O endpoint é escolhido pela pessoa usuária, então precisa passar pela mesma
// barreira das demais chamadas remotas: HTTPS, sem credencial embutida na URL.
function normalizeEndpoint(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || value.length > 2_048) throw new Error('Connector endpoint is invalid.');
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('Connector endpoint is invalid.'); }
  if (url.protocol !== 'https:') throw new Error('Connector endpoint must use HTTPS.');
  if (url.username || url.password) throw new Error('Connector endpoint must not embed credentials.');
  if (url.search || url.hash) throw new Error('Connector endpoint must not carry a query or fragment.');
  return url.toString().endsWith('/') ? url.toString() : `${url.toString()}/`;
}

function normalizeClientId(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || !/^[\w.:-]{1,200}$/.test(value.trim())) throw new Error('Connector client identifier is invalid.');
  return value.trim();
}

function normalizeTargets(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_TARGETS) throw new Error('Connector import selection is invalid.');
  const targets = value.map((entry) => {
    if (!entry || typeof entry !== 'object' || !isTargetId(entry.id)) throw new Error('Connector import selection is invalid.');
    const label = typeof entry.label === 'string' && entry.label.trim() ? entry.label.trim().slice(0, 240) : entry.id;
    return { id: entry.id, label };
  });
  const unique = new Map(targets.map((entry) => [entry.id, entry]));
  return [...unique.values()];
}

const optionalText = (value, maximum = 240) => value === undefined || value === null || value === '' ? '' : typeof value === 'string' && value.trim() && value.length <= maximum ? value.trim() : null;
const isoOrEmpty = (value) => {
  const text = optionalText(value);
  if (text === null || (text && Number.isNaN(Date.parse(text)))) throw new Error('Notion sync settings are invalid.');
  return text;
};
const count = (value) => Number.isInteger(value) && value >= 0 && value <= 100_000 ? value : 0;

function normalizeNotion(value) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object') throw new Error('Notion sync settings are invalid.');
  const workspaceLabel = optionalText(value.workspaceLabel, 240);
  const parentPageId = optionalText(value.parentPageId);
  const databaseId = optionalText(value.databaseId);
  const dataSourceId = optionalText(value.dataSourceId);
  if ([workspaceLabel, parentPageId, databaseId, dataSourceId].includes(null)) throw new Error('Notion sync settings are invalid.');
  if (!Array.isArray(value.checkpoints ?? []) || (value.checkpoints ?? []).length > MAX_CHECKPOINTS) throw new Error('Notion sync settings are invalid.');
  const checkpoints = (value.checkpoints ?? []).map((entry) => {
    if (!entry || typeof entry !== 'object' || !isTargetId(entry.localId) || !isTargetId(entry.remoteId) || typeof entry.localHash !== 'string' || !/^[a-f0-9]{8,128}$/i.test(entry.localHash) || !isTargetId(entry.remoteRevision)) throw new Error('Notion sync settings are invalid.');
    return { localId: entry.localId, remoteId: entry.remoteId, localHash: entry.localHash, remoteRevision: entry.remoteRevision };
  });
  const summary = value.lastSummary && typeof value.lastSummary === 'object' ? value.lastSummary : {};
  return {
    workspaceLabel, parentPageId, databaseId, dataSourceId,
    lastSyncAt: isoOrEmpty(value.lastSyncAt),
    lastSummary: { imported: count(summary.imported), pushed: count(summary.pushed), updated: count(summary.updated), skipped: count(summary.skipped), failed: count(summary.failed), conflicts: count(summary.conflicts) },
    checkpoints,
  };
}

const normalizeEntry = (value) => {
  const notion = normalizeNotion(value?.notion);
  return { endpoint: normalizeEndpoint(value?.endpoint), clientId: normalizeClientId(value?.clientId), targets: normalizeTargets(value?.targets), ...(notion ? { notion } : {}) };
};

function createConnectorSettings({ filePath } = {}) {
  if (typeof filePath !== 'string' || !filePath.trim() || filePath.length > 4_096) throw new Error('A connector settings file path is required.');
  const readAll = () => {
    let parsed;
    try { parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return {}; }
    if (!parsed || typeof parsed !== 'object') return {};
    const entries = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (!isConnectorId(id)) continue;
      try { entries[id] = normalizeEntry(value); } catch { /* descarta entradas corrompidas em vez de falhar a abertura */ }
    }
    return entries;
  };
  const write = (entries) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
    fs.writeFileSync(filePath, JSON.stringify(entries), { encoding: 'utf8', mode: 0o600 });
    fs.chmodSync(filePath, 0o600);
  };
  return {
    filePath,
    all() { return readAll(); },
    get(connectorId) {
      if (!isConnectorId(connectorId)) throw new Error('Unknown integration connector.');
      return readAll()[connectorId] ?? { endpoint: '', clientId: '', targets: [] };
    },
    save(connectorId, patch) {
      if (!isConnectorId(connectorId)) throw new Error('Unknown integration connector.');
      const entries = readAll();
      const current = entries[connectorId] ?? { endpoint: '', clientId: '', targets: [] };
      const next = normalizeEntry({
        endpoint: patch?.endpoint === undefined ? current.endpoint : patch.endpoint,
        clientId: patch?.clientId === undefined ? current.clientId : patch.clientId,
        targets: patch?.targets === undefined ? current.targets : patch.targets,
        notion: patch?.notion === undefined ? current.notion : patch.notion,
      });
      entries[connectorId] = next;
      write(entries);
      return next;
    },
  };
}

module.exports = { MAX_TARGETS, MAX_CHECKPOINTS, createConnectorSettings, normalizeClientId, normalizeEndpoint, normalizeTargets, normalizeNotion };
