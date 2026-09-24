const test = require('node:test');
const assert = require('node:assert/strict');
const { createNotionConnector, NOTION_VERSION } = require('./notion.cjs');
const { createSlackConnector } = require('./slack.cjs');
const { createEmailConnector } = require('./email.cjs');
const { createRemoteNotificationConnector } = require('./remote-notifications.cjs');
const { createConnectorSettings } = require('../connector-settings.cjs');
const { buildConnectors } = require('./index.cjs');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('ships Google Calendar with an official OAuth PKCE configuration', () => {
  const settings = createConnectorSettings({ filePath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hibi-google-calendar-')), 'connectors.json') });
  const google = buildConnectors(settings).find((connector) => connector.id === 'google-calendar');

  assert.equal(google?.oauth?.pkce, true);
  assert.equal(google?.oauth?.authorizationUrl, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(google?.oauth?.tokenUrl, 'https://oauth2.googleapis.com/token');
});

test('normalizes a Notion page without copying its body', () => {
  const notion = createNotionConnector();
  const candidate = notion.normalizeImport({ id: 'page-1', last_edited_time: '2026-09-09T12:00:00Z', properties: {
    Name: { title: [{ plain_text: 'Project brief' }] }, Status: { select: { name: 'Paused' } }, Start: { date: { start: '2026-09-10T09:00:00-03:00' } },
    'Duration minutes': { number: 45 }, Description: { rich_text: [{ plain_text: 'Context' }] }, 'Hibi ID': { rich_text: [{ plain_text: 'task-1' }] },
  }, children: [{ text: 'private body' }] });

  assert.deepEqual(candidate, { remoteId: 'page-1', revision: '2026-09-09T12:00:00Z', pixanoId: 'task-1', title: 'Project brief', status: 'paused', deadline: '2026-09-10T09:00:00-03:00', durationMinutes: 45, description: 'Context', kind: 'task' });
  assert.equal(JSON.stringify(candidate).includes('private body'), false);
});

test('sends an approved Notion write to its versioned API path only', async () => {
  const calls = [];
  const notion = createNotionConnector({ request: async (url, init) => { calls.push([url, init]); return new Response('{}', { status: 200 }); } });

  await notion.executeApproved({ kind: 'notion.page.create', payload: { dataSourceId: 'source-1', task: { id: 'task-1', title: 'Task', status: 'open', durationMinutes: 60, deadline: '2026-09-10T09:00:00-03:00', description: 'Context', updatedAt: '2026-09-09T12:00:00.000Z' } }, credential: 'token' });

  assert.equal(calls[0][0], 'https://api.notion.com/v1/pages');
  assert.equal(calls[0][1].headers['Notion-Version'], NOTION_VERSION);
  const body = JSON.parse(calls[0][1].body);
  assert.deepEqual(body.parent, { type: 'data_source_id', data_source_id: 'source-1' });
  assert.equal(body.properties.Name.title[0].text.content, 'Task');
  assert.equal(body.properties['Hibi ID'].rich_text[0].text.content, 'task-1');
});

test('prepares a Slack message without posting it', async () => {
  let called = false;
  const slack = createSlackConnector({ request: async () => { called = true; throw new Error('must not post while preparing'); } });

  const prepared = slack.prepareWrite({ kind: 'slack.post', payload: { channel: 'C1', text: 'Daily status' } });

  assert.deepEqual(prepared, { kind: 'slack.post', payload: { channel: 'C1', text: 'Daily status' } });
  assert.equal(called, false);
});

test('imports only a flagged email header and sends only after approval', async () => {
  const calls = [];
  const email = createEmailConnector({ request: async (url, init) => { calls.push([url, init]); return new Response(JSON.stringify({ id: 'mail-1' }), { status: 200 }); } });

  assert.deepEqual(email.normalizeImport({ id: 'mail-1', flagged: true, subject: 'Follow up', from: 'a@example.test', body: 'private body' }), { remoteId: 'mail-1', title: 'Follow up', kind: 'email', source: 'a@example.test' });
  await email.executeApproved({ kind: 'email.send', payload: { to: 'b@example.test', subject: 'Hello', text: 'Hi' }, credential: 'secret-token' });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'https://mail.example.test/send');
  assert.equal(calls[0][1].headers.Authorization, 'Bearer secret-token');
});

test('delivers a remote notification only through an approved action', async () => {
  const calls = [];
  const notifications = createRemoteNotificationConnector({ request: async (url, init) => { calls.push([url, init]); return new Response('{}', { status: 202 }); } });

  const prepared = notifications.prepareWrite({ kind: 'notification.send', payload: { title: 'Reminder', body: 'Time to review' } });
  await notifications.executeApproved({ ...prepared, credential: 'token' });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].headers.Authorization, 'Bearer token');
});

