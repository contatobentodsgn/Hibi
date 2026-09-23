import React, { useEffect, useState } from "react";
import type { CalendarSyncSource } from "./calendar-sync";
import { CalendarSyncPanel } from "./CalendarSyncPanel";
import { labelCalendarSources, type CalendarSyncState } from "./calendar-sync";
import type { ScheduleBlock } from "../domain/models";

type Props = Readonly<{
  onEvent: (action: string, detail: string, result?: string) => void;
  blocks?: readonly ScheduleBlock[];
  onMoveBlock?: (id: string, start: string, end: string) => boolean;
}>;

type CalendarChanges = Readonly<{
  outgoing: readonly Readonly<{ localId: string; calendarId: string; summary: string }>[];
  incoming: readonly Readonly<{ localId: string; calendarId: string; summary: string; start: string; end: string }>[];
}>;
const NO_CHANGES: CalendarChanges = { outgoing: [], incoming: [] };
const DAY_MS = 24 * 60 * 60 * 1_000;
const pad = (value: number) => String(value).padStart(2, "0");
const floating = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T00:00:00`;
const when = (start: string, end: string) => `${start.slice(8, 10)}/${start.slice(5, 7)} ${start.slice(11, 16)}–${end.slice(11, 16)}`;

const fallback: CalendarSyncSource = {
  id: "apple",
  provider: "apple",
  label: "Calendário do Mac",
  state: "needs-permission",
};

export function MacCalendarConnection({ onEvent, blocks = [], onMoveBlock }: Props) {
  const [source, setSource] = useState<CalendarSyncSource>(fallback);
  const [busy, setBusy] = useState(false);
  const [syncState, setSyncState] = useState<CalendarSyncState>({
    sources: [],
    calendars: [],
    conflicts: [],
  });
  const [pendingResolution, setPendingResolution] = useState<{
    id: string;
    confirmationId: string;
    summary: string;
  } | null>(null);
  const [changes, setChanges] = useState<CalendarChanges>(NO_CHANGES);
  const [selectedBlockId, setSelectedBlockId] = useState(blocks[0]?.id ?? "");
  const [selectedCalendarId, setSelectedCalendarId] = useState("");
  const [notice, setNotice] = useState(
    "O acesso ao Calendário nunca é solicitado silenciosamente.",
  );
  const refresh = async () => {
    const snapshot = await window.hibiDesktop?.getCalendarSyncState?.();
    const state = snapshot ? labelCalendarSources(snapshot) : undefined;
    const next = state?.sources.find((entry) => entry.provider === "apple");
    if (next) setSource(next);
    if (state) setSyncState(state);
    if (state) await refreshChanges(state);
  };
  // Ler os calendários bidirecionais atualiza, no processo principal, o horário que cada evento vinculado tem
  // agora. Só depois disso a lista sabe o que mudou do lado de lá. Sem acesso, a lista sai do que já se sabe.
  const refreshChanges = async (state: CalendarSyncState) => {
    const bridge = window.hibiDesktop;
    if (!bridge?.listCalendarSyncChanges) return;
    const calendars = state.calendars
      .filter((calendar) => calendar.mode === "bidirectional")
      .map((calendar) => ({ sourceId: calendar.sourceId as "apple" | "google", id: calendar.id }));
    if (calendars.length > 0 && bridge.readCalendarSyncEvents) {
      const now = Date.now();
      await bridge
        .readCalendarSyncEvents({ start: floating(new Date(now - 30 * DAY_MS)), end: floating(new Date(now + 180 * DAY_MS)), calendars })
        .catch(() => undefined);
    }
    setChanges(await bridge.listCalendarSyncChanges());
  };
  const sendChange = async (change: CalendarChanges["outgoing"][number]) => {
    const block = blocks.find((entry) => entry.id === change.localId);
    if (!block || !window.hibiDesktop?.prepareCalendarUpdate) return;
    try {
      const action = await window.hibiDesktop.prepareCalendarUpdate({
        calendarId: change.calendarId,
        block: { id: block.id, title: block.title, startsAt: block.start, endsAt: block.end, allDay: false },
      });
      setPendingResolution({ id: action.id, confirmationId: action.confirmationId, summary: action.summary });
      setNotice(`Revise a atualização de “${action.summary}” antes de enviar.`);
    } catch {
      setNotice("Não foi possível preparar a atualização do evento.");
      onEvent("calendar-update", change.summary, "fail");
    }
  };
  const bringChange = async (change: CalendarChanges["incoming"][number]) => {
    const block = blocks.find((entry) => entry.id === change.localId);
    if (!block || !onMoveBlock || !window.hibiDesktop?.acknowledgeCalendarIncoming) return;
    if (!onMoveBlock(block.id, change.start, change.end)) {
      setNotice(`“${change.summary}” não pôde ser movido no Pixano: o horário que veio do calendário não é válido.`);
      return;
    }
    try {
      await window.hibiDesktop.acknowledgeCalendarIncoming({
        calendarId: change.calendarId,
        block: { id: block.id, title: block.title, startsAt: change.start, endsAt: change.end, allDay: false },
      });
      // A lista do processo principal só vê o bloco movido quando o workspace chega lá; até lá ela o daria
      // como editado aqui. O item sai da lista, e a próxima leitura já vem certa.
      setChanges((current) => ({ ...current, incoming: current.incoming.filter((entry) => entry !== change) }));
      setNotice(`“${change.summary}” agora está em ${when(change.start, change.end)} no Pixano, como no calendário.`);
      onEvent("calendar-incoming", change.summary, "pass");
    } catch {
      setNotice("O bloco foi movido, mas o vínculo não foi atualizado. Sincronize de novo.");
      onEvent("calendar-incoming", change.summary, "fail");
    }
  };
  useEffect(() => {
    void refresh().catch(() => undefined);
  }, []);
  const requestAccess = async () => {
    if (!window.hibiDesktop?.requestAppleCalendarAccess) {
      setNotice("Disponível no app Pixano para macOS.");
      return;
    }
    setBusy(true);
    try {
      await window.hibiDesktop.requestAppleCalendarAccess();
      await refresh();
      setNotice(
        "Acesso ao Calendário concedido. Seus calendários podem ser selecionados abaixo.",
      );
      onEvent("calendar-permission", "Apple Calendar", "pass");
    } catch {
      setNotice(
        "O acesso completo ao Calendário não foi concedido. Você pode permitir em Ajustes do Sistema.",
      );
      onEvent("calendar-permission", "Apple Calendar", "fail");
    } finally {
      setBusy(false);
    }
  };
  const connected = source.state === "connected";
  const connectSource = async (source: CalendarSyncSource) => {
    if (source.provider === "apple") {
      await requestAccess();
      return;
    }
    if (!window.hibiDesktop?.authorizeIntegration) {
      setNotice("A conexão Google está disponível no app desktop.");
      return;
    }
    try {
      await window.hibiDesktop.authorizeIntegration("google-calendar");
      await refresh();
      setNotice("Google Calendar conectado.");
    } catch {
      setNotice("Não foi possível conectar o Google Calendar.");
    }
  };
  const resolveConflict = async (
    conflict: CalendarSyncState["conflicts"][number],
    choice: "keep-calendar" | "keep-hibi",
  ) => {
    try {
      const result = await window.hibiDesktop?.resolveCalendarConflict?.({
        id: conflict.id,
        choice,
      });
      if (!result) {
        setNotice("A resolução de conflitos está disponível no app desktop.");
        return;
      }
      if (result.resolved) {
        await refresh();
        setNotice("O vínculo foi removido. O bloco Pixano permanece local.");
        onEvent("calendar-conflict", conflict.summary, "keep-calendar");
        return;
      }
      setPendingResolution({
        id: result.action.id,
        confirmationId: result.action.confirmationId,
        summary: result.action.summary,
      });
      setNotice(
        `Revise a atualização de “${result.action.summary}” antes de enviar.`,
      );
    } catch {
      setNotice("Não foi possível preparar a resolução do conflito.");
      onEvent("calendar-conflict", conflict.summary, "fail");
    }
  };
  const confirmResolution = async () => {
    if (
      !pendingResolution ||
      !window.hibiDesktop?.executeApprovedCalendarPublish
    )
      return;
    try {
      await window.hibiDesktop.executeApprovedCalendarPublish({
        actionId: pendingResolution.id,
        confirmationId: pendingResolution.confirmationId,
      });
      setPendingResolution(null);
      await refresh();
      setNotice("O evento foi atualizado com a versão do Pixano.");
      onEvent("calendar-conflict", "keep-hibi", "pass");
    } catch {
      setNotice(
        "Não foi possível atualizar o evento. O conflito continua pendente.",
      );
      onEvent("calendar-conflict", "keep-hibi", "fail");
    }
  };
  const destinations = syncState.calendars.filter(
    (calendar) => calendar.mode === "bidirectional",
  );
  const preparePublication = async () => {
    const block = blocks.find((entry) => entry.id === selectedBlockId);
    const calendarId = selectedCalendarId || destinations[0]?.id;
    if (!block || !calendarId || !window.hibiDesktop?.prepareCalendarPublish) {
      setNotice(
        "Escolha um bloco e um calendário bidirecional antes de continuar.",
      );
      return;
    }
    try {
      const action = await window.hibiDesktop.prepareCalendarPublish({
        calendarId,
        block: {
          id: block.id,
          title: block.title,
          startsAt: block.start,
          endsAt: block.end,
          allDay: false,
        },
      });
      setPendingResolution({
        id: action.id,
        confirmationId: action.confirmationId,
        summary: action.summary,
      });
      setNotice(`Revise a publicação de “${action.summary}” antes de enviar.`);
    } catch {
      setNotice("Não foi possível preparar a publicação do bloco.");
      onEvent("calendar-publish", block.title, "fail");
    }
  };
  return (
    <div className="connector-block" aria-label="Calendário do Mac">
      <div className="setting-row">
        <div>
          <strong>Calendário do Mac</strong>
          <span>
            {connected
              ? "Conectado · eventos e calendários disponíveis para leitura"
              : "Permissão completa necessária para ler reuniões do Apple Calendar e iCloud."}
          </span>
        </div>
        {connected ? (
          <span className="muted">Conectado</span>
        ) : (
          <button
            className="primary"
            disabled={busy}
            onClick={() => void requestAccess()}
          >
            {busy ? "Aguardando permissão…" : "Permitir Calendário"}
          </button>
        )}
      </div>
      <p className="muted" role="status">
        {notice}
      </p>
      <CalendarSyncPanel
        state={syncState}
        onConnect={(entry) => {
          void connectSource(entry);
        }}
        onChangeMode={(calendar, mode) => {
          void window.hibiDesktop
            ?.saveCalendarSyncMode?.({ id: calendar.id, mode })
            .then((snapshot) => setSyncState(labelCalendarSources(snapshot)))
            .catch(() =>
              setNotice("Não foi possível salvar o modo do calendário."),
            );
        }}
        onSync={() => {
          void refresh().catch(() =>
            setNotice("Não foi possível atualizar os calendários."),
          );
        }}
        onResolveConflict={(conflict, choice) => {
          void resolveConflict(conflict, choice);
        }}
      />
      <div className="setting-row" aria-label="Publicar bloco no calendário">
        <div>
          <strong>Publicar bloco</strong>
          <span>
            Envie um bloco do Pixano para um calendário bidirecional somente
            após confirmar.
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select
            aria-label="Bloco Pixano para publicar"
            value={selectedBlockId}
            onChange={(event) => setSelectedBlockId(event.target.value)}
            disabled={blocks.length === 0}
          >
            {blocks.length === 0 ? (
              <option value="">Sem blocos no calendário do Pixano</option>
            ) : (
              blocks.map((block) => (
                <option key={block.id} value={block.id}>
                  {block.title}
                </option>
              ))
            )}
          </select>
          <select
            aria-label="Calendário de destino"
            value={selectedCalendarId}
            onChange={(event) => setSelectedCalendarId(event.target.value)}
            disabled={destinations.length === 0}
          >
            {destinations.length === 0 ? (
              <option value="">Selecione um calendário bidirecional</option>
            ) : (
              destinations.map((calendar) => (
                <option key={calendar.id} value={calendar.id}>
                  {calendar.label}
                </option>
              ))
            )}
          </select>
          <button
            className="outline"
            disabled={blocks.length === 0 || destinations.length === 0}
            onClick={() => void preparePublication()}
          >
            Preparar confirmação
          </button>
        </div>
      </div>
      {(changes.outgoing.length > 0 || changes.incoming.length > 0) && (
        <div className="setting-row" aria-label="Alterações entre o Pixano e o calendário" style={{ alignItems: "flex-start" }}>
          <div>
            <strong>Alterações para sincronizar</strong>
            <span>O que mudou de um lado só desde a última sincronização. Nada é enviado nem movido sem o seu clique.</span>
            <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
              {changes.outgoing.map((change) => (
                <li key={`out-${change.calendarId}-${change.localId}`}>
                  “{change.summary}” mudou no Pixano.{" "}
                  <button className="outline" onClick={() => void sendChange(change)}>Enviar ao calendário</button>
                </li>
              ))}
              {changes.incoming.map((change) => (
                <li key={`in-${change.calendarId}-${change.localId}`}>
                  “{change.summary}” foi para {when(change.start, change.end)} no calendário.{" "}
                  <button className="outline" disabled={!onMoveBlock} onClick={() => void bringChange(change)}>Trazer para o Pixano</button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {pendingResolution && (
        <div className="setting-row" role="alert">
          <div>
            <strong>Confirmar atualização</strong>
            <span>
              “{pendingResolution.summary}” será enviado para o calendário
              conectado.
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="outline"
              onClick={() => {
                setPendingResolution(null);
                setNotice("Atualização cancelada.");
              }}
            >
              Cancelar
            </button>
            <button
              className="primary"
              onClick={() => void confirmResolution()}
            >
              Confirmar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
