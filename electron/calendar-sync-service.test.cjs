const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { blockFingerprint, createCalendarSyncService } = require("./calendar-sync-service.cjs");
const { createCalendarSyncSettings } = require("./calendar-sync-settings.cjs");
const { toInstant, toOffsetIso } = require("./calendar-time.cjs");

// Blocos do Hibi são hora de parede flutuante, sem `Z`, do jeito que o WeekView os cria. O que chega ao
// EventKit e ao Google é o mesmo relógio com o offset da máquina.
const local = (value) => toOffsetIso(toInstant(value));
const OFFSET_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;
const DAY = { start: "2026-09-14T00:00:00", end: "2026-09-15T00:00:00" };
const block = { id: "block-1", title: "Planejar semana", startsAt: "2026-09-14T09:00:00", endsAt: "2026-09-14T10:00:00" };
const workspaceBlock = (overrides = {}) => ({ id: "block-1", title: "Planejar semana", start: "2026-09-14T09:00:00", end: "2026-09-14T10:00:00", category: "work", ...overrides });
const link = (overrides = {}) => ({ localId: "block-1", calendarId: "apple:personal", remoteId: "event-1", remoteRevision: "revision-1", localFingerprint: blockFingerprint(workspaceBlock()), ...overrides });
const inside = { remoteStartsAt: local("2026-09-14T09:00:00"), remoteEndsAt: local("2026-09-14T10:00:00") };
const memorySettings = (initial = {}) => {
  let stored = { calendars: [], sources: [], links: [], conflicts: [], pending: [], ...initial };
  const saves = [];
  return { get: () => stored, save: (value) => { saves.push(value); stored = value; return value; }, saves, current: () => stored };
};
// Grava normalmente, mas a primeira gravação de vínculo falha: é a queda entre a escrita remota e o registro local.
const crashingOnFirstLink = (memory) => {
  let crash = true;
  return { get: memory.get, save: (value) => { if (crash && value.links.length > 0) { crash = false; throw new Error("disk full"); } return memory.save(value); } };
};
const appleKit = (overrides = {}) => ({ available: () => true, authorizationStatus: () => "full-access", listCalendars: () => [{ id: "personal", label: "Pessoal", writable: true }], ...overrides });
const noApple = { available: () => false, authorizationStatus: () => "unavailable" };
const noTargets = { get: () => ({ targets: [] }) };
const googleTargets = { get: () => ({ targets: [{ id: "primary", label: "Trabalho" }] }) };
const bidirectional = (...ids) => ids.map((id) => ({ id, mode: "bidirectional" }));

test("reports only sanitized source state, without interface labels, and selected calendars", async () => {
  const service = createCalendarSyncService({
    eventKit: appleKit({ listCalendars: () => [{ id: "apple-1", label: "Personal", sourceLabel: "iCloud", writable: true }] }),
    integrations: { listStatus: async () => [{ id: "google-calendar", state: "connected" }], listImportTargets: async () => [{ id: "primary", label: "Work" }] },
    settings: { get: () => ({ targets: [{ id: "primary", label: "Work" }] }) },
    now: () => "2026-09-12T12:00:00.000Z",
  });

  assert.deepEqual(await service.getState(), {
    sources: [{ id: "apple", provider: "apple", state: "connected" }, { id: "google", provider: "google", state: "connected" }],
    calendars: [
      { id: "apple:apple-1", sourceId: "apple", label: "Personal · iCloud", mode: "read-only" },
      { id: "google:primary", sourceId: "google", label: "Work", mode: "read-only" },
    ],
    conflicts: [],
  });
});

test("asks EventKit for access before declaring the Mac calendar connected", async () => {
  let requested = false;
  const service = createCalendarSyncService({
    eventKit: { available: () => true, authorizationStatus: () => (requested ? "full-access" : "not-determined"), requestFullAccess: async () => { requested = true; }, listCalendars: () => [] },
    integrations: { listStatus: async () => [] },
    settings: noTargets,
  });

  await service.requestAppleAccess();

  assert.equal(requested, true);
  assert.equal((await service.getState()).sources[0].state, "connected");
});

test("reads selected calendars with an EventKit-safe local range and one serializable shape", async () => {
  const queries = [];
  const service = createCalendarSyncService({
    eventKit: appleKit({
      listCalendars: () => [{ id: "apple-cal", label: "Casa", writable: true }],
      listEvents: (query) => {
        queries.push(query);
        return [{ id: "apple-event", calendarId: "apple-cal", title: "Mac meeting", startsAt: "2026-09-14T12:00:00.000Z", endsAt: "2026-09-14T13:00:00.000Z", allDay: false, writable: true }];
      },
    }),
    integrations: {
      listStatus: async () => [{ id: "google-calendar", state: "connected" }],
      readCalendarEvents: async (_id, input) => {
        queries.push(input);
        return [{ remoteId: "google-event", title: "Google meeting", startsAt: "2026-09-14T15:00:00-03:00", endsAt: "2026-09-14T16:00:00-03:00", allDay: false }];
      },
    },
    settings: noTargets,
  });

  const result = await service.readEvents({ start: "2026-09-14T00:00:00", end: "2026-09-21T00:00:00", calendars: [{ sourceId: "apple", id: "apple:apple-cal" }, { sourceId: "google", id: "google:primary" }] });

  assert.deepEqual(result, [
    { sourceId: "apple", calendarId: "apple:apple-cal", remoteId: "apple-event", title: "Mac meeting", startsAt: "2026-09-14T12:00:00.000Z", endsAt: "2026-09-14T13:00:00.000Z", allDay: false, writable: true },
    { sourceId: "google", calendarId: "google:primary", remoteId: "google-event", title: "Google meeting", startsAt: "2026-09-14T15:00:00-03:00", endsAt: "2026-09-14T16:00:00-03:00", allDay: false, writable: false },
  ]);
  // O formatador padrão do EventKit recusa frações de segundo: a janela vai com offset e sem `.000`.
  assert.deepEqual(queries[0], { start: local("2026-09-14T00:00:00"), end: local("2026-09-21T00:00:00"), calendarIds: ["apple-cal"] });
  assert.match(queries[0].start, OFFSET_ISO);
  assert.deepEqual(queries[1], { calendarId: "primary", timeMin: toInstant("2026-09-14T00:00:00").toISOString(), timeMax: toInstant("2026-09-21T00:00:00").toISOString() });
});

