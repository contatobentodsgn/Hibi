const crypto = require("node:crypto");
const boundedText = (value, maximum = 240) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.length <= maximum;
const MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1_000;
const parseInstant = (value) =>
  boundedText(value) && !Number.isNaN(Date.parse(value))
    ? new Date(value)
    : null;
const isMode = (value) =>
  value === "disabled" || value === "read-only" || value === "bidirectional";
const blockFingerprint = (block) =>
  crypto
    .createHash("sha256")
    .update(
      JSON.stringify([
        block?.title ?? "",
        block?.start ?? block?.startsAt ?? "",
        block?.end ?? block?.endsAt ?? "",
        block?.allDay === true,
      ]),
    )
    .digest("hex");

function appleSource(eventKit) {
  if (!eventKit?.available?.())
    return {
      id: "apple",
      provider: "apple",
      label: "Calendário do Mac",
      state: "needs-permission",
      error: "configuration-incomplete",
    };
  const status = eventKit.authorizationStatus();
  if (status === "full-access")
    return {
      id: "apple",
      provider: "apple",
      label: "Calendário do Mac",
      state: "connected",
    };
  if (status === "denied" || status === "restricted")
    return {
      id: "apple",
      provider: "apple",
      label: "Calendário do Mac",
      state: "needs-permission",
      error: "permission-denied",
    };
  return {
    id: "apple",
    provider: "apple",
    label: "Calendário do Mac",
    state: "needs-permission",
  };
}

function googleSource(status) {
  if (status?.state === "connected")
    return {
      id: "google",
      provider: "google",
      label: "Google Calendar",
      state: "connected",
    };
  return {
    id: "google",
    provider: "google",
    label: "Google Calendar",
    state: "disconnected",
  };
}

