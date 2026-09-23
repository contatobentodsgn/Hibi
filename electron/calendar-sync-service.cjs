const crypto = require("node:crypto");
const { localTimeZone, toFloatingWallClock, toInstant, toOffsetIso } = require("./calendar-time.cjs");

const TEXT_LIMIT = 240;
const MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1_000;
// Uma confirmação vale por pouco tempo e o número de preparações abertas tem teto: uma preparação
// abandonada não pode autorizar uma escrita horas depois, nem o mapa crescer sem limite.
const PREPARED_TTL_MS = 5 * 60 * 1_000;
const MAX_PREPARED = 20;
const MAX_PENDING = 200;
const MAX_CONFLICTS = 5_000;
const MAX_CALENDARS_PER_READ = 200;
// Cada evento ausente da janela custa uma busca pelo id (e, no Google, uma chamada de rede). O que passar do
// teto fica como está e é reavaliado na próxima leitura.
const MAX_LOOKUPS_PER_READ = 50;
const MAX_CHANGES = 200;
const boundedText = (value, maximum = TEXT_LIMIT) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.length <= maximum;
const isMode = (value) =>
  value === "disabled" || value === "read-only" || value === "bidirectional";
const isCalendarId = (value) =>
  boundedText(value) && /^(apple|google):\S/.test(value);
// O IPC entrega o que o renderer mandar: `null`, texto ou lista viram objeto vazio e caem na validação
// com a mensagem de sempre, em vez de um TypeError.
const objectInput = (input) =>
  input && typeof input === "object" && !Array.isArray(input) ? input : {};
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
// O resumo vai para o arquivo de configurações, que recusa texto acima de 240 caracteres: sem cortar,
// um título longo fazia toda leitura seguinte falhar.
const summaryFor = (block) => {
  const title =
    typeof block?.title === "string" ? block.title.replace(/\s+/g, " ").trim() : "";
  return (title || String(block?.id ?? "")).slice(0, TEXT_LIMIT) || "-";
};
const remoteWindow = (startsAt, endsAt) => {
  const start = toInstant(startsAt);
  const end = toInstant(endsAt);
  return start && end
    ? { remoteStartsAt: toOffsetIso(start), remoteEndsAt: toOffsetIso(end) }
    : {};
};

// Os rótulos das fontes são texto de interface e ficam no renderer; aqui só vão identificadores.
function appleSource(eventKit) {
  const source = { id: "apple", provider: "apple" };
  if (!eventKit?.available?.())
    return { ...source, state: "needs-permission", error: "configuration-incomplete" };
  const status = eventKit.authorizationStatus();
  if (status === "full-access") return { ...source, state: "connected" };
  if (status === "denied" || status === "restricted")
    return { ...source, state: "needs-permission", error: "permission-denied" };
  return { ...source, state: "needs-permission" };
}

function googleSource(status) {
  return {
    id: "google",
    provider: "google",
    state: status?.state === "connected" ? "connected" : "disconnected",
  };
}