test("reads only Apple calendars that exist and never returns events from other calendars", async () => {
  const queries = [];
  const service = createCalendarSyncService({
    eventKit: appleKit({
      listEvents: (query) => {
        queries.push(query);
        return [
          { id: "mine", calendarId: "personal", title: "Meu", startsAt: "2026-09-14T12:00:00Z", endsAt: "2026-09-14T13:00:00Z" },
          { id: "theirs", calendarId: "shared-family", title: "Deles", startsAt: "2026-09-14T12:00:00Z", endsAt: "2026-09-14T13:00:00Z" },
        ];
      },
    }),
    integrations: { listStatus: async () => [] },
    settings: noTargets,
  });

  const events = await service.readEvents({ ...DAY, calendars: [{ sourceId: "apple", id: "apple:personal" }, { sourceId: "apple", id: "apple:ghost" }] });
  assert.deepEqual(queries.map((query) => query.calendarIds), [["personal"]]);
  assert.deepEqual(events.map((event) => event.remoteId), ["mine"]);

  // Sem nenhum calendário reconhecido nada é pedido, porque o EventKit leria todos.
  queries.length = 0;
  assert.deepEqual(await service.readEvents({ ...DAY, calendars: [{ sourceId: "apple", id: "apple:ghost" }] }), []);
  assert.equal(queries.length, 0);
});

test("persists a per-calendar mode without enabling writes by default", async () => {
  const calendarSettings = memorySettings({ calendars: [{ id: "apple:personal", mode: "read-only" }] });
  const service = createCalendarSyncService({ eventKit: appleKit(), integrations: { listStatus: async () => [] }, settings: noTargets, calendarSettings });

  const state = await service.saveCalendarMode({ id: "apple:personal", mode: "bidirectional" });

  assert.deepEqual(calendarSettings.saves, [{ calendars: bidirectional("apple:personal"), sources: [], links: [], conflicts: [], pending: [] }]);
  assert.equal(state.calendars[0].mode, "bidirectional");
});

test("rejects an unknown mode or calendar id without saving anything", async () => {
  const calendarSettings = memorySettings();
  const service = createCalendarSyncService({ eventKit: appleKit(), integrations: { listStatus: async () => [] }, settings: noTargets, calendarSettings });

  for (const input of [{ id: "apple:personal", mode: "write" }, { id: "apple:personal", mode: "BIDIRECTIONAL" }, { id: "../personal", mode: "read-only" }, { id: "icloud:personal", mode: "read-only" }])
    await assert.rejects(() => service.saveCalendarMode(input), /mode is invalid/);
  assert.equal(calendarSettings.saves.length, 0);
});

test("does not publish a Hibi block until its matching confirmation is executed", async () => {
  const saved = [];
  const service = createCalendarSyncService({
    eventKit: appleKit({ saveEvent: (event) => { saved.push(event); return { id: "remote-1" }; } }),
    integrations: { listStatus: async () => [] },
    settings: noTargets,
    calendarSettings: memorySettings({ calendars: bidirectional("apple:personal") }),
    randomId: () => "fixed",
  });

  const prepared = await service.preparePublish({ calendarId: "apple:personal", block });

  assert.equal(saved.length, 0);
  assert.deepEqual(prepared, { id: "calendar-fixed", confirmationId: "calendar-confirm-fixed", requiresConfirmation: true, calendarId: "apple:personal", summary: "Planejar semana" });
  assert.deepEqual(await service.executeApproved({ actionId: prepared.id, confirmationId: prepared.confirmationId }), { remoteId: "remote-1", revision: "remote-1" });
  // A hora de parede do bloco chega ao EventKit como instante local, com offset e sem fração de segundo.
  assert.deepEqual(saved, [{ calendarId: "personal", title: "Planejar semana", start: local("2026-09-14T09:00:00"), end: local("2026-09-14T10:00:00"), allDay: false }]);
  assert.ok(saved[0].start.startsWith("2026-09-14T09:00:00"));
  assert.match(saved[0].start, OFFSET_ISO);
  await assert.rejects(() => service.executeApproved({ actionId: prepared.id, confirmationId: prepared.confirmationId }), /matching confirmation/);
});