function createCalendarSyncService({
  eventKit,
  integrations,
  settings,
  calendarSettings = null,
  workspace = () => ({ blocks: [] }),
  now = () => new Date().toISOString(),
  randomId = () => require("node:crypto").randomUUID(),
} = {}) {
  if (
    !eventKit ||
    typeof eventKit.available !== "function" ||
    typeof eventKit.authorizationStatus !== "function"
  )
    throw new Error("An EventKit bridge is required.");
  if (!integrations || typeof integrations.listStatus !== "function")
    throw new Error("An integration manager is required.");
  if (!settings || typeof settings.get !== "function")
    throw new Error("Calendar settings are required.");

  const persisted = () =>
    calendarSettings?.get?.() ?? {
      calendars: [],
      sources: [],
      links: [],
      conflicts: [],
    };
  const persistedCalendars = () =>
    Array.isArray(persisted().calendars)
      ? persisted().calendars.filter(
          (calendar) => boundedText(calendar?.id) && isMode(calendar?.mode),
        )
      : [];
  const modeFor = (id) =>
    persistedCalendars().find((calendar) => calendar.id === id)?.mode ??
    "read-only";
  const sourceLastSyncedAt = (id) =>
    Array.isArray(persisted().sources)
      ? persisted().sources.find((source) => source?.id === id)?.lastSyncedAt
      : undefined;
  const withSyncMetadata = (source) => ({
    ...source,
    ...(boundedText(sourceLastSyncedAt(source.id))
      ? { lastSyncedAt: sourceLastSyncedAt(source.id) }
      : {}),
  });
  const links = () =>
    Array.isArray(persisted().links) ? persisted().links : [];
  const conflicts = () =>
    Array.isArray(persisted().conflicts) ? persisted().conflicts : [];
  const saveState = (patch) =>
    calendarSettings?.save?.({
      calendars: persistedCalendars(),
      sources: Array.isArray(persisted().sources) ? persisted().sources : [],
      links: links(),
      conflicts: conflicts(),
      ...patch,
    });
  const markSourcesSynced = (ids) => {
    if (!calendarSettings || typeof calendarSettings.save !== "function")
      return;
    const state = persisted();
    const nowValue = now();
    const latest = new Map(
      (Array.isArray(state.sources) ? state.sources : []).map((source) => [
        source.id,
        source,
      ]),
    );
    for (const id of ids) latest.set(id, { id, lastSyncedAt: nowValue });
    saveState({ sources: [...latest.values()] });
  };
  const prepared = new Map();
  const validBlock = (block) =>
    block &&
    typeof block === "object" &&
    boundedText(block.id, 240) &&
    boundedText(block.title, 240) &&
    parseInstant(block.startsAt) &&
    parseInstant(block.endsAt) &&
    parseInstant(block.endsAt) > parseInstant(block.startsAt);

  const selectedGoogle = () => {
    const entry = settings.get("google-calendar");
    return Array.isArray(entry?.targets)
      ? entry.targets.filter((target) => boundedText(target?.id))
      : [];
  };
  const appleCalendars = () => {
    if (appleSource(eventKit).state !== "connected") return [];
    return (eventKit.listCalendars() ?? []).flatMap((calendar) => {
      if (!boundedText(calendar?.id) || !boundedText(calendar?.label))
        return [];
      const suffix = boundedText(calendar?.sourceLabel)
        ? ` · ${calendar.sourceLabel}`
        : "";
      const id = `apple:${calendar.id}`;
      return [
        {
          id,
          sourceId: "apple",
          label: `${calendar.label}${suffix}`.slice(0, 240),
          mode: modeFor(id),
        },
      ];
    });
  };

  return {
    async getState() {
      const statuses = await integrations.listStatus();
      const google = googleSource(
        Array.isArray(statuses)
          ? statuses.find((entry) => entry?.id === "google-calendar")
          : null,
      );
      return {
        sources: [
          withSyncMetadata(appleSource(eventKit)),
          withSyncMetadata(google),
        ],
        calendars: [
          ...appleCalendars(),
          ...selectedGoogle().map((calendar) => {
            const id = `google:${calendar.id}`;
            return {
              id,
              sourceId: "google",
              label: boundedText(calendar.label) ? calendar.label : calendar.id,
              mode: modeFor(id),
            };
          }),
        ],
        conflicts: conflicts(),
      };
    },
    async requestAppleAccess() {
      if (!eventKit.available())
        throw new Error("The macOS Calendar bridge is unavailable.");
      if (eventKit.authorizationStatus() !== "full-access")
        await eventKit.requestFullAccess();
      if (eventKit.authorizationStatus() !== "full-access")
        throw new Error("Calendar full access was not granted.");
      return { state: "connected", syncedAt: now() };
    },
    async discoverGoogleCalendars() {
      if (typeof integrations.listImportTargets !== "function")
        throw new Error("Google Calendar discovery is unavailable.");
      const targets = await integrations.listImportTargets("google-calendar");
      return (Array.isArray(targets) ? targets : []).flatMap((target) =>
        boundedText(target?.id)
          ? [
              {
                id: target.id,
                label: boundedText(target?.label) ? target.label : target.id,
              },
            ]
          : [],
      );
    },
    async saveCalendarMode(input = {}) {
      if (!calendarSettings || typeof calendarSettings.save !== "function")
        throw new Error("Calendar sync settings are unavailable.");
      if (!boundedText(input.id) || !isMode(input.mode))
        throw new Error("Calendar sync mode is invalid.");
      const current = persistedCalendars();
      const next = [
        ...current.filter((calendar) => calendar.id !== input.id),
        { id: input.id, mode: input.mode },
      ];
      saveState({ calendars: next });
      return this.getState();
    },
    async preparePublish(input = {}) {
      if (!boundedText(input.calendarId) || !validBlock(input.block))
        throw new Error("Calendar block is invalid.");
      if (modeFor(input.calendarId) !== "bidirectional")
        throw new Error(
          "Choose bidirectional mode before publishing a Hibi block.",
        );
      const block = {
        id: input.block.id,
        title: input.block.title,
        startsAt: input.block.startsAt,
        endsAt: input.block.endsAt,
        allDay: input.block.allDay === true,
      };
      if (input.calendarId.startsWith("google:")) {
        if (typeof integrations.prepareAction !== "function")
          throw new Error("Google Calendar publishing is unavailable.");
        const calendarId = input.calendarId.slice("google:".length);
        const action = await integrations.prepareAction({
          connectorId: "google-calendar",
          kind: "calendar.create",
          payload: {
            calendarId,
            title: block.title,
            startsAt: block.startsAt,
            endsAt: block.endsAt,
            allDay: block.allDay,
          },
        });
        if (
          !boundedText(action?.id, 240) ||
          !boundedText(action?.confirmationId, 240)
        )
          throw new Error("Google Calendar action preparation is invalid.");
        prepared.set(action.id, {
          external: true,
          confirmationId: action.confirmationId,
          hibiCalendarId: input.calendarId,
          block,
        });
        return {
          id: action.id,
          confirmationId: action.confirmationId,
          requiresConfirmation: true,
          calendarId: input.calendarId,
          summary: block.title,
        };
      }
      if (!input.calendarId.startsWith("apple:"))
        throw new Error("Publishing to this calendar is unavailable.");
      const calendarId = input.calendarId.slice("apple:".length);
      const calendar = appleCalendars().find(
        (entry) => entry.id === input.calendarId,
      );
      if (!calendar) throw new Error("The selected calendar is unavailable.");
      const nativeCalendar = (eventKit.listCalendars() ?? []).find(
        (entry) => entry?.id === calendarId,
      );
      if (
        nativeCalendar?.writable !== true ||
        typeof eventKit.saveEvent !== "function"
      )
        throw new Error("The selected calendar cannot be changed.");
      const id = `calendar-${randomId()}`;
      const confirmationId = `calendar-confirm-${randomId()}`;
      prepared.set(id, {
        confirmationId,
        calendarId,
        hibiCalendarId: input.calendarId,
        block,
      });
      return {
        id,
        confirmationId,
        requiresConfirmation: true,
        calendarId: input.calendarId,
        summary: input.block.title,
      };
    },
    async prepareUpdate(input = {}) {
      if (!boundedText(input.calendarId) || !validBlock(input.block))
        throw new Error("Calendar block is invalid.");
      if (modeFor(input.calendarId) !== "bidirectional")
        throw new Error(
          "Choose bidirectional mode before editing a Hibi block.",
        );
      const link = links().find(
        (entry) =>
          entry.localId === input.block.id &&
          entry.calendarId === input.calendarId,
      );
      if (!link)
        throw new Error(
          "This Hibi block is not linked to the selected calendar.",
        );
      const block = {
        id: input.block.id,
        title: input.block.title,
        startsAt: input.block.startsAt,
        endsAt: input.block.endsAt,
        allDay: input.block.allDay === true,
      };
      if (input.calendarId.startsWith("google:")) {
        if (typeof integrations.prepareAction !== "function")
          throw new Error("Google Calendar editing is unavailable.");
        const action = await integrations.prepareAction({
          connectorId: "google-calendar",
          kind: "calendar.update",
          payload: {
            calendarId: input.calendarId.slice("google:".length),
            remoteId: link.remoteId,
            expectedRevision: link.remoteRevision,
            title: block.title,
            startsAt: block.startsAt,
            endsAt: block.endsAt,
            allDay: block.allDay,
          },
        });
        if (
          !boundedText(action?.id, 240) ||
          !boundedText(action?.confirmationId, 240)
        )
          throw new Error("Google Calendar action preparation is invalid.");
        prepared.set(action.id, {
          kind: "update",
          external: true,
          confirmationId: action.confirmationId,
          hibiCalendarId: input.calendarId,
          link,
          block,
        });
        return {
          id: action.id,
          confirmationId: action.confirmationId,
          requiresConfirmation: true,
          calendarId: input.calendarId,
          summary: block.title,
        };
      }
      if (
        !input.calendarId.startsWith("apple:") ||
        typeof eventKit.updateEvent !== "function"
      )
        throw new Error("Calendar editing is unavailable.");
      const id = `calendar-${randomId()}`;
      const confirmationId = `calendar-confirm-${randomId()}`;
      prepared.set(id, {
        kind: "update",
        confirmationId,
        hibiCalendarId: input.calendarId,
        link,
        block,
      });
      return {
        id,
        confirmationId,
        requiresConfirmation: true,
        calendarId: input.calendarId,
        summary: block.title,
      };
    },
    async resolveConflict(input = {}) {
      if (
        !boundedText(input.id) ||
        !["keep-calendar", "keep-hibi"].includes(input.choice)
      )
        throw new Error("Calendar conflict resolution is invalid.");
      const conflict = conflicts().find((entry) => entry.id === input.id);
      if (!conflict) throw new Error("Calendar conflict is unavailable.");
      if (input.choice === "keep-hibi") {
        const link = links().find(
          (entry) => `${entry.calendarId}:${entry.remoteId}` === input.id,
        );
        const block =
          link &&
          (Array.isArray(workspace()?.blocks) ? workspace().blocks : []).find(
            (entry) => entry?.id === link.localId,
          );
        if (
          !link ||
          !block ||
          !boundedText(block.title) ||
          !boundedText(block.start) ||
          !boundedText(block.end)
        )
          throw new Error("The Hibi block for this conflict is unavailable.");
        const action = await this.prepareUpdate({
          calendarId: link.calendarId,
          block: {
            id: block.id,
            title: block.title,
            startsAt: block.start,
            endsAt: block.end,
            allDay: block.allDay === true,
          },
        });
        return { resolved: false, choice: "keep-hibi", action };
      }
      saveState({
        links: links().filter(
          (link) => `${link.calendarId}:${link.remoteId}` !== input.id,
        ),
        conflicts: conflicts().filter((entry) => entry.id !== input.id),
      });
      return { resolved: true, choice: "keep-calendar" };
    },
    async executeApproved(input = {}) {
      const action = prepared.get(input.actionId);
      if (!action || input.confirmationId !== action.confirmationId)
        throw new Error(
          "A matching confirmation is required before publishing this calendar block.",
        );
      prepared.delete(input.actionId);
      if (action.external) {
        if (typeof integrations.executeApproved !== "function")
          throw new Error("Google Calendar publishing is unavailable.");
        const result = await integrations.executeApproved({
          actionId: input.actionId,
          confirmationId: input.confirmationId,
        });
        if (result?.ok !== true || !boundedText(result?.remoteId, 240))
          throw new Error(
            `Calendar event could not be ${action.kind === "update" ? "updated" : "created"}.`,
          );
        const revision = boundedText(result.revision, 240)
          ? result.revision
          : result.remoteId;
        saveState({
          links: [
            ...links().filter(
              (link) =>
                link.localId !== action.block.id &&
                `${link.calendarId}:${link.remoteId}` !==
                  `${action.hibiCalendarId}:${result.remoteId}`,
            ),
            {
              localId: action.block.id,
              calendarId: action.hibiCalendarId,
              remoteId: result.remoteId,
              remoteRevision: revision,
              localFingerprint: blockFingerprint(action.block),
            },
          ],
          conflicts: conflicts().filter(
            (conflict) =>
              conflict.id !== `${action.hibiCalendarId}:${result.remoteId}`,
          ),
        });
        return { remoteId: result.remoteId, revision };
      }
      const remote =
        action.kind === "update"
          ? eventKit.updateEvent({
              id: action.link.remoteId,
              title: action.block.title,
              start: action.block.startsAt,
              end: action.block.endsAt,
              allDay: action.block.allDay,
              expectedRevision: action.link.remoteRevision,
            })
          : eventKit.saveEvent({
              calendarId: action.calendarId,
              title: action.block.title,
              start: action.block.startsAt,
              end: action.block.endsAt,
              allDay: action.block.allDay,
            });
      const result = await Promise.resolve(remote);
      if (!boundedText(result?.id, 240))
        throw new Error(
          `Calendar event could not be ${action.kind === "update" ? "updated" : "created"}.`,
        );
      const revision = boundedText(result.revision, 240)
        ? result.revision
        : result.id;
      saveState({
        links: [
          ...links().filter(
            (link) =>
              link.localId !== action.block.id &&
              `${link.calendarId}:${link.remoteId}` !==
                `${action.hibiCalendarId}:${result.id}`,
          ),
          {
            localId: action.block.id,
            calendarId: action.hibiCalendarId,
            remoteId: result.id,
            remoteRevision: revision,
            localFingerprint: blockFingerprint(action.block),
          },
        ],
        conflicts: conflicts().filter(
          (conflict) => conflict.id !== `${action.hibiCalendarId}:${result.id}`,
        ),
      });
      return { remoteId: result.id, revision };
    },
    async readEvents(input = {}) {
      const start = parseInstant(input.start);
      const end = parseInstant(input.end);
      if (
        !start ||
        !end ||
        end <= start ||
        end.getTime() - start.getTime() > MAX_RANGE_MS
      )
        throw new Error("Calendar event range is invalid.");
      const calendars = Array.isArray(input.calendars)
        ? input.calendars.slice(0, 200)
        : [];
      const appleIds = calendars
        .filter(
          (calendar) =>
            calendar?.sourceId === "apple" &&
            boundedText(calendar.id) &&
            calendar.id.startsWith("apple:"),
        )
        .map((calendar) => calendar.id.slice("apple:".length));
      const googleIds = calendars
        .filter(
          (calendar) =>
            calendar?.sourceId === "google" &&
            boundedText(calendar.id) &&
            calendar.id.startsWith("google:"),
        )
        .map((calendar) => calendar.id.slice("google:".length));
      const events = [];
      if (appleIds.length > 0) {
        if (appleSource(eventKit).state !== "connected")
          throw new Error("Calendar full access is required.");
        for (const event of eventKit.listEvents({
          start: start.toISOString(),
          end: end.toISOString(),
          calendarIds: appleIds,
        }) ?? []) {
          if (
            !boundedText(event?.id, 240) ||
            !boundedText(event?.calendarId, 240) ||
            !boundedText(event?.title, 240) ||
            !boundedText(event?.startsAt, 240) ||
            !boundedText(event?.endsAt, 240)
          )
            continue;
          events.push({
            sourceId: "apple",
            calendarId: `apple:${event.calendarId}`,
            remoteId: event.id,
            ...(boundedText(event.revision, 240)
              ? { revision: event.revision }
              : {}),
            title: event.title,
            startsAt: event.startsAt,
            endsAt: event.endsAt,
            allDay: event.allDay === true,
            writable: event.writable === true,
          });
        }
      }
      if (googleIds.length > 0) {
        if (typeof integrations.readCalendarEvents !== "function")
          throw new Error("Google Calendar event reading is unavailable.");
        for (const calendarId of googleIds) {
          const remoteEvents = await integrations.readCalendarEvents(
            "google-calendar",
            {
              calendarId,
              timeMin: start.toISOString(),
              timeMax: end.toISOString(),
            },
          );
          for (const event of remoteEvents ?? []) {
            if (
              !boundedText(event?.remoteId, 240) ||
              !boundedText(event?.title, 240) ||
              !boundedText(event?.startsAt, 240) ||
              !boundedText(event?.endsAt, 240)
            )
              continue;
            events.push({
              sourceId: "google",
              calendarId: `google:${calendarId}`,
              remoteId: event.remoteId,
              ...(boundedText(event.revision, 240)
                ? { revision: event.revision }
                : {}),
              title: event.title,
              startsAt: event.startsAt,
              endsAt: event.endsAt,
              allDay: event.allDay === true,
              writable: false,
              ...(event.cancelled === true ? { cancelled: true } : {}),
            });
          }
        }
      }
      const localBlocks = Array.isArray(workspace()?.blocks)
        ? workspace().blocks
        : [];
      const selectedCalendarIds = new Set(
        calendars
          .map((calendar) => calendar?.id)
          .filter((id) => boundedText(id)),
      );
      const eventByRemote = new Map(
        events.map((event) => [`${event.calendarId}:${event.remoteId}`, event]),
      );
      const nextLinks = [];
      const nextConflicts = conflicts().filter(
        (conflict) => !selectedCalendarIds.has(conflict.calendarId),
      );
      for (const link of links()) {
        if (!selectedCalendarIds.has(link.calendarId)) {
          nextLinks.push(link);
          continue;
        }
        const event = eventByRemote.get(`${link.calendarId}:${link.remoteId}`);
        const local = localBlocks.find((block) => block?.id === link.localId);
        if (!event || event.cancelled === true) {
          if (local && blockFingerprint(local) !== link.localFingerprint)
            nextConflicts.push({
              id: `${link.calendarId}:${link.remoteId}`,
              calendarId: link.calendarId,
              kind: "remote-deleted",
              summary: local.title,
            });
          else if (local) nextLinks.push(link);
          continue;
        }
        if (
          boundedText(event.revision, 240) &&
          boundedText(link.remoteRevision, 240) &&
          event.revision !== link.remoteRevision
        ) {
          if (local && blockFingerprint(local) !== link.localFingerprint) {
            nextLinks.push(link);
            nextConflicts.push({
              id: `${link.calendarId}:${link.remoteId}`,
              calendarId: link.calendarId,
              kind: "concurrent-update",
              summary: local.title,
            });
          } else nextLinks.push({ ...link, remoteRevision: event.revision });
        } else nextLinks.push(link);
      }
      saveState({ links: nextLinks, conflicts: nextConflicts });
      markSourcesSynced([
        ...new Set(
          calendars
            .filter(
              (calendar) =>
                calendar?.sourceId === "apple" ||
                calendar?.sourceId === "google",
            )
            .map((calendar) => calendar.sourceId),
        ),
      ]);
      return events;
    },
  };
}

module.exports = { blockFingerprint, createCalendarSyncService };
