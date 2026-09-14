const test = require("node:test");
const assert = require("node:assert/strict");
const { createCalendarSyncService } = require("./calendar-sync-service.cjs");

test("reports only sanitized calendar source state and selected calendars", async () => {
  const eventKit = {
    available: () => true,
    authorizationStatus: () => "full-access",
    listCalendars: () => [
      {
        id: "apple-1",
        label: "Personal",
        sourceLabel: "iCloud",
        writable: true,
      },
    ],
  };
  const integrations = {
    listStatus: async () => [{ id: "google-calendar", state: "connected" }],
    listImportTargets: async () => [{ id: "primary", label: "Work" }],
  };
  const settings = {
    get: () => ({ targets: [{ id: "primary", label: "Work" }] }),
  };
  const service = createCalendarSyncService({
    eventKit,
    integrations,
    settings,
    now: () => "2026-09-12T12:00:00.000Z",
  });

  const state = await service.getState();

  assert.deepEqual(state, {
    sources: [
      {
        id: "apple",
        provider: "apple",
        label: "Calendário do Mac",
        state: "connected",
      },
      {
        id: "google",
        provider: "google",
        label: "Google Calendar",
        state: "connected",
      },
    ],
    calendars: [
      {
        id: "apple:apple-1",
        sourceId: "apple",
        label: "Personal · iCloud",
        mode: "read-only",
      },
      {
        id: "google:primary",
        sourceId: "google",
        label: "Work",
        mode: "read-only",
      },
    ],
    conflicts: [],
  });
});

test("asks EventKit for access before declaring the Mac calendar connected", async () => {
  let requested = false;
  const eventKit = {
    available: () => true,
    authorizationStatus: () => (requested ? "full-access" : "not-determined"),
    requestFullAccess: async () => {
      requested = true;
    },
    listCalendars: () => [],
  };
  const service = createCalendarSyncService({
    eventKit,
    integrations: { listStatus: async () => [] },
    settings: { get: () => ({ targets: [] }) },
  });

  await service.requestAppleAccess();

  assert.equal(requested, true);
  assert.equal((await service.getState()).sources[0].state, "connected");
});

test("reads selected Apple and Google events through one bounded serializable shape", async () => {
  const eventKit = {
    available: () => true,
    authorizationStatus: () => "full-access",
    listCalendars: () => [],
    listEvents: ({ start, end, calendarIds }) => [
      {
        id: "apple-event",
        calendarId: calendarIds[0],
        title: "Mac meeting",
        startsAt: start,
        endsAt: end,
        allDay: false,
        writable: true,
      },
    ],
  };
  const integrations = {
    listStatus: async () => [{ id: "google-calendar", state: "connected" }],
    listImportTargets: async () => [],
    readCalendarEvents: async (_id, input) => [
      {
        remoteId: "google-event",
        title: "Google meeting",
        startsAt: input.timeMin,
        endsAt: input.timeMax,
        allDay: false,
      },
    ],
  };
  const service = createCalendarSyncService({
    eventKit,
    integrations,
    settings: { get: () => ({ targets: [] }) },
  });

  const result = await service.readEvents({
    start: "2026-09-14T00:00:00.000Z",
    end: "2026-09-15T00:00:00.000Z",
    calendars: [
      { sourceId: "apple", id: "apple:apple-cal" },
      { sourceId: "google", id: "google:primary" },
    ],
  });

  assert.deepEqual(result, [
    {
      sourceId: "apple",
      calendarId: "apple:apple-cal",
      remoteId: "apple-event",
      title: "Mac meeting",
      startsAt: "2026-09-14T00:00:00.000Z",
      endsAt: "2026-09-15T00:00:00.000Z",
      allDay: false,
      writable: true,
    },
    {
      sourceId: "google",
      calendarId: "google:primary",
      remoteId: "google-event",
      title: "Google meeting",
      startsAt: "2026-09-14T00:00:00.000Z",
      endsAt: "2026-09-15T00:00:00.000Z",
      allDay: false,
      writable: false,
    },
  ]);
});

test("persists a per-calendar mode without enabling writes by default", async () => {
  let saved = null;
  let stored = { calendars: [{ id: "apple:personal", mode: "read-only" }] };
  const calendarSettings = {
    get: () => stored,
    save: (value) => {
      saved = value;
      stored = value;
      return value;
    },
  };
  const service = createCalendarSyncService({
    eventKit: {
      available: () => true,
      authorizationStatus: () => "full-access",
      listCalendars: () => [
        { id: "personal", label: "Pessoal", writable: true },
      ],
    },
    integrations: { listStatus: async () => [] },
    settings: { get: () => ({ targets: [] }) },
    calendarSettings,
  });

  const state = await service.saveCalendarMode({
    id: "apple:personal",
    mode: "bidirectional",
  });

  assert.deepEqual(saved, {
    calendars: [{ id: "apple:personal", mode: "bidirectional" }],
    sources: [],
    links: [],
    conflicts: [],
  });
  assert.equal(state.calendars[0].mode, "bidirectional");
});