test("refuses an execution whose confirmation does not match, without writing anywhere", async () => {
  const saved = [];
  let googleExecutions = 0;
  const calendarSettings = memorySettings({ calendars: bidirectional("apple:personal", "google:primary") });
  const service = createCalendarSyncService({
    eventKit: appleKit({ saveEvent: (event) => { saved.push(event); return { id: "remote-1" }; } }),
    integrations: {
      listStatus: async () => [],
      prepareAction: async () => ({ id: "google-action", confirmationId: "google-confirm" }),
      executeApproved: async () => { googleExecutions += 1; return { ok: true, remoteId: "google-1" }; },
    },
    settings: googleTargets,
    calendarSettings,
  });
  const apple = await service.preparePublish({ calendarId: "apple:personal", block });
  const google = await service.preparePublish({ calendarId: "google:primary", block });

  for (const [action, other] of [[apple, google], [google, apple]])
    for (const confirmationId of [undefined, "", `${action.confirmationId}x`, other.confirmationId])
      await assert.rejects(() => service.executeApproved({ actionId: action.id, confirmationId }), /matching confirmation/);

  assert.deepEqual(saved, []);
  assert.equal(googleExecutions, 0);
  assert.equal(calendarSettings.saves.length, 0);
  await service.executeApproved({ actionId: apple.id, confirmationId: apple.confirmationId });
  assert.equal(saved.length, 1);
});

test("delegates an approved Google publish with a real offset, the Mac's zone and a stable event id", async () => {
  const prepared = [];
  const service = createCalendarSyncService({
    eventKit: noApple,
    integrations: {
      listStatus: async () => [{ id: "google-calendar", state: "connected" }],
      prepareAction: async (input) => { prepared.push(input); return { id: "google-action", confirmationId: "google-confirm" }; },
      executeApproved: async (input) => ({ ok: input.actionId === "google-action", remoteId: "google-event" }),
    },
    settings: googleTargets,
    calendarSettings: memorySettings({ calendars: bidirectional("google:primary") }),
    timeZone: () => "Pacific/Kiritimati",
    randomEventId: () => "0123456789abcdef0123456789abcdef",
  });

  const publication = await service.preparePublish({ calendarId: "google:primary", block: { ...block, title: "Reunião" } });

  assert.deepEqual(prepared, [{
    connectorId: "google-calendar",
    kind: "calendar.create",
    payload: { calendarId: "primary", title: "Reunião", startsAt: local("2026-09-14T09:00:00"), endsAt: local("2026-09-14T10:00:00"), allDay: false, timeZone: "Pacific/Kiritimati", eventId: "0123456789abcdef0123456789abcdef" },
  }]);
  assert.equal(publication.id, "google-action");
  assert.deepEqual(await service.executeApproved({ actionId: publication.id, confirmationId: publication.confirmationId }), { remoteId: "google-event", revision: "google-event" });
});

test("never writes remotely while preparing a Google publish or update", async () => {
  const calls = [];
  const service = createCalendarSyncService({
    eventKit: noApple,
    integrations: {
      listStatus: async () => [],
      prepareAction: async (input) => { calls.push(`prepare:${input.kind}`); return { id: `action-${calls.length}`, confirmationId: `confirm-${calls.length}` }; },
      executeApproved: async () => { calls.push("execute"); return { ok: true, remoteId: "remote" }; },
    },
    settings: googleTargets,
    calendarSettings: memorySettings({ calendars: bidirectional("google:primary"), links: [link({ calendarId: "google:primary" })] }),
  });

  await service.preparePublish({ calendarId: "google:primary", block: { ...block, id: "block-2" } });
  await service.prepareUpdate({ calendarId: "google:primary", block });

  assert.deepEqual(calls, ["prepare:calendar.create", "prepare:calendar.update"]);
});

test("refuses to publish or edit on a calendar that is not bidirectional", async () => {
  let prepared = 0;
  const written = [];
  for (const calendars of [[], [{ id: "apple:personal", mode: "read-only" }, { id: "google:primary", mode: "read-only" }], [{ id: "apple:personal", mode: "disabled" }, { id: "google:primary", mode: "disabled" }]]) {
    const service = createCalendarSyncService({
      eventKit: appleKit({ saveEvent: (event) => { written.push(event); return { id: "x" }; }, updateEvent: (event) => { written.push(event); return { id: "x" }; } }),
      integrations: { listStatus: async () => [], prepareAction: async () => { prepared += 1; return { id: "a", confirmationId: "c" }; } },
      settings: googleTargets,
      calendarSettings: memorySettings({ calendars, links: [link(), link({ calendarId: "google:primary" })] }),
    });
    for (const calendarId of ["apple:personal", "google:primary"]) {
      await assert.rejects(() => service.preparePublish({ calendarId, block }), /bidirectional/);
      await assert.rejects(() => service.prepareUpdate({ calendarId, block }), /bidirectional/);
    }
  }
  assert.equal(prepared, 0);
  assert.deepEqual(written, []);
});

test("expires a confirmation after five minutes and keeps at most twenty open", async () => {
  let at = 1_000_000;
  let sequence = 0;
  const saved = [];
  const service = createCalendarSyncService({
    eventKit: appleKit({ saveEvent: (event) => { saved.push(event); return { id: `remote-${saved.length}` }; } }),
    integrations: { listStatus: async () => [] },
    settings: noTargets,
    calendarSettings: memorySettings({ calendars: bidirectional("apple:personal") }),
    clock: () => at,
    randomId: () => String(++sequence),
  });

  const stale = await service.preparePublish({ calendarId: "apple:personal", block });
  at += 5 * 60 * 1_000;
  await assert.rejects(() => service.executeApproved({ actionId: stale.id, confirmationId: stale.confirmationId }), /expired/);
  assert.deepEqual(saved, []);

  const open = [];
  for (let index = 0; index < 21; index += 1)
    open.push(await service.preparePublish({ calendarId: "apple:personal", block: { ...block, id: `block-${index}` } }));
  await assert.rejects(() => service.executeApproved({ actionId: open[0].id, confirmationId: open[0].confirmationId }), /matching confirmation/);
  await service.executeApproved({ actionId: open[20].id, confirmationId: open[20].confirmationId });
  assert.equal(saved.length, 1);
});