test('o Notion consulta fontes de dados escolhidas com paginação opaca', async () => {
  const requests = [];
  const connector = createNotionConnector({ request: async (url, init) => {
    requests.push({ url, method: init.method, body: init.body, headers: init.headers });
    const page = requests.length;
    return { ok: true, json: async () => ({ results: [{ id: `page-${page}`, last_edited_time: `v${page}`, properties: { Name: { title: [{ plain_text: 'Página' }] } } }], has_more: page === 1, next_cursor: page === 1 ? 'opaque cursor/+=' : null }) };
  } });

  const pages = await connector.fetchImports({ credential: 'token', targets: [{ id: 'source 1' }] });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, 'https://api.notion.com/v1/data_sources/source%201/query');
  assert.equal(requests[0].method, 'POST');
  assert.equal(JSON.parse(requests[1].body).start_cursor, 'opaque cursor/+=');
  assert.equal(requests[0].headers['Notion-Version'], '2026-03-11');
  assert.deepEqual(pages.map((page) => connector.normalizeImport(page).title), ['Página', 'Página']);
});

test('o Notion descobre a fonte de dados de uma base', async () => {
  const requests = [];
  const connector = createNotionConnector({ request: async (url, init) => { requests.push({ url, init }); return { ok: true, json: async () => ({ id: 'db-1', data_sources: [{ id: 'source-1', name: 'Hibi Tasks' }] }) }; } });
  assert.deepEqual(await connector.discoverDataSource({ credential: 'token', databaseId: 'db-1' }), { databaseId: 'db-1', dataSourceId: 'source-1', label: 'Hibi Tasks' });
  assert.equal(requests[0].url, 'https://api.notion.com/v1/databases/db-1');
});

test('cria a base Pixano Tasks sob a página Kizuna com o esquema compatível', async () => {
  let sent;
  const connector = createNotionConnector({ request: async (url, init) => { sent = { url, body: JSON.parse(init.body) }; return new Response(JSON.stringify({ id: 'db-1' }), { status: 200 }); } });
  const prepared = connector.prepareWrite({ kind: 'notion.database.create', payload: { parentPageId: 'dd22241d14e14b298e6802525af7d2a7' } });
  await connector.executeApproved({ ...prepared, credential: 'tok' });

  assert.ok(sent.url.endsWith('/databases'));
  assert.equal(sent.body.parent.page_id, 'dd22241d14e14b298e6802525af7d2a7');
  assert.equal(sent.body.title[0].text.content, 'Pixano Tasks');
  assert.deepEqual(Object.keys(sent.body.initial_data_source.properties), ['Name', 'Status', 'Start', 'Duration minutes', 'Description', 'Hibi ID', 'Hibi updated at']);
});

// O gerenciador guarda o resultado de `prepareWrite` e `executeApproved` a prepara de
// novo. Se preparar duas vezes não der o mesmo valor, confirmar uma ação falha depois
// de o usuário já ter aprovado — foi o que quebrava a criação da base e a escrita avulsa.
test('preparar uma escrita do Notion duas vezes dá o mesmo resultado', () => {
  const connector = createNotionConnector();
  const task = { id: 'task-1', title: 'Escrever', durationMinutes: 30, status: 'open' };
  for (const input of [
    { kind: 'notion.database.create', payload: { parentPageId: 'page-kizuna' } },
    { kind: 'notion.page.create', payload: { dataSourceId: 'source-1', task } },
    { kind: 'notion.page.update', payload: { id: 'page-1', task } },
    { kind: 'notion.sync.batch', payload: { operations: [{ key: 'local:task-1', kind: 'notion.page.create', payload: { dataSourceId: 'source-1', task } }] } },
  ]) {
    const once = connector.prepareWrite(input);
    assert.deepEqual(connector.prepareWrite(once), once, `${input.kind} não é idempotente`);
  }
});