test("does not publish a Hibi block until its matching confirmation is executed", async () => {
  const saved = [];
  const service = createCalendarSyncService({
    eventKit: {
      available: () => true,
      authorizationStatus: () => "full-access",
      listCalendars: () => [
        { id: "personal", label: "Pessoal", writable: true },
      ],
      saveEvent: (event) => {
        saved.push(event);
        return { id: "remote-1" };
      },
    },
    integrations: { listStatus: async () => [] },
    settings: { get: () => ({ targets: [] }) },
    calendarSettings: {
      get: () => ({
        calendars: [{ id: "apple:personal", mode: "bidirectional" }],
      }),
      save: () => undefined,
    },
    randomId: () => "fixed",
  });

  const prepared = await service.preparePublish({
    calendarId: "apple:personal",
    block: {
      id: "block-1",
      title: "Planejar semana",
      startsAt: "2026-09-14T09:00:00.000Z",
      endsAt: "2026-09-14T10:00:00.000Z",
    },
  });

  assert.equal(saved.length, 0);
  assert.deepEqual(prepared, {
    id: "calendar-fixed",
    confirmationId: "calendar-confirm-fixed",
    requiresConfirmation: true,
    calendarId: "apple:personal",
    summary: "Planejar semana",
  });
  assert.deepEqual(
    await service.executeApproved({
      actionId: prepared.id,
      confirmationId: prepared.confirmationId,
    }),
    { remoteId: "remote-1", revision: "remote-1" },
  );
  assert.deepEqual(saved, [
    {
      calendarId: "personal",
      title: "Planejar semana",
      start: "2026-09-14T09:00:00.000Z",
      end: "2026-09-14T10:00:00.000Z",
      allDay: false,
    },
  ]);
  await assert.rejects(
    () =>
      service.executeApproved({
        actionId: prepared.id,
        confirmationId: prepared.confirmationId,
      }),
    /matching confirmation/,
  );
});

test("delegates an approved Google publish through the integration confirmation contract", async () => {
  const prepared = [];
  const service = createCalendarSyncService({
    eventKit: {
      available: () => false,
      authorizationStatus: () => "unavailable",
    },
    integrations: {
      listStatus: async () => [{ id: "google-calendar", state: "connected" }],
      prepareAction: async (input) => {
        prepared.push(input);
        return { id: "google-action", confirmationId: "google-confirm" };
      },
      executeApproved: async (input) => ({
        ok: input.actionId === "google-action",
        remoteId: "google-event",
      }),
    },
    settings: {
      get: () => ({ targets: [{ id: "primary", label: "Trabalho" }] }),
    },
    calendarSettings: {
      get: () => ({
        calendars: [{ id: "google:primary", mode: "bidirectional" }],
      }),
      save: () => undefined,
    },
  });

  const publication = await service.preparePublish({
    calendarId: "google:primary",
    block: {
      id: "block-1",
      title: "Reunião",
      startsAt: "2026-09-14T09:00:00.000Z",
      endsAt: "2026-09-14T10:00:00.000Z",
    },
  });

  assert.deepEqual(prepared, [
    {
      connectorId: "google-calendar",
      kind: "calendar.create",
      payload: {
        calendarId: "primary",
        title: "Reunião",
        startsAt: "2026-09-14T09:00:00.000Z",
        endsAt: "2026-09-14T10:00:00.000Z",
        allDay: false,
      },
    },
  ]);
  assert.equal(publication.id, "google-action");
  assert.deepEqual(
    await service.executeApproved({
      actionId: publication.id,
      confirmationId: publication.confirmationId,
    }),
    { remoteId: "google-event", revision: "google-event" },
  );
});

test("records the last successful read per source without persisting event details", async () => {
  let saved;
  const service = createCalendarSyncService({
    eventKit: {
      available: () => true,
      authorizationStatus: () => "full-access",
      listCalendars: () => [],
      listEvents: () => [],
    },
    integrations: { listStatus: async () => [] },
    settings: { get: () => ({ targets: [] }) },
    calendarSettings: {
      get: () => ({ calendars: [], sources: [] }),
      save: (value) => {
        saved = value;
      },
    },
    now: () => "2026-09-14T11:00:00.000Z",
  });

  await service.readEvents({
    start: "2026-09-14T00:00:00.000Z",
    end: "2026-09-15T00:00:00.000Z",
    calendars: [{ sourceId: "apple", id: "apple:personal" }],
  });

  assert.deepEqual(saved, {
    calendars: [],
    sources: [{ id: "apple", lastSyncedAt: "2026-09-14T11:00:00.000Z" }],
    links: [],
    conflicts: [],
  });
});

