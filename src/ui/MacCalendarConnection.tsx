import React, { useEffect, useState } from "react";
import type { CalendarSyncSource } from "./calendar-sync";
import { CalendarSyncPanel } from "./CalendarSyncPanel";
import type { CalendarSyncState } from "./calendar-sync";
import type { ScheduleBlock } from "../domain/models";

type Props = Readonly<{
  onEvent: (action: string, detail: string, result?: string) => void;
  blocks?: readonly ScheduleBlock[];
}>;

const fallback: CalendarSyncSource = {
  id: "apple",
  provider: "apple",
  label: "Calendário do Mac",
  state: "needs-permission",
};

export function MacCalendarConnection({ onEvent, blocks = [] }: Props) {
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
  const [selectedBlockId, setSelectedBlockId] = useState(blocks[0]?.id ?? "");
  const [selectedCalendarId, setSelectedCalendarId] = useState("");
  const [notice, setNotice] = useState(
    "O acesso ao Calendário nunca é solicitado silenciosamente.",
  );
  const refresh = async () => {
    const state = await window.hibiDesktop?.getCalendarSyncState?.();
    const next = state?.sources.find((entry) => entry.provider === "apple");
    if (next) setSource(next);
    if (state) setSyncState(state);
  };
  useEffect(() => {
    void refresh().catch(() => undefined);
  }, []);
  const requestAccess = async () => {
    if (!window.hibiDesktop?.requestAppleCalendarAccess) {
      setNotice("Disponível no app Hibi para macOS.");
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
        setNotice("O vínculo foi removido. O bloco Hibi permanece local.");
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
      setNotice("O evento foi atualizado com a versão do Hibi.");
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
            .then(setSyncState)
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
            Envie uma demanda do Hibi para um calendário bidirecional somente
            após confirmar.
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select
            aria-label="Bloco Hibi para publicar"
            value={selectedBlockId}
            onChange={(event) => setSelectedBlockId(event.target.value)}
            disabled={blocks.length === 0}
          >
            {blocks.length === 0 ? (
              <option value="">Sem blocos no calendário Hibi</option>
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