test("records the last successful read per source without persisting event details", async () => {
  const calendarSettings = memorySettings();
  const service = createCalendarSyncService({ eventKit: appleKit({ listEvents: () => [] }), integrations: { listStatus: async () => [] }, settings: noTargets, calendarSettings, now: () => "2026-09-14T11:00:00.000Z" });

  await service.readEvents({ ...DAY, calendars: [{ sourceId: "apple", id: "apple:personal" }] });

  assert.deepEqual(calendarSettings.current(), { calendars: [], sources: [{ id: "apple", lastSyncedAt: "2026-09-14T11:00:00.000Z" }], links: [], conflicts: [], pending: [] });
});

test("records a conflict with the remote revision only when the linked block and event both changed", async () => {
  const calendarSettings = memorySettings({ calendars: bidirectional("google:primary"), links: [link({ calendarId: "google:primary", remoteId: "remote-1", localFingerprint: "before" })] });
  const service = createCalendarSyncService({
    eventKit: noApple,
    integrations: {
      listStatus: async () => [{ id: "google-calendar", state: "connected" }],
      readCalendarEvents: async () => [{ remoteId: "remote-1", revision: "revision-2", title: "Remoto", startsAt: "2026-09-14T11:00:00-03:00", endsAt: "2026-09-14T12:00:00-03:00", allDay: false }],
    },
    settings: googleTargets,
    calendarSettings,
    workspace: () => ({ blocks: [workspaceBlock({ title: "Local" })] }),
  });

  await service.readEvents({ ...DAY, calendars: [{ sourceId: "google", id: "google:primary" }] });

  const stored = calendarSettings.current();
  assert.deepEqual(stored.conflicts, [{ id: "google:primary:remote-1", calendarId: "google:primary", kind: "concurrent-update", summary: "Local", remoteRevision: "revision-2" }]);
  assert.equal(stored.links[0].remoteRevision, "revision-1");
  // A revisão fica no processo principal; o renderer recebe só o que mostra.
  assert.deepEqual((await service.getState()).conflicts, [{ id: "google:primary:remote-1", calendarId: "google:primary", kind: "concurrent-update", summary: "Local" }]);
});

test("does not treat an event outside the read window as deleted", async () => {
  const calendarSettings = memorySettings({
    calendars: bidirectional("google:primary"),
    links: [link({ calendarId: "google:primary", remoteStartsAt: local("2026-09-22T09:00:00"), remoteEndsAt: local("2026-09-22T10:00:00") })],
  });
  const service = createCalendarSyncService({
    eventKit: noApple,
    integrations: { listStatus: async () => [], readCalendarEvents: async () => [] },
    settings: googleTargets,
    calendarSettings,
    workspace: () => ({ blocks: [workspaceBlock({ title: "Mudou no Hibi" })] }),
  });

  await service.readEvents({ start: "2026-09-14T00:00:00", end: "2026-09-21T00:00:00", calendars: [{ sourceId: "google", id: "google:primary" }] });

  assert.equal(calendarSettings.current().links.length, 1);
  assert.deepEqual(calendarSettings.current().conflicts, []);
});

test("keeps following an event moved outside the read window instead of calling it deleted", async () => {
  const lookups = [];
  const moved = { id: "event-1", calendarId: "personal", title: "Planejar semana", startsAt: local("2026-09-21T09:00:00"), endsAt: local("2026-09-21T10:00:00"), revision: "revision-2" };
  const calendarSettings = memorySettings({ calendars: bidirectional("apple:personal"), links: [link(inside)] });
  const service = createCalendarSyncService({
    eventKit: appleKit({ listEvents: () => [], getEvent: (id) => { lookups.push(id); return moved; } }),
    integrations: { listStatus: async () => [] },
    settings: noTargets,
    calendarSettings,
    workspace: () => ({ blocks: [workspaceBlock()] }),
  });

  await service.readEvents({ ...DAY, calendars: [{ sourceId: "apple", id: "apple:personal" }] });

  assert.deepEqual(lookups, ["event-1"]);
  assert.deepEqual(calendarSettings.current().links, [link({ remoteRevision: "revision-2", remoteStartsAt: local("2026-09-21T09:00:00"), remoteEndsAt: local("2026-09-21T10:00:00") })]);
  assert.deepEqual(calendarSettings.current().conflicts, []);
});