test("records a conflict only when the linked Hibi block and remote event both changed", async () => {
  let stored = {
    calendars: [{ id: "google:primary", mode: "bidirectional" }],
    sources: [],
    links: [
      {
        localId: "block-1",
        calendarId: "google:primary",
        remoteId: "remote-1",
        remoteRevision: "revision-1",
        localFingerprint: "before",
      },
    ],
    conflicts: [],
  };
  const service = createCalendarSyncService({
    eventKit: {
      available: () => false,
      authorizationStatus: () => "unavailable",
    },
    integrations: {
      listStatus: async () => [{ id: "google-calendar", state: "connected" }],
      readCalendarEvents: async () => [
        {
          remoteId: "remote-1",
          revision: "revision-2",
          title: "Remoto",
          startsAt: "2026-09-14T11:00:00.000Z",
          endsAt: "2026-09-14T12:00:00.000Z",
          allDay: false,
        },
      ],
    },
    settings: {
      get: () => ({ targets: [{ id: "primary", label: "Trabalho" }] }),
    },
    calendarSettings: {
      get: () => stored,
      save: (value) => {
        stored = value;
      },
    },
    workspace: () => ({
      blocks: [
        {
          id: "block-1",
          title: "Local",
          start: "2026-09-14T09:00:00.000Z",
          end: "2026-09-14T10:00:00.000Z",
        },
      ],
    }),
  });

  await service.readEvents({
    start: "2026-09-14T00:00:00.000Z",
    end: "2026-09-15T00:00:00.000Z",
    calendars: [{ sourceId: "google", id: "google:primary" }],
  });

  const state = await service.getState();
  assert.equal(state.conflicts.length, 1);
  assert.equal(state.conflicts[0].kind, "concurrent-update");
  assert.equal(stored.links[0].remoteRevision, "revision-1");
});

test("links a published block to its remote event after approved creation", async () => {
  let stored = {
    calendars: [{ id: "apple:personal", mode: "bidirectional" }],
    sources: [],
    links: [],
    conflicts: [],
  };
  const service = createCalendarSyncService({
    eventKit: {
      available: () => true,
      authorizationStatus: () => "full-access",
      listCalendars: () => [
        { id: "personal", label: "Pessoal", writable: true },
      ],
      saveEvent: () => ({ id: "event-1", revision: "revision-1" }),
    },
    integrations: { listStatus: async () => [] },
    settings: { get: () => ({ targets: [] }) },
    calendarSettings: {
      get: () => stored,
      save: (value) => {
        stored = value;
      },
    },
  });
  const action = await service.preparePublish({
    calendarId: "apple:personal",
    block: {
      id: "block-1",
      title: "Planejar",
      startsAt: "2026-09-14T09:00:00.000Z",
      endsAt: "2026-09-14T10:00:00.000Z",
    },
  });

  await service.executeApproved({
    actionId: action.id,
    confirmationId: action.confirmationId,
  });

  assert.deepEqual(stored.links, [
    {
      localId: "block-1",
      calendarId: "apple:personal",
      remoteId: "event-1",
      remoteRevision: "revision-1",
      localFingerprint: stored.links[0].localFingerprint,
    },
  ]);
});

test("updates a linked Apple event only after a new matching confirmation", async () => {
  let stored = {
    calendars: [{ id: "apple:personal", mode: "bidirectional" }],
    sources: [],
    links: [
      {
        localId: "block-1",
        calendarId: "apple:personal",
        remoteId: "event-1",
        remoteRevision: "revision-1",
        localFingerprint: "before",
      },
    ],
    conflicts: [],
  };
  const updates = [];
  const service = createCalendarSyncService({
    eventKit: {
      available: () => true,
      authorizationStatus: () => "full-access",
      listCalendars: () => [
        { id: "personal", label: "Pessoal", writable: true },
      ],
      updateEvent: (event) => {
        updates.push(event);
        return { id: "event-1", revision: "revision-2" };
      },
    },
    integrations: { listStatus: async () => [] },
    settings: { get: () => ({ targets: [] }) },
    calendarSettings: {
      get: () => stored,
      save: (value) => {
        stored = value;
      },
    },
    randomId: () => "update",
  });
  const action = await service.prepareUpdate({
    calendarId: "apple:personal",
    block: {
      id: "block-1",
      title: "Replanejar",
      startsAt: "2026-09-14T11:00:00.000Z",
      endsAt: "2026-09-14T12:00:00.000Z",
    },
  });

  assert.deepEqual(updates, []);
  await service.executeApproved({
    actionId: action.id,
    confirmationId: action.confirmationId,
  });
  assert.deepEqual(updates, [
    {
      id: "event-1",
      title: "Replanejar",
      start: "2026-09-14T11:00:00.000Z",
      end: "2026-09-14T12:00:00.000Z",
      allDay: false,
      expectedRevision: "revision-1",
    },
  ]);
  assert.equal(stored.links[0].remoteRevision, "revision-2");
});