function createCalendarSyncService({
  eventKit,
  integrations,
  settings,
  calendarSettings = null,
  // `null` quer dizer que o renderer ainda não mandou o workspace: sem os blocos, a leitura não decide
  // nada sobre vínculos.
  workspace = () => ({ blocks: [] }),
  now = () => new Date().toISOString(),
  clock = () => Date.now(),
  randomId = () => crypto.randomUUID(),
  randomEventId = () => crypto.randomBytes(16).toString("hex"),
  timeZone = localTimeZone,
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

  const list = (key) => {
    const value = calendarSettings?.get?.()?.[key];
    return Array.isArray(value) ? value : [];
  };
  const persistedCalendars = () =>
    list("calendars").filter(
      (calendar) => boundedText(calendar?.id) && isMode(calendar?.mode),
    );
  const modeFor = (id) =>
    persistedCalendars().find((calendar) => calendar.id === id)?.mode ??
    "read-only";
  const withSyncMetadata = (source) => {
    const lastSyncedAt = list("sources").find(
      (entry) => entry?.id === source.id,
    )?.lastSyncedAt;
    return { ...source, ...(boundedText(lastSyncedAt) ? { lastSyncedAt } : {}) };
  };
  const saveState = (patch) =>
    calendarSettings?.save?.({
      calendars: persistedCalendars(),
      sources: list("sources"),
      links: list("links"),
      conflicts: list("conflicts"),
      pending: list("pending"),
      ...patch,
    });
  const requireSettings = () => {
    if (!calendarSettings || typeof calendarSettings.save !== "function")
      throw new Error("Calendar sync settings are unavailable.");
  };
  const loadedBlocks = () => {
    const value = workspace();
    return value && Array.isArray(value.blocks) ? value.blocks : null;
  };
  const pendingFor = (calendarId, localId) =>
    list("pending").find(
      (entry) => entry?.calendarId === calendarId && entry?.localId === localId,
    );

  const prepared = new Map();
  const remember = (id, entry) => {
    const at = clock();
    for (const [key, value] of prepared)
      if (value.expiresAt <= at) prepared.delete(key);
    while (prepared.size >= MAX_PREPARED)
      prepared.delete(prepared.keys().next().value);
    prepared.set(id, { ...entry, expiresAt: at + PREPARED_TTL_MS });
  };
  const blockFrom = (raw) => {
    const block = objectInput(raw);
    const start = toInstant(block.startsAt);
    const end = toInstant(block.endsAt);
    if (
      !boundedText(block.id) ||
      !boundedText(block.title) ||
      !start ||
      !end ||
      end <= start ||
      end.getTime() - start.getTime() > MAX_RANGE_MS
    )
      return null;
    return {
      id: block.id,
      title: block.title,
      startsAt: block.startsAt,
      endsAt: block.endsAt,
      allDay: block.allDay === true,
    };
  };
  // Borda do processo principal: a hora de parede flutuante do bloco vira instante com o fuso local.
  const remoteTimes = (block) => ({
    startsAt: toOffsetIso(toInstant(block.startsAt)),
    endsAt: toOffsetIso(toInstant(block.endsAt)),
  });
  const googlePayload = (calendarId, block, extra) => {
    const zone = timeZone();
    return {
      calendarId,
      title: block.title,
      ...remoteTimes(block),
      allDay: block.allDay,
      ...(boundedText(zone, 64) ? { timeZone: zone } : {}),
      ...extra,
    };
  };
  const confirmation = (id, confirmationId, calendarId, block) => ({
    id,
    confirmationId,
    requiresConfirmation: true,
    calendarId,
    summary: summaryFor(block),
  });
  const validGoogleAction = (action) =>
    boundedText(action?.id) && boundedText(action?.confirmationId);

  async function preparePublishFor(calendarId, block, extra = {}) {
    if (modeFor(calendarId) !== "bidirectional")
      throw new Error("Choose bidirectional mode before publishing a Pixano block.");
    const fingerprint = extra.fingerprint ?? blockFingerprint(block);
    if (calendarId.startsWith("google:")) {
      if (typeof integrations.prepareAction !== "function")
        throw new Error("Google Calendar publishing is unavailable.");
      // O id do evento é escolhido aqui. Repetir uma publicação cuja gravação local falhou reaproveita o
      // mesmo id, e o Google devolve o evento já criado em vez de duplicá-lo.
      const eventId = pendingFor(calendarId, block.id)?.eventId ?? randomEventId();
      const action = await integrations.prepareAction({
        connectorId: "google-calendar",
        kind: "calendar.create",
        payload: googlePayload(calendarId.slice("google:".length), block, { eventId }),
      });
      if (!validGoogleAction(action))
        throw new Error("Google Calendar action preparation is invalid.");
      remember(action.id, {
        kind: "create",
        external: true,
        confirmationId: action.confirmationId,
        hibiCalendarId: calendarId,
        block,
        fingerprint,
        eventId,
        resolvesConflictId: extra.resolvesConflictId,
      });
      return confirmation(action.id, action.confirmationId, calendarId, block);
    }
    if (!calendarId.startsWith("apple:"))
      throw new Error("Publishing to this calendar is unavailable.");
    if (appleSource(eventKit).state !== "connected")
      throw new Error("The selected calendar is unavailable.");
    const nativeId = calendarId.slice("apple:".length);
    const nativeCalendar = (eventKit.listCalendars() ?? []).find(
      (entry) => entry?.id === nativeId,
    );
    if (!nativeCalendar) throw new Error("The selected calendar is unavailable.");
    if (nativeCalendar.writable !== true || typeof eventKit.saveEvent !== "function")
      throw new Error("The selected calendar cannot be changed.");
    const id = `calendar-${randomId()}`;
    const confirmationId = `calendar-confirm-${randomId()}`;
    remember(id, {
      kind: "create",
      confirmationId,
      calendarId: nativeId,
      hibiCalendarId: calendarId,
      block,
      fingerprint,
      resolvesConflictId: extra.resolvesConflictId,
    });
    return confirmation(id, confirmationId, calendarId, block);
  }

  async function prepareUpdateFor(calendarId, block, link, expectedRevision, extra = {}) {
    if (modeFor(calendarId) !== "bidirectional")
      throw new Error("Choose bidirectional mode before editing a Pixano block.");
    const entry = {
      kind: "update",
      hibiCalendarId: calendarId,
      link,
      expectedRevision,
      block,
      fingerprint: extra.fingerprint ?? blockFingerprint(block),
      resolvesConflictId: extra.resolvesConflictId,
    };
    if (calendarId.startsWith("google:")) {
      if (typeof integrations.prepareAction !== "function")
        throw new Error("Google Calendar editing is unavailable.");
      const action = await integrations.prepareAction({
        connectorId: "google-calendar",
        kind: "calendar.update",
        payload: googlePayload(calendarId.slice("google:".length), block, {
          remoteId: link.remoteId,
          expectedRevision,
        }),
      });
      if (!validGoogleAction(action))
        throw new Error("Google Calendar action preparation is invalid.");
      remember(action.id, { ...entry, external: true, confirmationId: action.confirmationId });
      return confirmation(action.id, action.confirmationId, calendarId, block);
    }
    if (!calendarId.startsWith("apple:") || typeof eventKit.updateEvent !== "function")
      throw new Error("Calendar editing is unavailable.");
    const id = `calendar-${randomId()}`;
    const confirmationId = `calendar-confirm-${randomId()}`;
    remember(id, { ...entry, confirmationId });
    return confirmation(id, confirmationId, calendarId, block);
  }

  // Busca um evento vinculado pelo id. `null`: o calendário confirmou que ele não existe. `undefined`: não deu
  // para saber (sem ponte, sem rede, resposta estranha), e então nada deve mudar.
  const lookupEvent = async (link) => {
    try {
      if (link.calendarId.startsWith("apple:")) {
        if (typeof eventKit.getEvent !== "function") return undefined;
        const found = eventKit.getEvent(link.remoteId);
        if (found === null) return null;
        return boundedText(found?.id) && found.id === link.remoteId && boundedText(found.startsAt) && boundedText(found.endsAt)
          ? { remoteId: found.id, ...(boundedText(found.revision) ? { revision: found.revision } : {}), startsAt: found.startsAt, endsAt: found.endsAt }
          : undefined;
      }
      if (typeof integrations.readCalendarEvent !== "function") return undefined;
      const found = await integrations.readCalendarEvent("google-calendar", {
        calendarId: link.calendarId.slice("google:".length),
        remoteId: link.remoteId,
      });
      if (found === null) return null;
      return boundedText(found?.remoteId) && found.remoteId === link.remoteId && boundedText(found.startsAt) && boundedText(found.endsAt)
        ? {
            remoteId: found.remoteId,
            ...(boundedText(found.revision) ? { revision: found.revision } : {}),
            startsAt: found.startsAt,
            endsAt: found.endsAt,
            ...(found.cancelled === true ? { cancelled: true } : {}),
          }
        : undefined;
    } catch {
      return undefined;
    }
  };

  // Depois de uma falha entre a escrita no EventKit e o registro do vínculo, a nova tentativa procura o
  // evento idêntico que já foi criado antes de criar outro.
  const existingAppleEvent = (action) => {
    if (typeof eventKit.listEvents !== "function") return null;
    const start = toInstant(action.block.startsAt);
    const end = toInstant(action.block.endsAt);
    const linked = new Set(
      list("links")
        .filter((link) => link?.calendarId === action.hibiCalendarId)
        .map((link) => link.remoteId),
    );
    const match = (eventKit.listEvents({
      start: toOffsetIso(start),
      end: toOffsetIso(end),
      calendarIds: [action.calendarId],
    }) ?? []).find(
      (event) =>
        boundedText(event?.id) &&
        !linked.has(event.id) &&
        event.calendarId === action.calendarId &&
        event.title === action.block.title &&
        Date.parse(event.startsAt) === start.getTime() &&
        Date.parse(event.endsAt) === end.getTime(),
    );
    return match ? { id: match.id, revision: match.revision } : null;
  };

  return {
    async getState() {
      const statuses = await integrations.listStatus();
      const google = googleSource(
        Array.isArray(statuses)
          ? statuses.find((entry) => entry?.id === "google-calendar")
          : null,
      );
      const appleCalendars =
        appleSource(eventKit).state === "connected"
          ? (eventKit.listCalendars() ?? []).flatMap((calendar) => {
              if (!boundedText(calendar?.id) || !boundedText(calendar?.label)) return [];
              const suffix = boundedText(calendar?.sourceLabel)
                ? ` · ${calendar.sourceLabel}`
                : "";
              const id = `apple:${calendar.id}`;
              return [
                {
                  id,
                  sourceId: "apple",
                  label: `${calendar.label}${suffix}`.slice(0, TEXT_LIMIT),
                  mode: modeFor(id),
                },
              ];
            })
          : [];
      const entry = settings.get("google-calendar");
      const googleCalendars = (Array.isArray(entry?.targets) ? entry.targets : [])
        .filter((target) => boundedText(target?.id))
        .map((calendar) => {
          const id = `google:${calendar.id}`;
          return {
            id,
            sourceId: "google",
            label: boundedText(calendar.label) ? calendar.label : calendar.id,
            mode: modeFor(id),
          };
        });
      return {
        sources: [withSyncMetadata(appleSource(eventKit)), withSyncMetadata(google)],
        calendars: [...appleCalendars, ...googleCalendars],
        conflicts: list("conflicts").map((conflict) => ({
          id: conflict.id,
          calendarId: conflict.calendarId,
          kind: conflict.kind,
          summary: conflict.summary,
        })),
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
          ? [{ id: target.id, label: boundedText(target?.label) ? target.label : target.id }]
          : [],
      );
    },
    async saveCalendarMode(input) {
      const safe = objectInput(input);
      requireSettings();
      if (!isCalendarId(safe.id) || !isMode(safe.mode))
        throw new Error("Calendar sync mode is invalid.");
      saveState({
        calendars: [
          ...persistedCalendars().filter((calendar) => calendar.id !== safe.id),
          { id: safe.id, mode: safe.mode },
        ],
      });
      return this.getState();
    },
    // O que mudou de um lado só desde a última sincronização de cada vínculo, num calendário bidirecional.
    // Antes a publicação era de mão única e uma vez só: editar o bloco no Hibi não chegava ao calendário, e
    // mover o evento no calendário não chegava ao Hibi, sem aviso. Um vínculo com conflito fica de fora:
    // os dois lados mudaram, e quem decide é a resolução de conflito.
    //  - `outgoing`: o bloco mudou no Hibi. Enviar é `prepareUpdate` e a confirmação de sempre.
    //  - `incoming`: o evento mudou de horário no calendário (a leitura atualiza a janela remota do
    //    vínculo) e o bloco não. Trazer é o renderer mover o bloco e chamar `acknowledgeIncoming`.
    listChanges() {
      const blocks = loadedBlocks();
      if (!blocks) return { outgoing: [], incoming: [] };
      const conflicted = new Set(list("conflicts").map((conflict) => conflict?.id));
      const outgoing = [];
      const incoming = [];
      for (const link of list("links")) {
        if (!isCalendarId(link?.calendarId) || modeFor(link.calendarId) !== "bidirectional") continue;
        if (conflicted.has(`${link.calendarId}:${link.remoteId}`)) continue;
        const local = blocks.find((entry) => entry?.id === link.localId);
        if (!local) continue;
        const base = { localId: local.id, calendarId: link.calendarId, summary: summaryFor(local) };
        if (blockFingerprint(local) !== link.localFingerprint) {
          outgoing.push(base);
          continue;
        }
        const remoteStart = toInstant(link.remoteStartsAt);
        const remoteEnd = toInstant(link.remoteEndsAt);
        const localStart = toInstant(local.start);
        const localEnd = toInstant(local.end);
        if (!remoteStart || !remoteEnd || !localStart || !localEnd || remoteEnd <= remoteStart) continue;
        if (remoteStart.getTime() !== localStart.getTime() || remoteEnd.getTime() !== localEnd.getTime())
          incoming.push({ ...base, start: toFloatingWallClock(remoteStart), end: toFloatingWallClock(remoteEnd) });
      }
      return { outgoing: outgoing.slice(0, MAX_CHANGES), incoming: incoming.slice(0, MAX_CHANGES) };
    },
    // O bloco já foi movido para o horário do calendário: o vínculo passa a considerar essa versão a
    // sincronizada, senão a mudança trazida apareceria em seguida como uma edição a enviar. Só vale para o
    // horário que o calendário tem agora.
    acknowledgeIncoming(input) {
      const safe = objectInput(input);
      const block = blockFrom(safe.block);
      if (!isCalendarId(safe.calendarId) || !block) throw new Error("Calendar block is invalid.");
      requireSettings();
      const found = list("links").find((entry) => entry?.localId === block.id && entry?.calendarId === safe.calendarId);
      if (!found) throw new Error("This Pixano block is not linked to the selected calendar.");
      const remoteStart = toInstant(found.remoteStartsAt);
      const remoteEnd = toInstant(found.remoteEndsAt);
      if (!remoteStart || !remoteEnd || toInstant(block.startsAt)?.getTime() !== remoteStart.getTime() || toInstant(block.endsAt)?.getTime() !== remoteEnd.getTime())
        throw new Error("The Pixano block does not match the calendar event.");
      saveState({
        // Pelo par bloco e calendário, não pela identidade do objeto: o arquivo de configurações devolve
        // uma cópia nova a cada leitura, e a comparação por identidade nunca achava o vínculo.
        links: list("links").map((entry) =>
          entry?.localId === block.id && entry?.calendarId === safe.calendarId
            ? { ...entry, localFingerprint: blockFingerprint(block) }
            : entry,
        ),
      });
      return this.listChanges();
    },
    async preparePublish(input) {
      const safe = objectInput(input);
      const block = blockFrom(safe.block);
      if (!isCalendarId(safe.calendarId) || !block)
        throw new Error("Calendar block is invalid.");
      return preparePublishFor(safe.calendarId, block);
    },
    async prepareUpdate(input) {
      const safe = objectInput(input);
      const block = blockFrom(safe.block);
      if (!isCalendarId(safe.calendarId) || !block)
        throw new Error("Calendar block is invalid.");
      const link = list("links").find(
        (entry) => entry?.localId === block.id && entry?.calendarId === safe.calendarId,
      );
      if (!link)
        throw new Error("This Pixano block is not linked to the selected calendar.");
      return prepareUpdateFor(safe.calendarId, block, link, link.remoteRevision);
    },
    async resolveConflict(input) {
      const safe = objectInput(input);
      if (!boundedText(safe.id) || !["keep-calendar", "keep-hibi"].includes(safe.choice))
        throw new Error("Calendar conflict resolution is invalid.");
      const conflict = list("conflicts").find((entry) => entry?.id === safe.id);
      if (!conflict) throw new Error("Calendar conflict is unavailable.");
      const link = list("links").find(
        (entry) => `${entry?.calendarId}:${entry?.remoteId}` === conflict.id,
      );
      if (safe.choice === "keep-hibi") {
        const local =
          link && loadedBlocks()?.find((entry) => entry?.id === link.localId);
        const block =
          local &&
          blockFrom({
            id: local.id,
            title: typeof local.title === "string" ? local.title.slice(0, TEXT_LIMIT) : "",
            startsAt: local.start,
            endsAt: local.end,
            allDay: local.allDay === true,
          });
        if (!link || !block)
          throw new Error("The Pixano block for this conflict is unavailable.");
        const extra = {
          resolvesConflictId: conflict.id,
          fingerprint: blockFingerprint(local),
        };
        // Evento apagado no calendário: manter o Hibi é recriá-lo. Evento alterado: atualizar contra a
        // revisão que a leitura viu, e não a do vínculo, que o calendário já recusa.
        const action =
          conflict.kind === "remote-deleted"
            ? await preparePublishFor(link.calendarId, block, extra)
            : await prepareUpdateFor(
                link.calendarId,
                block,
                link,
                boundedText(conflict.remoteRevision)
                  ? conflict.remoteRevision
                  : link.remoteRevision,
                extra,
              );
        return { resolved: false, choice: "keep-hibi", action };
      }
      requireSettings();
      saveState({
        links: list("links").filter(
          (entry) => `${entry?.calendarId}:${entry?.remoteId}` !== conflict.id,
        ),
        conflicts: list("conflicts").filter((entry) => entry?.id !== conflict.id),
      });
      return { resolved: true, choice: "keep-calendar" };
    },
    async executeApproved(input) {
      const safe = objectInput(input);
      const action = boundedText(safe.actionId) ? prepared.get(safe.actionId) : undefined;
      if (!action || safe.confirmationId !== action.confirmationId)
        throw new Error(
          "A matching confirmation is required before publishing this calendar block.",
        );
      prepared.delete(safe.actionId);
      if (action.expiresAt <= clock())
        throw new Error("This calendar confirmation expired. Prepare it again.");
      requireSettings();
      const verb = action.kind === "update" ? "updated" : "created";
      const { block, hibiCalendarId } = action;
      const isThisPending = (entry) =>
        entry?.calendarId === hibiCalendarId && entry?.localId === block.id;
      const retrying = action.kind === "create" && Boolean(pendingFor(hibiCalendarId, block.id));
      if (action.kind === "create")
        // A intenção é gravada antes da escrita remota. Se esta gravação falhar, nada foi enviado.
        saveState({
          pending: [
            ...list("pending").filter((entry) => !isThisPending(entry)),
            {
              localId: block.id,
              calendarId: hibiCalendarId,
              startedAt: now(),
              ...(action.eventId ? { eventId: action.eventId } : {}),
            },
          ].slice(-MAX_PENDING),
        });
      let remoteId;
      let revision;
      if (action.external) {
        if (typeof integrations.executeApproved !== "function")
          throw new Error("Google Calendar publishing is unavailable.");
        const result = await integrations.executeApproved({
          actionId: safe.actionId,
          confirmationId: safe.confirmationId,
        });
        if (result?.ok !== true || !boundedText(result?.remoteId))
          throw new Error(`Calendar event could not be ${verb}.`);
        ({ remoteId, revision } = result);
      } else {
        const times = remoteTimes(block);
        const result = await Promise.resolve(
          action.kind === "update"
            ? eventKit.updateEvent({
                id: action.link.remoteId,
                title: block.title,
                start: times.startsAt,
                end: times.endsAt,
                allDay: block.allDay,
                expectedRevision: action.expectedRevision,
              })
            : ((retrying ? existingAppleEvent(action) : null) ??
                eventKit.saveEvent({
                  calendarId: action.calendarId,
                  title: block.title,
                  start: times.startsAt,
                  end: times.endsAt,
                  allDay: block.allDay,
                })),
        );
        if (!boundedText(result?.id))
          throw new Error(`Calendar event could not be ${verb}.`);
        ({ id: remoteId, revision } = result);
      }
      if (!boundedText(revision)) revision = remoteId;
      const key = `${hibiCalendarId}:${remoteId}`;
      saveState({
        links: [
          ...list("links").filter(
            (link) =>
              !(link?.localId === block.id && link?.calendarId === hibiCalendarId) &&
              `${link?.calendarId}:${link?.remoteId}` !== key,
          ),
          {
            localId: block.id,
            calendarId: hibiCalendarId,
            remoteId,
            remoteRevision: revision,
            localFingerprint: action.fingerprint,
            ...remoteWindow(block.startsAt, block.endsAt),
          },
        ],
        conflicts: list("conflicts").filter(
          (conflict) => conflict?.id !== key && conflict?.id !== action.resolvesConflictId,
        ),
        pending: list("pending").filter((entry) => !isThisPending(entry)),
      });
      return { remoteId, revision };
    },
    async readEvents(input) {
      const safe = objectInput(input);
      const start = toInstant(safe.start);
      const end = toInstant(safe.end);
      if (!start || !end || end <= start || end.getTime() - start.getTime() > MAX_RANGE_MS)
        throw new Error("Calendar event range is invalid.");
      const calendars = Array.isArray(safe.calendars)
        ? safe.calendars.slice(0, MAX_CALENDARS_PER_READ)
        : [];
      const idsFor = (sourceId) => [
        ...new Set(
          calendars
            .filter(
              (calendar) =>
                calendar?.sourceId === sourceId &&
                isCalendarId(calendar.id) &&
                calendar.id.startsWith(`${sourceId}:`),
            )
            .map((calendar) => calendar.id.slice(sourceId.length + 1)),
        ),
      ];
      const events = [];
      // Só os calendários efetivamente lidos podem ter vínculos e conflitos reavaliados.
      const readCalendarIds = new Set();
      const appleIds = idsFor("apple");
      if (appleIds.length > 0) {
        if (appleSource(eventKit).state !== "connected")
          throw new Error("Calendar full access is required.");
        const known = new Set(
          (eventKit.listCalendars() ?? []).map((calendar) => calendar?.id),
        );
        // O EventKit lê todos os calendários quando nenhum id é reconhecido, então só vão ids que existem
        // e só voltam eventos deles.
        const readable = appleIds.filter((id) => known.has(id));
        if (readable.length > 0) {
          const wanted = new Set(readable);
          for (const event of eventKit.listEvents({
            start: toOffsetIso(start),
            end: toOffsetIso(end),
            calendarIds: readable,
          }) ?? []) {
            if (
              !boundedText(event?.id) ||
              !wanted.has(event?.calendarId) ||
              !boundedText(event?.title) ||
              !boundedText(event?.startsAt) ||
              !boundedText(event?.endsAt)
            )
              continue;
            events.push({
              sourceId: "apple",
              calendarId: `apple:${event.calendarId}`,
              remoteId: event.id,
              ...(boundedText(event.revision) ? { revision: event.revision } : {}),
              title: event.title,
              startsAt: event.startsAt,
              endsAt: event.endsAt,
              allDay: event.allDay === true,
              writable: event.writable === true,
            });
          }
          for (const id of readable) readCalendarIds.add(`apple:${id}`);
        }
      }
      const googleIds = idsFor("google");
      if (googleIds.length > 0) {
        if (typeof integrations.readCalendarEvents !== "function")
          throw new Error("Google Calendar event reading is unavailable.");
        for (const calendarId of googleIds) {
          const remoteEvents = await integrations.readCalendarEvents("google-calendar", {
            calendarId,
            timeMin: start.toISOString(),
            timeMax: end.toISOString(),
          });
          for (const event of Array.isArray(remoteEvents) ? remoteEvents : []) {
            if (
              !boundedText(event?.remoteId) ||
              !boundedText(event?.title) ||
              !boundedText(event?.startsAt) ||
              !boundedText(event?.endsAt)
            )
              continue;
            events.push({
              sourceId: "google",
              calendarId: `google:${calendarId}`,
              remoteId: event.remoteId,
              ...(boundedText(event.revision) ? { revision: event.revision } : {}),
              title: event.title,
              startsAt: event.startsAt,
              endsAt: event.endsAt,
              allDay: event.allDay === true,
              writable: false,
              ...(event.cancelled === true ? { cancelled: true } : {}),
            });
          }
          readCalendarIds.add(`google:${calendarId}`);
        }
      }
      if (calendarSettings && typeof calendarSettings.save === "function") {
        const blocks = loadedBlocks();
        const eventByRemote = new Map(
          events.map((event) => [`${event.calendarId}:${event.remoteId}`, event]),
        );
        const previousConflicts = new Map(
          list("conflicts").map((conflict) => [conflict?.id, conflict]),
        );
        const nextLinks = [];
        const nextConflicts = list("conflicts").filter(
          (conflict) => !readCalendarIds.has(conflict?.calendarId),
        );
        const keep = (link, key) => {
          nextLinks.push(link);
          if (previousConflicts.has(key)) nextConflicts.push(previousConflicts.get(key));
        };
        let lookups = 0;
        for (const link of list("links")) {
          const key = `${link?.calendarId}:${link?.remoteId}`;
          if (!readCalendarIds.has(link?.calendarId)) {
            nextLinks.push(link);
            continue;
          }
          let event = eventByRemote.get(key);
          const linkStart = toInstant(link.remoteStartsAt);
          const linkEnd = toInstant(link.remoteEndsAt);
          let deleted = event?.cancelled === true;
          // Um evento de outra semana simplesmente não vem. Um evento que deveria estar nesta janela e não veio
          // pode ter sido apagado ou movido, e só a busca pelo id decide. Sem resposta, nada muda.
          if (
            !event &&
            blocks !== null &&
            linkStart &&
            linkEnd &&
            linkStart < end &&
            linkEnd > start &&
            lookups < MAX_LOOKUPS_PER_READ
          ) {
            lookups += 1;
            const found = await lookupEvent(link);
            if (found === null || found?.cancelled === true) deleted = true;
            else if (found) event = found;
          }
          if (blocks === null || (!event && !deleted)) {
            keep(link, key);
            continue;
          }
          const local = blocks.find((block) => block?.id === link.localId);
          const localChanged = Boolean(local) && blockFingerprint(local) !== link.localFingerprint;
          if (deleted) {
            // Mesmo sem alteração local, a exclusão remota precisa ser explícita: “Manter Hibi”
            // recria o evento e “Manter calendário” remove o vínculo sem apagar o bloco local.
            if (local) {
              nextLinks.push(link);
              nextConflicts.push({
                id: key,
                calendarId: link.calendarId,
                kind: "remote-deleted",
                summary: summaryFor(local),
              });
            }
            continue;
          }
          const refreshed = { ...link, ...remoteWindow(event.startsAt, event.endsAt) };
          const revisionChanged =
            boundedText(event.revision) &&
            boundedText(link.remoteRevision) &&
            event.revision !== link.remoteRevision;
          if (revisionChanged && localChanged) {
            nextLinks.push(refreshed);
            nextConflicts.push({
              id: key,
              calendarId: link.calendarId,
              kind: "concurrent-update",
              summary: summaryFor(local),
              remoteRevision: event.revision,
            });
          } else
            nextLinks.push(
              revisionChanged ? { ...refreshed, remoteRevision: event.revision } : refreshed,
            );
        }
        const syncedAt = now();
        const sources = new Map(list("sources").map((source) => [source?.id, source]));
        for (const id of readCalendarIds)
          sources.set(id.split(":")[0], { id: id.split(":")[0], lastSyncedAt: syncedAt });
        saveState({
          links: nextLinks,
          conflicts: nextConflicts.slice(0, MAX_CONFLICTS),
          sources: [...sources.values()],
        });
      }
      return events;
    },
  };
}

module.exports = { blockFingerprint, createCalendarSyncService };