test("turns a moved event with a changed block into an edit conflict that keep-Hibi updates in place", async () => {
  const saved = [];
  const updates = [];
  const changed = workspaceBlock({ title: "Planejar de novo" });
  const calendarSettings = memorySettings({ calendars: bidirectional("apple:personal"), links: [link(inside)] });
  const service = createCalendarSyncService({
    eventKit: appleKit({
      listEvents: () => [],
      getEvent: () => ({ id: "event-1", calendarId: "personal", title: "Planejar semana", startsAt: local("2026-09-21T09:00:00"), endsAt: local("2026-09-21T10:00:00"), revision: "revision-2" }),
      saveEvent: (event) => { saved.push(event); return { id: "duplicate" }; },
      updateEvent: (event) => { updates.push(event); return { id: "event-1", revision: "revision-3" }; },
    }),
    integrations: { listStatus: async () => [] },
    settings: noTargets,
    calendarSettings,
    workspace: () => ({ blocks: [changed] }),
  });

  await service.readEvents({ ...DAY, calendars: [{ sourceId: "apple", id: "apple:personal" }] });
  assert.deepEqual(calendarSettings.current().conflicts, [{ id: "apple:personal:event-1", calendarId: "apple:personal", kind: "concurrent-update", summary: "Planejar de novo", remoteRevision: "revision-2" }]);

  const { action } = await service.resolveConflict({ id: "apple:personal:event-1", choice: "keep-hibi" });
  await service.executeApproved({ actionId: action.id, confirmationId: action.confirmationId });

  assert.deepEqual(saved, []);
  assert.deepEqual(updates.map((event) => [event.id, event.start, event.expectedRevision]), [["event-1", local("2026-09-14T09:00:00"), "revision-2"]]);
  assert.deepEqual(calendarSettings.current().links.map((entry) => entry.remoteId), ["event-1"]);
});

test("changes nothing when the lookup cannot answer", async () => {
  const conflict = { id: "apple:personal:event-1", calendarId: "apple:personal", kind: "concurrent-update", summary: "Antes", remoteRevision: "revision-2" };
  for (const getEvent of [() => { throw new Error("EventKit unavailable"); }, undefined, () => ({ id: "another-event", startsAt: local("2026-09-21T09:00:00"), endsAt: local("2026-09-21T10:00:00") })]) {
    const calendarSettings = memorySettings({ calendars: bidirectional("apple:personal"), links: [link(inside)], conflicts: [conflict] });
    const service = createCalendarSyncService({
      eventKit: appleKit({ listEvents: () => [], ...(getEvent ? { getEvent } : {}) }),
      integrations: { listStatus: async () => [] },
      settings: noTargets,
      calendarSettings,
      workspace: () => ({ blocks: [workspaceBlock({ title: "Mudou no Hibi" })] }),
    });

    await service.readEvents({ ...DAY, calendars: [{ sourceId: "apple", id: "apple:personal" }] });

    assert.deepEqual(calendarSettings.current().links, [link(inside)]);
    assert.deepEqual(calendarSettings.current().conflicts, [conflict]);
  }
});

test("confirms a missing Google event through the integration before calling it deleted", async () => {
  const run = async (answer) => {
    const asked = [];
    const calendarSettings = memorySettings({ calendars: bidirectional("google:primary"), links: [link({ calendarId: "google:primary", ...inside })] });
    const service = createCalendarSyncService({
      eventKit: noApple,
      integrations: {
        listStatus: async () => [],
        readCalendarEvents: async () => [],
        readCalendarEvent: async (id, input) => { asked.push([id, input]); return answer; },
      },
      settings: googleTargets,
      calendarSettings,
      workspace: () => ({ blocks: [workspaceBlock({ title: "Mudou no Hibi" })] }),
    });
    await service.readEvents({ ...DAY, calendars: [{ sourceId: "google", id: "google:primary" }] });
    return { asked, stored: calendarSettings.current() };
  };

  const deleted = await run(null);
  assert.deepEqual(deleted.asked, [["google-calendar", { calendarId: "primary", remoteId: "event-1" }]]);
  assert.deepEqual(deleted.stored.conflicts.map((entry) => entry.kind), ["remote-deleted"]);

  const cancelled = await run({ remoteId: "event-1", title: "x", startsAt: inside.remoteStartsAt, endsAt: inside.remoteEndsAt, cancelled: true });
  assert.deepEqual(cancelled.stored.conflicts.map((entry) => entry.kind), ["remote-deleted"]);

  const moved = await run({ remoteId: "event-1", title: "x", revision: "revision-1", startsAt: local("2026-09-21T09:00:00"), endsAt: local("2026-09-21T10:00:00") });
  assert.deepEqual(moved.stored.conflicts, []);
  assert.equal(moved.stored.links[0].remoteStartsAt, local("2026-09-21T09:00:00"));
});

test("looks up at most fifty missing events per read and leaves the rest for the next one", async () => {
  let lookups = 0;
  const blocks = Array.from({ length: 60 }, (_, index) => workspaceBlock({ id: `block-${index}` }));
  const calendarSettings = memorySettings({
    calendars: bidirectional("apple:personal"),
    links: blocks.map((block, index) => link({ localId: block.id, remoteId: `event-${index}`, localFingerprint: blockFingerprint(block), ...inside })),
  });
  const service = createCalendarSyncService({
    eventKit: appleKit({ listEvents: () => [], getEvent: () => { lookups += 1; return null; } }),
    integrations: { listStatus: async () => [] },
    settings: noTargets,
    calendarSettings,
    workspace: () => ({ blocks }),
  });

  await service.readEvents({ ...DAY, calendars: [{ sourceId: "apple", id: "apple:personal" }] });

  assert.equal(lookups, 50);
  assert.equal(calendarSettings.current().links.length, 10);
});