test("resolves keep-calendar by unlinking the conflicted event without remote mutation", async () => {
  let stored = {
    calendars: [{ id: "google:primary", mode: "bidirectional" }],
    sources: [],
    links: [
      {
        localId: "block-1",
        calendarId: "google:primary",
        remoteId: "event-1",
        remoteRevision: "revision-1",
        localFingerprint: "before",
      },
    ],
    conflicts: [
      {
        id: "google:primary:event-1",
        calendarId: "google:primary",
        kind: "concurrent-update",
        summary: "Planejar",
      },
    ],
  };
  const service = createCalendarSyncService({
    eventKit: {
      available: () => false,
      authorizationStatus: () => "unavailable",
    },
    integrations: { listStatus: async () => [] },
    settings: { get: () => ({ targets: [] }) },
    calendarSettings: {
      get: () => stored,
      save: (value) => {
        stored = value;
      },
    },
  });

  assert.deepEqual(
    await service.resolveConflict({
      id: "google:primary:event-1",
      choice: "keep-calendar",
    }),
    { resolved: true, choice: "keep-calendar" },
  );
  assert.deepEqual(stored.links, []);
  assert.deepEqual(stored.conflicts, []);
});

test("keeps links and conflicts for calendars that were not part of a read", async () => {
  let stored = {
    calendars: [
      { id: "google:primary", mode: "bidirectional" },
      { id: "google:team", mode: "bidirectional" },
    ],
    sources: [],
    links: [
      {
        localId: "block-1",
        calendarId: "google:team",
        remoteId: "event-1",
        remoteRevision: "revision-1",
        localFingerprint: "before",
      },
    ],
    conflicts: [
      {
        id: "google:team:event-1",
        calendarId: "google:team",
        kind: "concurrent-update",
        summary: "Local",
      },
    ],
  };
  const service = createCalendarSyncService({
    eventKit: {
      available: () => false,
      authorizationStatus: () => "unavailable",
    },
    integrations: {
      listStatus: async () => [],
      readCalendarEvents: async () => [],
    },
    settings: { get: () => ({ targets: [] }) },
    calendarSettings: {
      get: () => stored,
      save: (value) => {
        stored = value;
      },
    },
    workspace: () => ({
      blocks: [
        {
          id: "block-1",
          title: "Changed locally",
          start: "2026-09-14T09:00:00.000Z",
          end: "2026-09-14T10:00:00.000Z",
        },
      ],
    }),
  });

  await service.readEvents({
    start: "2026-09-14T00:00:00.000Z",
    end: "2026-09-15T00:00:00.000Z",
    calendars: [{ sourceId: "google", id: "google:primary" }],
  });

  assert.deepEqual(
    stored.links.map((link) => link.calendarId),
    ["google:team"],
  );
  assert.deepEqual(
    stored.conflicts.map((conflict) => conflict.id),
    ["google:team:event-1"],
  );
});

test("resolves keep-hibi by preparing a fresh confirmed update without mutating remotely", async () => {
  const stored = {
    calendars: [{ id: "apple:personal", mode: "bidirectional" }],
    sources: [],
    links: [
      {
        localId: "block-1",
        calendarId: "apple:personal",
        remoteId: "event-1",
        remoteRevision: "revision-1",
        localFingerprint: "before",
      },
    ],
    conflicts: [
      {
        id: "apple:personal:event-1",
        calendarId: "apple:personal",
        kind: "concurrent-update",
        summary: "Planejar",
      },
    ],
  };
  const service = createCalendarSyncService({
    eventKit: {
      available: () => true,
      authorizationStatus: () => "full-access",
      listCalendars: () => [
        { id: "personal", label: "Pessoal", writable: true },
      ],
      updateEvent: () => {
        throw new Error("must not write before confirmation");
      },
    },
    integrations: { listStatus: async () => [] },
    settings: { get: () => ({ targets: [] }) },
    calendarSettings: { get: () => stored, save: () => undefined },
    workspace: () => ({
      blocks: [
        {
          id: "block-1",
          title: "Local",
          start: "2026-09-14T09:00:00.000Z",
          end: "2026-09-14T10:00:00.000Z",
        },
      ],
    }),
    randomId: () => "conflict",
  });

  const result = await service.resolveConflict({
    id: "apple:personal:event-1",
    choice: "keep-hibi",
  });

  assert.deepEqual(result, {
    resolved: false,
    choice: "keep-hibi",
    action: {
      id: "calendar-conflict",
      confirmationId: "calendar-confirm-conflict",
      requiresConfirmation: true,
      calendarId: "apple:personal",
      summary: "Local",
    },
  });
});
