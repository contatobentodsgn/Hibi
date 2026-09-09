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