test("raises remote-deleted only for a changed block whose event is missing inside the read window", async () => {
  const calendarSettings = memorySettings({
    calendars: bidirectional("apple:personal"),
    links: [link(inside), link({ localId: "block-2", remoteId: "event-2", localFingerprint: blockFingerprint(workspaceBlock({ id: "block-2" })), ...inside })],
  });
  const service = createCalendarSyncService({
    eventKit: appleKit({ listEvents: () => [], getEvent: () => null }),
    integrations: { listStatus: async () => [] },
    settings: noTargets,
    calendarSettings,
    workspace: () => ({ blocks: [workspaceBlock({ title: "Mudou no Hibi" }), workspaceBlock({ id: "block-2" })] }),
  });

  await service.readEvents({ ...DAY, calendars: [{ sourceId: "apple", id: "apple:personal" }] });

  const stored = calendarSettings.current();
  // O bloco intacto perde o vínculo e continua no Hibi; o alterado vira decisão da pessoa.
  assert.deepEqual(stored.links.map((entry) => entry.localId), ["block-1"]);
  assert.deepEqual(stored.conflicts, [{ id: "apple:personal:event-1", calendarId: "apple:personal", kind: "remote-deleted", summary: "Mudou no Hibi" }]);
});

test("reevaluates links only for calendars that were actually read", async () => {
  const read = [];
  const calendarSettings = memorySettings({ calendars: bidirectional("google:primary"), links: [link({ calendarId: "google:primary", ...inside })] });
  const service = createCalendarSyncService({
    eventKit: noApple,
    integrations: { listStatus: async () => [], readCalendarEvents: async (_id, input) => { read.push(input.calendarId); return []; } },
    settings: googleTargets,
    calendarSettings,
    workspace: () => ({ blocks: [workspaceBlock({ title: "Mudou" })] }),
  });

  // Sem `sourceId`, a entrada não é lida, e o vínculo dela não pode ser julgado apagado.
  await service.readEvents({ ...DAY, calendars: [{ id: "google:primary" }, { sourceId: "google", id: "google:other" }] });

  assert.deepEqual(read, ["other"]);
  assert.equal(calendarSettings.current().links.length, 1);
  assert.deepEqual(calendarSettings.current().conflicts, []);
});

test("leaves links and conflicts untouched until the renderer sends the workspace", async () => {
  const conflict = { id: "apple:personal:event-1", calendarId: "apple:personal", kind: "concurrent-update", summary: "Planejar semana", remoteRevision: "revision-2" };
  const calendarSettings = memorySettings({ calendars: bidirectional("apple:personal"), links: [link(inside)], conflicts: [conflict] });
  const service = createCalendarSyncService({ eventKit: appleKit({ listEvents: () => [] }), integrations: { listStatus: async () => [] }, settings: noTargets, calendarSettings, workspace: () => null });

  await service.readEvents({ ...DAY, calendars: [{ sourceId: "apple", id: "apple:personal" }] });

  assert.deepEqual(calendarSettings.current().links, [link(inside)]);
  assert.deepEqual(calendarSettings.current().conflicts, [conflict]);
});

test("keeps the Hibi version by updating against the revision the read saw", async () => {
  const updates = [];
  const changed = workspaceBlock({ title: "Planejar de novo" });
  const calendarSettings = memorySettings({ calendars: bidirectional("apple:personal"), links: [link()] });
  const service = createCalendarSyncService({
    eventKit: appleKit({
      listEvents: () => [{ id: "event-1", calendarId: "personal", title: "Mudou no Mac", startsAt: local("2026-09-14T11:00:00"), endsAt: local("2026-09-14T12:00:00"), revision: "revision-2" }],
      updateEvent: (event) => { updates.push(event); return { id: "event-1", revision: "revision-3" }; },
    }),
    integrations: { listStatus: async () => [] },
    settings: noTargets,
    calendarSettings,
    workspace: () => ({ blocks: [changed] }),
  });

  await service.readEvents({ ...DAY, calendars: [{ sourceId: "apple", id: "apple:personal" }] });
  const { action } = await service.resolveConflict({ id: "apple:personal:event-1", choice: "keep-hibi" });
  assert.deepEqual(updates, []);
  await service.executeApproved({ actionId: action.id, confirmationId: action.confirmationId });

  assert.deepEqual(updates, [{ id: "event-1", title: "Planejar de novo", start: local("2026-09-14T09:00:00"), end: local("2026-09-14T10:00:00"), allDay: false, expectedRevision: "revision-2" }]);
  const stored = calendarSettings.current();
  assert.deepEqual(stored.conflicts, []);
  assert.equal(stored.links[0].remoteRevision, "revision-3");
  assert.equal(stored.links[0].localFingerprint, blockFingerprint(changed));
});

