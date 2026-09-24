const NOTION_VERSION = '2026-03-11';
const MAX_PAGE_SIZE = 100;
const MAX_PAGES = 1_000;

const textFrom = (property, key) => Array.isArray(property?.[key])
  ? property[key].map((entry) => typeof entry?.plain_text === 'string' ? entry.plain_text : typeof entry?.text?.content === 'string' ? entry.text.content : '').join('').trim()
  : '';

const titleFrom = (properties) => {
  if (!properties || typeof properties !== 'object') return 'Untitled Notion page';
  for (const property of Object.values(properties)) {
    const title = textFrom(property, 'title');
    if (title) return title.slice(0, 240);
  }
  return 'Untitled Notion page';
};

const richText = (value, maximum = 2_000) => {
  const text = typeof value === 'string' ? value.trim().slice(0, maximum) : '';
  return text ? [{ type: 'text', text: { content: text } }] : [];
};

const boundedId = (value) => typeof value === 'string' && value.trim().length > 0 && value.length <= 240;
const statusToNotion = { open: 'Open', paused: 'Paused', completed: 'Completed' };
const statusFromNotion = { Open: 'open', Paused: 'paused', Completed: 'completed' };

const taskProperties = (task) => {
  if (!task || !boundedId(task.id) || typeof task.title !== 'string' || !task.title.trim() || task.title.length > 240) throw new Error('Notion task payload is invalid.');
  if (!Number.isFinite(task.durationMinutes) || task.durationMinutes < 0 || task.durationMinutes > 525_600) throw new Error('Notion task duration is invalid.');
  const status = statusToNotion[task.status ?? 'open'];
  if (!status) throw new Error('Notion task status is invalid.');
  if (task.deadline !== undefined && (!boundedId(task.deadline) || Number.isNaN(Date.parse(task.deadline)))) throw new Error('Notion task date is invalid.');
  if (task.updatedAt !== undefined && (!boundedId(task.updatedAt) || Number.isNaN(Date.parse(task.updatedAt)))) throw new Error('Notion task revision is invalid.');
  return {
    Name: { title: richText(task.title, 240) }, Status: { select: { name: status } }, Start: { date: task.deadline ? { start: task.deadline } : null },
    'Duration minutes': { number: Math.round(task.durationMinutes) }, Description: { rich_text: richText(task.description, 2_000) },
    'Hibi ID': { rich_text: richText(task.id, 240) }, 'Hibi updated at': { date: task.updatedAt ? { start: task.updatedAt } : null },
  };
};

const databaseSchema = () => ({
  Name: { title: {} }, Status: { select: { options: [{ name: 'Open' }, { name: 'Paused' }, { name: 'Completed' }] } }, Start: { date: {} },
  'Duration minutes': { number: { format: 'number' } }, Description: { rich_text: {} }, 'Hibi ID': { rich_text: {} }, 'Hibi updated at': { date: {} },
});

const failureFor = (response, fallback) => {
  const retryAfter = Number(response?.headers?.get?.('retry-after'));
  if (response?.status === 401) return new Error('Notion credential is invalid. Reconnect this integration.');
      if (response?.status === 403) return new Error('Notion cannot access the task database. Share it with the Pixano integration.');
  if (response?.status === 429) return new Error(`Notion is temporarily rate limited. Try again after ${Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter) : 30} seconds.`);
  return new Error(fallback);
};

// URLs do serviço padrão. Um endpoint próprio não as herda: o servidor de
// autorização do Notion não acompanha a base da API que a pessoa configurou.
const DEFAULT_OAUTH = { pkce: true, authorizationUrl: 'https://api.notion.com/v1/oauth/authorize', tokenUrl: 'https://api.notion.com/v1/oauth/token', scopes: [] };