test('executa lote do Notion e preserva êxitos quando um item falha', async () => {
  const connector = createNotionConnector({ request: async (url) => {
    if (url.endsWith('/pages/page-fail')) throw new Error('temporarily unavailable');
    return new Response(JSON.stringify({ id: 'page-ok', last_edited_time: 'v2' }), { status: 200 });
  } });
  const result = await connector.executeApproved({ kind: 'notion.sync.batch', credential: 'token', payload: { operations: [
    { key: 'create:task-1', kind: 'notion.page.create', payload: { dataSourceId: 'source-1', task: { id: 'task-1', title: 'One', status: 'open', durationMinutes: 60 } } },
    { key: 'update:task-2', kind: 'notion.page.update', payload: { id: 'page-fail', task: { id: 'task-2', title: 'Two', status: 'open', durationMinutes: 60 } } },
  ] } });
  assert.equal(result.ok, false);
  assert.deepEqual(result.items[0], { key: 'create:task-1', ok: true, status: 200, remoteId: 'page-ok', revision: 'v2' });
  assert.equal(result.items[1].key, 'update:task-2');
  assert.equal(result.items[1].ok, false);
});

test('traduz credencial, permissão e limite do Notion em falhas acionáveis', async () => {
  const responses = [
    new Response('{}', { status: 401 }),
    new Response('{}', { status: 403 }),
    new Response('{}', { status: 429, headers: { 'Retry-After': '7' } }),
  ];
  const connector = createNotionConnector({ request: async () => responses.shift() });
  await assert.rejects(connector.testConnection({ credential: 'token' }), /Reconnect/);
  await assert.rejects(connector.discoverDataSource({ credential: 'token', databaseId: 'db-1' }), /Share it with the Pixano integration/);
  await assert.rejects(connector.fetchImports({ credential: 'token', targets: [{ id: 'source-1' }] }), /7 seconds/);
});

test('o Slack lê itens salvos e descarta canais fora da seleção', async () => {
  const connector = createSlackConnector({ request: async () => ({ ok: true, json: async () => ({ ok: true, items: [
    { channel: 'C1', message: { ts: '1.1', text: 'guardado' } },
    { channel: 'C9', message: { ts: '9.9', text: 'outro canal' } },
    { channel: 'C1' },
  ] }) }) });

  const items = await connector.fetchImports({ credential: 'token', targets: [{ id: 'C1' }] });
  assert.deepEqual(items, [{ id: 'C1:1.1', saved: true, text: 'guardado', channel: 'C1', updatedAt: '1.1' }]);
  assert.deepEqual(connector.normalizeImport(items[0]), { remoteId: 'C1:1.1', revision: '1.1', title: 'guardado', kind: 'task', source: 'C1' });
});

test('o e-mail busca somente mensagens sinalizadas das caixas escolhidas', async () => {
  const requests = [];
  const connector = createEmailConnector({ request: async (url) => { requests.push(url); return { ok: true, json: async () => ({ messages: [{ id: 'm1', flagged: true, subject: 'Assunto', from: 'alguem@example.test' }] }) }; } });

  const messages = await connector.fetchImports({ credential: 'token', targets: [{ id: 'INBOX' }] });
  assert.match(requests[0], /messages\?mailbox=INBOX&flagged=true&limit=50$/);
  assert.deepEqual(connector.normalizeImport(messages[0]), { remoteId: 'm1', title: 'Assunto', kind: 'email', source: 'alguem@example.test' });
});

test('uma falha de leitura interrompe a importação em vez de devolver resultado parcial', async () => {
  const connector = createEmailConnector({ request: async () => ({ ok: false, json: async () => ({}) }) });
  await assert.rejects(connector.fetchImports({ credential: 'token', targets: [{ id: 'INBOX' }] }), /could not read/);
});