test("keeps the Hibi version of a deleted event by recreating it after confirmation", async () => {
  const prepared = [];
  const changed = workspaceBlock({ title: "Planejar de novo" });
  const calendarSettings = memorySettings({ calendars: bidirectional("google:primary"), links: [link({ calendarId: "google:primary", ...inside })] });
  const service = createCalendarSyncService({
    eventKit: noApple,
    integrations: {
      listStatus: async () => [],
      readCalendarEvents: async () => [{ remoteId: "event-1", title: "Planejar semana", startsAt: inside.remoteStartsAt, endsAt: inside.remoteEndsAt, cancelled: true }],
      prepareAction: async (input) => { prepared.push(input); return { id: "google-action", confirmationId: "google-confirm" }; },
      executeApproved: async () => ({ ok: true, remoteId: "event-2", revision: "etag-2" }),
    },
    settings: googleTargets,
    calendarSettings,
    workspace: () => ({ blocks: [changed] }),
  });

  await service.readEvents({ ...DAY, calendars: [{ sourceId: "google", id: "google:primary" }] });
  assert.equal(calendarSettings.current().conflicts[0].kind, "remote-deleted");
  const { action } = await service.resolveConflict({ id: "google:primary:event-1", choice: "keep-hibi" });
  assert.equal(prepared[0].kind, "calendar.create");
  assert.equal(prepared[0].payload.title, "Planejar de novo");
  await service.executeApproved({ actionId: action.id, confirmationId: action.confirmationId });

  const stored = calendarSettings.current();
  assert.deepEqual(stored.conflicts, []);
  assert.deepEqual(stored.links.map((entry) => [entry.remoteId, entry.remoteRevision, entry.localFingerprint]), [["event-2", "etag-2", blockFingerprint(changed)]]);
  assert.deepEqual(stored.pending, []);
});

test("cuts a long block title in the conflict summary so later reads keep working", async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "hibi-calendar-sync-"));
  try {
    const calendarSettings = createCalendarSyncSettings({ filePath: path.join(folder, "calendar-sync.json") });
    calendarSettings.save({ calendars: bidirectional("apple:personal"), links: [link(inside)] });
    const longTitle = `Revisar ${"capítulo ".repeat(40)}`;
    const service = createCalendarSyncService({
      eventKit: appleKit({ listEvents: () => [], getEvent: () => null }),
      integrations: { listStatus: async () => [] },
      settings: noTargets,
      calendarSettings,
      workspace: () => ({ blocks: [workspaceBlock({ title: longTitle })] }),
    });
    const read = () => service.readEvents({ ...DAY, calendars: [{ sourceId: "apple", id: "apple:personal" }] });

    await read();
    await read();

    const [conflict] = calendarSettings.get().conflicts;
    assert.equal(conflict.summary.length, 240);
    assert.ok(longTitle.startsWith(conflict.summary));
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});

test("links a published block to its remote event and remembers the event's window", async () => {
  const calendarSettings = memorySettings({ calendars: bidirectional("apple:personal") });
  const service = createCalendarSyncService({
    eventKit: appleKit({ saveEvent: () => ({ id: "event-1", revision: "revision-1" }) }),
    integrations: { listStatus: async () => [] },
    settings: noTargets,
    calendarSettings,
  });
  const action = await service.preparePublish({ calendarId: "apple:personal", block: { ...block, title: "Planejar" } });

  await service.executeApproved({ actionId: action.id, confirmationId: action.confirmationId });

  const stored = calendarSettings.current();
  assert.deepEqual(stored.links, [{
    localId: "block-1",
    calendarId: "apple:personal",
    remoteId: "event-1",
    remoteRevision: "revision-1",
    localFingerprint: blockFingerprint({ ...block, title: "Planejar" }),
    remoteStartsAt: local("2026-09-14T09:00:00"),
    remoteEndsAt: local("2026-09-14T10:00:00"),
  }]);
  assert.deepEqual(stored.pending, []);
});

test("keeps a block's link to another calendar when publishing it elsewhere", async () => {
  const calendarSettings = memorySettings({ calendars: bidirectional("apple:personal", "google:primary"), links: [link()] });
  const service = createCalendarSyncService({
    eventKit: appleKit(),
    integrations: { listStatus: async () => [], prepareAction: async () => ({ id: "google-action", confirmationId: "google-confirm" }), executeApproved: async () => ({ ok: true, remoteId: "google-event" }) },
    settings: googleTargets,
    calendarSettings,
  });

  const action = await service.preparePublish({ calendarId: "google:primary", block });
  await service.executeApproved({ actionId: action.id, confirmationId: action.confirmationId });

  assert.deepEqual(calendarSettings.current().links.map((entry) => entry.calendarId).sort(), ["apple:personal", "google:primary"]);
});

test("does not duplicate an Apple event when recording the link fails after the write", async () => {
  const memory = memorySettings({ calendars: bidirectional("apple:personal") });
  const created = [];
  const service = createCalendarSyncService({
    eventKit: appleKit({
      saveEvent: (event) => { created.push(event); return { id: `event-${created.length}`, revision: "r1" }; },
      listEvents: ({ calendarIds }) =>
        created.filter((event) => calendarIds.includes(event.calendarId)).map((event, index) => ({ id: `event-${index + 1}`, calendarId: event.calendarId, title: event.title, startsAt: event.start, endsAt: event.end, revision: "r1" })),
    }),
    integrations: { listStatus: async () => [] },
    settings: noTargets,
    calendarSettings: crashingOnFirstLink(memory),
  });

  const first = await service.preparePublish({ calendarId: "apple:personal", block });
  await assert.rejects(() => service.executeApproved({ actionId: first.id, confirmationId: first.confirmationId }), /disk full/);
  assert.deepEqual(memory.current().pending.map((entry) => entry.localId), ["block-1"]);

  const retry = await service.preparePublish({ calendarId: "apple:personal", block });
  assert.deepEqual(await service.executeApproved({ actionId: retry.id, confirmationId: retry.confirmationId }), { remoteId: "event-1", revision: "r1" });
  assert.equal(created.length, 1);
  assert.deepEqual(memory.current().links.map((entry) => entry.remoteId), ["event-1"]);
  assert.deepEqual(memory.current().pending, []);
});

