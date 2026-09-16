const test = require("node:test");
const assert = require("node:assert/strict");
const { createIntegrationManager } = require("./integrations.cjs");
const { createGoogleCalendarConnector } = require("./connectors/google-calendar.cjs");
const { createCalendarSyncService } = require("./calendar-sync-service.cjs");
const { toInstant, toOffsetIso } = require("./calendar-time.cjs");

// Serviço, gerenciador de integrações e conector do Google reais, juntos, com só a rede falsa. Testar
// cada peça isolada deixou passar o defeito que aparece exatamente aqui: o conector devolvia um
// resultado que o gerenciador não reconhecia como sucesso, então o evento nascia no Google e o vínculo
// local nunca era gravado.
const keychainWith = (credential) => {
  const values = new Map([["integration:google-calendar", credential]]);
  return {
    async set(account, secret) { values.set(account, secret); },
    async get(account) { return values.get(account); },
    async has(account) { return values.has(account); },
    async remove(account) { values.delete(account); },
  };
};
const memorySettings = (initial) => {
  let stored = { calendars: [], sources: [], links: [], conflicts: [], pending: [], ...initial };
  return { get: () => stored, save: (value) => { stored = value; return value; }, current: () => stored };
};
const block = { id: "block-1", title: "Kabrito Post 01", startsAt: "2026-09-16T09:00:00", endsAt: "2026-09-16T10:00:00" };
const local = (value) => toOffsetIso(toInstant(value));

const publishThrough = async ({ respond, calendarSettings }) => {
  const calls = [];
  const manager = createIntegrationManager({
    keychain: keychainWith("credencial-de-teste"),
    connectors: [createGoogleCalendarConnector({})],
    fetch: async (url, init) => {
      calls.push({ url: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body) : undefined });
      return respond(calls.length, String(url), init?.method ?? "GET");
    },
  });
  const service = createCalendarSyncService({
    eventKit: { available: () => false, authorizationStatus: () => "unavailable" },
    integrations: manager,
    settings: { get: () => ({ targets: [{ id: "primary", label: "Hibi Teste" }] }) },
    calendarSettings,
    workspace: () => ({ blocks: [{ id: "block-1", title: block.title, start: block.startsAt, end: block.endsAt, category: "work" }] }),
    timeZone: () => "America/Sao_Paulo",
    randomEventId: () => "0123456789abcdef0123456789abcdef",
  });
  const action = await service.preparePublish({ calendarId: "google:primary", block });
  const result = await service.executeApproved({ actionId: action.id, confirmationId: action.confirmationId });
  return { calls, result, service };
};

test("publicar no Google grava o vínculo local, com o evento criado de verdade", async () => {
  const calendarSettings = memorySettings({ calendars: [{ id: "google:primary", mode: "bidirectional" }] });

  const { calls, result } = await publishThrough({
    calendarSettings,
    respond: () => new Response(JSON.stringify({ id: "google-event-1", etag: '"etag-1"' }), { status: 200, headers: { "content-type": "application/json" } }),
  });

  assert.deepEqual(result, { remoteId: "google-event-1", revision: '"etag-1"' });
  // O vínculo é o que faz a leitura seguinte reconhecer edição, movimento e exclusão do evento.
  const stored = calendarSettings.current();
  assert.deepEqual(stored.links.map((link) => [link.localId, link.calendarId, link.remoteId, link.remoteRevision]), [["block-1", "google:primary", "google-event-1", '"etag-1"']]);
  assert.deepEqual(stored.pending, []);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "POST");
  assert.deepEqual(calls[0].body, {
    id: "0123456789abcdef0123456789abcdef",
    summary: "Kabrito Post 01",
    start: { dateTime: local("2026-09-16T09:00:00"), timeZone: "America/Sao_Paulo" },
    end: { dateTime: local("2026-09-16T10:00:00"), timeZone: "America/Sao_Paulo" },
  });
});

test("repetir a publicação adota o evento que já existe, sem duplicar e com vínculo", async () => {
  const calendarSettings = memorySettings({ calendars: [{ id: "google:primary", mode: "bidirectional" }] });

  const { calls, result } = await publishThrough({
    calendarSettings,
    respond: (attempt, _url, method) =>
      method === "POST"
        ? new Response(JSON.stringify({ error: { code: 409, message: "The requested identifier already exists." } }), { status: 409, headers: { "content-type": "application/json" } })
        : new Response(JSON.stringify({ id: "0123456789abcdef0123456789abcdef", etag: '"etag-9"', status: "confirmed" }), { status: 200, headers: { "content-type": "application/json" } }),
  });

  assert.deepEqual(result, { remoteId: "0123456789abcdef0123456789abcdef", revision: '"etag-9"' });
  assert.deepEqual(calls.map((call) => call.method), ["POST", "GET"]);
  assert.deepEqual(calendarSettings.current().links.map((link) => link.remoteId), ["0123456789abcdef0123456789abcdef"]);
});

test("uma recusa do Google não vira vínculo, e a intenção fica registrada para a próxima tentativa", async () => {
  const calendarSettings = memorySettings({ calendars: [{ id: "google:primary", mode: "bidirectional" }] });

  await assert.rejects(
    publishThrough({
      calendarSettings,
      respond: () => new Response(JSON.stringify({ error: { message: "quota" } }), { status: 429, headers: { "content-type": "application/json" } }),
    }),
    /rate limited|could not create/i,
  );

  assert.deepEqual(calendarSettings.current().links, []);
  // A intenção gravada antes da escrita é o que permite adotar o evento se ele tiver sido criado.
  assert.deepEqual(calendarSettings.current().pending.map((entry) => [entry.localId, entry.calendarId, entry.eventId]), [["block-1", "google:primary", "0123456789abcdef0123456789abcdef"]]);
});
