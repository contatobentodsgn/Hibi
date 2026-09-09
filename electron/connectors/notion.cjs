const titleFrom = (properties) => {
  if (!properties || typeof properties !== 'object') return 'Untitled Notion page';
  for (const property of Object.values(properties)) {
    const title = property?.title;
    if (Array.isArray(title) && typeof title[0]?.plain_text === 'string' && title[0].plain_text.trim()) return title[0].plain_text.trim().slice(0, 240);
  }
  return 'Untitled Notion page';
};

function createNotionConnector({ baseUrl = 'https://api.notion.com/v1', request } = {}) {
  const url = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  const call = async (path, init, override) => (override ?? request)(new URL(path, url).toString(), init);
  return {
    id: 'notion', label: 'Notion', allowedHosts: [url.hostname], capabilities: ['import', 'write', 'sync'],
    oauth: { pkce: true, authorizationUrl: 'https://api.notion.com/v1/oauth/authorize', tokenUrl: 'https://api.notion.com/v1/oauth/token', scopes: [] },
    normalizeImport(page) {
      if (!page || typeof page.id !== 'string' || !page.id) return null;
      return { remoteId: page.id, ...(typeof page.last_edited_time === 'string' ? { revision: page.last_edited_time } : {}), title: titleFrom(page.properties), kind: 'task' };
    },
    // Somente leitura: confirma a credencial sem tocar em nenhuma página.
    async testConnection({ credential, request: override }) {
      const response = await call('users/me', { method: 'GET', headers: { Authorization: `Bearer ${credential}`, 'Notion-Version': '2022-06-28' } }, override);
      if (!response?.ok) throw new Error('Notion rejected this credential.');
      const body = await response.json().catch(() => ({}));
      return { ok: true, detail: typeof body?.name === 'string' && body.name.trim() ? `Connected as ${body.name.trim().slice(0, 120)}.` : 'Credential accepted by Notion.' };
    },
    async listImportTargets({ credential, request: override }) {
      const response = await call('search', { method: 'POST', headers: { Authorization: `Bearer ${credential}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, body: JSON.stringify({ filter: { value: 'database', property: 'object' }, page_size: 50 }) }, override);
      if (!response?.ok) throw new Error('Notion could not list databases.');
      const body = await response.json().catch(() => ({}));
      return (Array.isArray(body?.results) ? body.results : []).flatMap((entry) => typeof entry?.id === 'string' && entry.id ? [{ id: entry.id, label: titleFrom(entry.title ? { title: { title: entry.title } } : entry.properties) }] : []);
    },
    prepareWrite(input) {
      if (!input || !['notion.page.create', 'notion.page.update'].includes(input.kind)) throw new Error('Unsupported Notion write action.');
      return { kind: input.kind, payload: structuredClone(input.payload ?? {}) };
    },
    async executeApproved({ kind, payload, credential, request: override }) {
      const prepared = this.prepareWrite({ kind, payload });
      const path = kind === 'notion.page.create' ? 'pages' : `pages/${encodeURIComponent(String(prepared.payload.id ?? ''))}`;
      return call(path, { method: kind === 'notion.page.create' ? 'POST' : 'PATCH', headers: { Authorization: `Bearer ${credential}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, body: JSON.stringify(prepared.payload) }, override);
    },
  };
}

module.exports = { createNotionConnector };
