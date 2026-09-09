const test = require('node:test');
const assert = require('node:assert/strict');
const { createNotionConnector } = require('./notion.cjs');
const { createSlackConnector } = require('./slack.cjs');
const { createEmailConnector } = require('./email.cjs');
const { createRemoteNotificationConnector } = require('./remote-notifications.cjs');

test('normalizes a Notion page without copying its body', () => {
  const notion = createNotionConnector();
  const candidate = notion.normalizeImport({ id: 'page-1', last_edited_time: '2026-09-09T12:00:00Z', properties: { Name: { title: [{ plain_text: 'Project brief' }] } }, children: [{ text: 'private body' }] });

  assert.deepEqual(candidate, { remoteId: 'page-1', revision: '2026-09-09T12:00:00Z', title: 'Project brief', kind: 'task' });
  assert.equal(JSON.stringify(candidate).includes('private body'), false);
});

test('sends an approved Notion write to its versioned API path only', async () => {
  const calls = [];
  const notion = createNotionConnector({ request: async (url, init) => { calls.push([url, init]); return new Response('{}', { status: 200 }); } });

  await notion.executeApproved({ kind: 'notion.page.create', payload: { parent: { database_id: 'db-1' } }, credential: 'token' });

  assert.equal(calls[0][0], 'https://api.notion.com/v1/pages');
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

test('o Notion busca apenas as bases escolhidas e devolve páginas para normalizar', async () => {
  const requests = [];
  const connector = createNotionConnector({ request: async (url, init) => { requests.push({ url, method: init.method, body: init.body }); return { ok: true, json: async () => ({ results: [{ id: `page-${requests.length}`, last_edited_time: 'v1', properties: { Name: { title: [{ plain_text: 'Página' }] } } }] }) }; } });

  const pages = await connector.fetchImports({ credential: 'token', targets: [{ id: 'db 1' }, { id: 'db2' }] });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, 'https://api.notion.com/v1/databases/db%201/query');
  assert.equal(requests[0].method, 'POST');
  assert.deepEqual(pages.map((page) => connector.normalizeImport(page).title), ['Página', 'Página']);
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