function createNotionConnector({ baseUrl = 'https://api.notion.com/v1', request, oauth } = {}) {
  const url = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  const call = async (path, init, override) => {
    const transport = override ?? request;
    if (typeof transport !== 'function') throw new Error('A Notion request implementation is required.');
    return transport(new URL(path, url).toString(), init);
  };
  const headers = (credential, json = false) => ({ Authorization: `Bearer ${credential}`, 'Notion-Version': NOTION_VERSION, ...(json ? { 'Content-Type': 'application/json' } : {}) });
  const jsonOrEmpty = (response) => response.json().catch(() => ({}));
  return {
    id: 'notion', label: 'Notion', allowedHosts: [url.hostname], capabilities: ['import', 'write', 'sync'],
    // `oauth: null` remove o bloco: o conector passa a declarar que só aceita
    // credencial direta, em vez de anunciar um fluxo que seria recusado.
    ...(oauth === null ? {} : { oauth: oauth ? { ...DEFAULT_OAUTH, ...oauth } : DEFAULT_OAUTH }),
    normalizeImport(page) {
      if (!page || !boundedId(page.id)) return null;
      const properties = page.properties && typeof page.properties === 'object' ? page.properties : {};
      const statusName = properties.Status?.select?.name;
      const deadline = properties.Start?.date?.start;
      const duration = properties['Duration minutes']?.number;
      const pixanoId = textFrom(properties['Hibi ID'], 'rich_text');
      const description = textFrom(properties.Description, 'rich_text');
      return { remoteId: page.id, ...(boundedId(page.last_edited_time) ? { revision: page.last_edited_time } : {}), ...(pixanoId ? { pixanoId: pixanoId.slice(0, 240) } : {}), title: titleFrom(properties), ...(statusFromNotion[statusName] ? { status: statusFromNotion[statusName] } : {}), ...(boundedId(deadline) ? { deadline } : {}), ...(Number.isFinite(duration) ? { durationMinutes: Math.max(0, Math.round(duration)) } : {}), ...(description ? { description: description.slice(0, 2_000) } : {}), kind: 'task' };
    },
    async testConnection({ credential, request: override }) {
      const response = await call('users/me', { method: 'GET', headers: headers(credential) }, override);
      if (!response?.ok) throw failureFor(response, 'Notion rejected this credential.');
      await jsonOrEmpty(response);
      return { ok: true, detail: 'Credential accepted by Notion.' };
    },
    async listImportTargets({ credential, request: override }) {
      const targets = [];
      let cursor;
      do {
        const response = await call('search', { method: 'POST', headers: headers(credential, true), body: JSON.stringify({ filter: { value: 'data_source', property: 'object' }, page_size: MAX_PAGE_SIZE, ...(cursor ? { start_cursor: cursor } : {}) }) }, override);
        if (!response?.ok) throw failureFor(response, 'Notion could not list data sources.');
        const body = await jsonOrEmpty(response);
        for (const entry of Array.isArray(body?.results) ? body.results : []) {
          if (!boundedId(entry?.id)) continue;
          const label = typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim().slice(0, 240) : titleFrom(entry.title ? { title: { title: entry.title } } : entry.properties);
          targets.push({ id: entry.id, label });
        }
        cursor = body?.has_more === true && boundedId(body?.next_cursor) ? body.next_cursor : undefined;
      } while (cursor && targets.length < 200);
      return targets.slice(0, 200);
    },
    async discoverDataSource({ credential, databaseId, request: override }) {
      if (!boundedId(databaseId)) throw new Error('Notion database identifier is invalid.');
      const response = await call(`databases/${encodeURIComponent(databaseId)}`, { method: 'GET', headers: headers(credential) }, override);
      if (!response?.ok) throw failureFor(response, 'Notion could not retrieve this database.');
      const body = await jsonOrEmpty(response);
      const source = Array.isArray(body?.data_sources) ? body.data_sources.find((entry) => boundedId(entry?.id)) : undefined;
      if (!source) throw new Error('Notion database has no accessible data source.');
      return { databaseId: boundedId(body?.id) ? body.id : databaseId, dataSourceId: source.id, label: typeof source.name === 'string' && source.name.trim() ? source.name.trim().slice(0, 240) : 'Pixano Tasks' };
    },
    async fetchImports({ credential, request: override, targets = [], limit = 50 }) {
      const pages = [];
      for (const target of targets.slice(0, 20)) {
        if (!boundedId(target?.id)) continue;
        let cursor;
        do {
          const remaining = Math.max(1, Math.min(MAX_PAGE_SIZE, limit, MAX_PAGES - pages.length));
          const response = await call(`data_sources/${encodeURIComponent(target.id)}/query`, { method: 'POST', headers: headers(credential, true), body: JSON.stringify({ page_size: remaining, ...(cursor ? { start_cursor: cursor } : {}) }) }, override);
          if (!response?.ok) throw failureFor(response, 'Notion could not read one of the selected data sources.');
          const body = await jsonOrEmpty(response);
          for (const page of Array.isArray(body?.results) ? body.results : []) { if (pages.length < MAX_PAGES) pages.push(page); }
          cursor = body?.has_more === true && boundedId(body?.next_cursor) && pages.length < MAX_PAGES ? body.next_cursor : undefined;
        } while (cursor);
      }
      return pages;
    },
    prepareWrite(input) {
      if (!input || !['notion.database.create', 'notion.page.create', 'notion.page.update', 'notion.sync.batch'].includes(input.kind)) throw new Error('Unsupported Notion write action.');
      if (input.kind === 'notion.sync.batch') {
        const operations = input.payload?.operations;
        if (!Array.isArray(operations) || operations.length === 0 || operations.length > 100) throw new Error('Notion sync batch is invalid.');
        const safe = operations.map((operation) => {
          if (!operation || !boundedId(operation.key) || !['notion.page.create', 'notion.page.update'].includes(operation.kind)) throw new Error('Notion sync operation is invalid.');
          this.prepareWrite({ kind: operation.kind, payload: operation.payload });
          return { key: operation.key, kind: operation.kind, payload: structuredClone(operation.payload) };
        });
        return { kind: input.kind, payload: { operations: safe } };
      }
      // `prepareWrite` precisa ser idempotente: o gerenciador guarda o que ela devolve e
      // `executeApproved` a chama de novo sobre esse valor. Por isso ela valida e normaliza
      // sem trocar de forma; o corpo da API é montado só na hora de enviar.
      if (input.kind === 'notion.database.create') {
        if (!boundedId(input.payload?.parentPageId)) throw new Error('Notion parent page identifier is invalid.');
        return { kind: input.kind, payload: { parentPageId: input.payload.parentPageId } };
      }
      if (input.kind === 'notion.page.create') {
        if (!boundedId(input.payload?.dataSourceId)) throw new Error('Notion data source identifier is invalid.');
        taskProperties(input.payload?.task);
        return { kind: input.kind, payload: { dataSourceId: input.payload.dataSourceId, task: structuredClone(input.payload.task) } };
      }
      if (!boundedId(input.payload?.id)) throw new Error('Notion page identifier is invalid.');
      taskProperties(input.payload?.task);
      return { kind: input.kind, payload: { id: input.payload.id, task: structuredClone(input.payload.task) } };
    },
    async executeApproved({ kind, payload, credential, request: override }) {
      const prepared = this.prepareWrite({ kind, payload });
      if (kind === 'notion.sync.batch') {
        const items = [];
        for (const operation of prepared.payload.operations) {
          try {
            const response = await this.executeApproved({ kind: operation.kind, payload: operation.payload, credential, request: override });
            const body = await response.json().catch(() => ({}));
            items.push({ key: operation.key, ok: response.ok === true, status: response.status, ...(boundedId(body?.id) ? { remoteId: body.id } : {}), ...(boundedId(body?.last_edited_time) ? { revision: body.last_edited_time } : {}), ...(response.ok === true ? {} : { error: failureFor(response, 'Notion rejected this operation.').message }) });
          } catch {
            items.push({ key: operation.key, ok: false, error: 'Notion operation failed.' });
          }
        }
        return { ok: items.every((item) => item.ok), items };
      }
      let path = 'pages'; let method = 'POST'; let body;
      if (kind === 'notion.database.create') {
        path = 'databases';
        body = { parent: { type: 'page_id', page_id: prepared.payload.parentPageId }, title: [{ type: 'text', text: { content: 'Pixano Tasks' } }], initial_data_source: { properties: databaseSchema() } };
      } else if (kind === 'notion.page.create') {
        body = { parent: { type: 'data_source_id', data_source_id: prepared.payload.dataSourceId }, properties: taskProperties(prepared.payload.task) };
      } else {
        path = `pages/${encodeURIComponent(prepared.payload.id)}`; method = 'PATCH';
        body = { properties: taskProperties(prepared.payload.task) };
      }
      return call(path, { method, headers: headers(credential, true), body: JSON.stringify(body) }, override);
    },
  };
}

module.exports = { createNotionConnector, NOTION_VERSION, taskProperties, databaseSchema };