test("reuses the Google event id when a failed publish is retried", async () => {
  const memory = memorySettings({ calendars: bidirectional("google:primary") });
  const payloads = [];
  const ids = ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2"];
  const service = createCalendarSyncService({
    eventKit: noApple,
    integrations: {
      listStatus: async () => [],
      prepareAction: async (input) => { payloads.push(input.payload); return { id: `action-${payloads.length}`, confirmationId: `confirm-${payloads.length}` }; },
      executeApproved: async () => ({ ok: true, remoteId: "google-event" }),
    },
    settings: googleTargets,
    calendarSettings: crashingOnFirstLink(memory),
    randomEventId: () => ids.shift(),
  });

  const first = await service.preparePublish({ calendarId: "google:primary", block });
  await assert.rejects(() => service.executeApproved({ actionId: first.id, confirmationId: first.confirmationId }), /disk full/);
  const retry = await service.preparePublish({ calendarId: "google:primary", block });

  assert.equal(payloads[1].eventId, payloads[0].eventId);
  await service.executeApproved({ actionId: retry.id, confirmationId: retry.confirmationId });
  assert.deepEqual(memory.current().pending, []);
});

test("updates a linked Apple event only after a new matching confirmation", async () => {
  const updates = [];
  const calendarSettings = memorySettings({ calendars: bidirectional("apple:personal"), links: [link({ localFingerprint: "before" })] });
  const service = createCalendarSyncService({
    eventKit: appleKit({ updateEvent: (event) => { updates.push(event); return { id: "event-1", revision: "revision-2" }; } }),
    integrations: { listStatus: async () => [] },
    settings: noTargets,
    calendarSettings,
    randomId: () => "update",
  });
  const action = await service.prepareUpdate({ calendarId: "apple:personal", block: { ...block, title: "Replanejar", startsAt: "2026-09-14T11:00:00", endsAt: "2026-09-14T12:00:00" } });

  assert.deepEqual(updates, []);
  await service.executeApproved({ actionId: action.id, confirmationId: action.confirmationId });
  assert.deepEqual(updates, [{ id: "event-1", title: "Replanejar", start: local("2026-09-14T11:00:00"), end: local("2026-09-14T12:00:00"), allDay: false, expectedRevision: "revision-1" }]);
  assert.equal(calendarSettings.current().links[0].remoteRevision, "revision-2");
});

test("resolves keep-calendar by unlinking the conflicted event without remote mutation", async () => {
  const calendarSettings = memorySettings({
    calendars: bidirectional("google:primary"),
    links: [link({ calendarId: "google:primary", localFingerprint: "before" })],
    conflicts: [{ id: "google:primary:event-1", calendarId: "google:primary", kind: "concurrent-update", summary: "Planejar" }],
  });
  const service = createCalendarSyncService({ eventKit: noApple, integrations: { listStatus: async () => [] }, settings: noTargets, calendarSettings });

  assert.deepEqual(await service.resolveConflict({ id: "google:primary:event-1", choice: "keep-calendar" }), { resolved: true, choice: "keep-calendar" });
  assert.deepEqual(calendarSettings.current().links, []);
  assert.deepEqual(calendarSettings.current().conflicts, []);
});

test("keeps links and conflicts for calendars that were not part of a read", async () => {
  const calendarSettings = memorySettings({
    calendars: bidirectional("google:primary", "google:team"),
    links: [link({ calendarId: "google:team", localFingerprint: "before", ...inside })],
    conflicts: [{ id: "google:team:event-1", calendarId: "google:team", kind: "concurrent-update", summary: "Local" }],
  });
  const service = createCalendarSyncService({
    eventKit: noApple,
    integrations: { listStatus: async () => [], readCalendarEvents: async () => [] },
    settings: noTargets,
    calendarSettings,
    workspace: () => ({ blocks: [workspaceBlock({ title: "Changed locally" })] }),
  });

  await service.readEvents({ ...DAY, calendars: [{ sourceId: "google", id: "google:primary" }] });

  assert.deepEqual(calendarSettings.current().links.map((entry) => entry.calendarId), ["google:team"]);
  assert.deepEqual(calendarSettings.current().conflicts.map((entry) => entry.id), ["google:team:event-1"]);
});

test("resolves keep-hibi by preparing a fresh confirmed update without mutating remotely", async () => {
  const service = createCalendarSyncService({
    eventKit: appleKit({ updateEvent: () => { throw new Error("must not write before confirmation"); } }),
    integrations: { listStatus: async () => [] },
    settings: noTargets,
    calendarSettings: memorySettings({
      calendars: bidirectional("apple:personal"),
      links: [link({ localFingerprint: "before" })],
      conflicts: [{ id: "apple:personal:event-1", calendarId: "apple:personal", kind: "concurrent-update", summary: "Planejar" }],
    }),
    workspace: () => ({ blocks: [workspaceBlock({ title: "Local" })] }),
    randomId: () => "conflict",
  });

  assert.deepEqual(await service.resolveConflict({ id: "apple:personal:event-1", choice: "keep-hibi" }), {
    resolved: false,
    choice: "keep-hibi",
    action: { id: "calendar-conflict", confirmationId: "calendar-confirm-conflict", requiresConfirmation: true, calendarId: "apple:personal", summary: "Local" },
  });
});
