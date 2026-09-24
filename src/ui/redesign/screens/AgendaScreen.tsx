import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Plus,
} from "lucide-react";
import { Button, Card } from "@heroui/react";
import type { ScheduleBlock, StudyData } from "../../../domain/models";
import { shiftDayKey, localNoon, todayKey } from "../../../domain/date-context";
import { durationMinutes, toDateKey } from "../../../domain/schedule";
import { readIcsCalendar, toIcsCalendar } from "../../../domain/ics";
import { commitmentClashes } from "../../../domain/conflicts";
import { visibleHours } from "../../calendar-grid";
import { AgendaAvailability } from "../../AgendaAvailability";
import { ConflictSummary } from "../../ConflictSummary";
import {
  labelCalendarSources,
  type CalendarSyncState,
} from "../../calendar-sync";
import {
  externalEventsForWeek,
  type ExternalCalendarEvent,
  type ReadonlyAgendaEvent,
} from "../../external-calendar-events";
import { PixanoEmptyState } from "../components/PixanoEmptyState";
import { ContextualGuidance } from "../components/ContextualGuidance";
import { PixanoTag } from "../components/PixanoTag";
import { PixanoUiRoot } from "../components/PixanoUiRoot";
import { SectionHeader } from "../components/SectionHeader";
import { ExternalCalendarPanel } from "./ExternalCalendarPanel";
import { useLocale, useT } from "../../../i18n/LocaleProvider";
import "./agenda-screen.css";

export type AgendaDisplayMode = "day" | "week";
type AgendaLayer = "schedule" | "important" | "wellbeing";
type Props = Readonly<{
  data: StudyData;
  mode: AgendaDisplayMode;
  date?: string;
  onModeChange: (mode: AgendaDisplayMode) => void;
  onDateChange?: (date: string) => void;
  onEvent: (action: string, detail: string, result?: string) => void;
  onCreateBlock: (input: Omit<ScheduleBlock, "id">) => void;
  onDeleteBlock?: (id: string) => void;
  onMoveBlock?: (id: string, start: string, end: string) => boolean;
}>;

type CalendarChanges = Readonly<{
  outgoing: readonly Readonly<{
    localId: string;
    calendarId: string;
    summary: string;
  }>[];
  incoming: readonly Readonly<{
    localId: string;
    calendarId: string;
    summary: string;
    start: string;
    end: string;
  }>[];
}>;
type PendingCalendarAction = Readonly<{
  id: string;
  confirmationId: string;
  summary: string;
}>;
const EMPTY_CALENDAR_STATE: CalendarSyncState = {
  sources: [],
  calendars: [],
  conflicts: [],
};
const EMPTY_CALENDAR_CHANGES: CalendarChanges = { outgoing: [], incoming: [] };

const categoryTone: Record<
  ScheduleBlock["category"],
  "mint" | "peach" | "lavender" | "neutral"
> = {
  work: "lavender",
  learning: "mint",
  break: "mint",
  important: "peach",
  wellbeing: "mint",
};

function weekDays(start: string) {
  return Array.from({ length: 7 }, (_, index) => shiftDayKey(start, index));
}
function dateLabel(date: string, locale: "pt" | "en") {
  return localNoon(date).toLocaleDateString(
    locale === "pt" ? "pt-BR" : "en-US",
    { weekday: "long", day: "numeric", month: "long" },
  );
}
function hourTime(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}
function periodLabel(
  mode: AgendaDisplayMode,
  date: string,
  locale: "pt" | "en",
) {
  if (mode === "day") return dateLabel(date, locale);
  const days = weekDays(date);
  const connector = locale === "pt" ? " de " : " – ";
  return `${days[0].slice(8, 10)}–${days[6].slice(8, 10)}${connector}${localNoon(days[0]).toLocaleDateString(locale === "pt" ? "pt-BR" : "en-US", { month: "long" })}`;
}

export function AgendaScreen({
  data,
  mode,
  date: initialDate,
  onModeChange,
  onDateChange,
  onEvent,
  onCreateBlock,
  onDeleteBlock,
  onMoveBlock,
}: Props) {
  const t = useT();
  const { language } = useLocale();
  const dayNames = [
    "agenda.weekday.sun",
    "agenda.weekday.mon",
    "agenda.weekday.tue",
    "agenda.weekday.wed",
    "agenda.weekday.thu",
    "agenda.weekday.fri",
    "agenda.weekday.sat",
  ] as const;
  const categoryName = (category: ScheduleBlock["category"]) =>
    t(`agenda.category.${category}` as const);
  const [date, setDate] = useState(initialDate ?? todayKey());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState("");
  const [showAllHours, setShowAllHours] = useState(false);
  const [showConflicts, setShowConflicts] = useState(mode === "week");
  const [layer, setLayer] = useState<AgendaLayer>("schedule");
  const [calendarState, setCalendarState] =
    useState<CalendarSyncState>(EMPTY_CALENDAR_STATE);
  const [externalEvents, setExternalEvents] = useState<
    readonly ReadonlyAgendaEvent[]
  >([]);
  const [calendarChanges, setCalendarChanges] = useState<CalendarChanges>(
    EMPTY_CALENDAR_CHANGES,
  );
  const [pendingCalendarAction, setPendingCalendarAction] =
    useState<PendingCalendarAction | null>(null);
  const [calendarNotice, setCalendarNotice] = useState("");
  const visibleDays = mode === "day" ? [date] : weekDays(date);
  const periodBlocks = useMemo(
    () =>
      data.blocks.filter((block) =>
        visibleDays.includes(toDateKey(block.start)),
      ),
    [data.blocks, visibleDays.join("|")],
  );
  const blocks = useMemo(
    () =>
      periodBlocks.filter(
        (block) =>
          layer === "schedule" ||
          (layer === "important"
            ? block.isHard === true
            : block.category === "break"),
      ),
    [periodBlocks, layer],
  );
  const hours = visibleHours(blocks, showAllHours);
  const selected = data.blocks.find((block) => block.id === selectedId);
  const movePeriod = (amount: number) => {
    const next = shiftDayKey(date, mode === "week" ? amount * 7 : amount);
    setDate(next);
    onDateChange?.(next);
    onEvent(
      "navigation",
      amount < 0 ? `Agenda anterior · ${mode}` : `Agenda seguinte · ${mode}`,
    );
  };
  const createAt = (day: string, hour: number) => {
    onCreateBlock({
      title: t("agenda.newBlock"),
      start: `${day}T${hourTime(hour)}:00`,
      end: `${day}T${hourTime(Math.min(hour + 1, 23))}:00`,
      category: "work",
    });
    onEvent("create", `Bloco · ${day} ${hourTime(hour)}`);
  };
  const editSelected = (start: string, end: string) => {
    if (!selected || !onMoveBlock) return;
    if (onMoveBlock(selected.id, start, end)) setSelectedId(null);
  };
  const importIcs = async (file: File) => {
    const parsed = readIcsCalendar(await file.text());
    for (const event of parsed.events)
      onCreateBlock({ ...event, category: "work" });
    setImportNotice(
      `Eventos importados: ${parsed.events.length}. ${parsed.skippedAllDay ? `Ficaram de fora ${parsed.skippedAllDay} de dia inteiro.` : ""} ${parsed.skippedInvalid ? `Ficaram de fora ${parsed.skippedInvalid} inválidos.` : ""}`.trim(),
    );
    onEvent("import", file.name, `${parsed.events.length} imported`);
  };
  const exportIcs = () => {
    const url = URL.createObjectURL(
      new Blob([toIcsCalendar(data.blocks)], { type: "text/calendar" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "pixano-calendar.ics";
    link.click();
    URL.revokeObjectURL(url);
    onEvent("export", t("agenda.exported"), "pass");
  };

  const refreshExternalCalendar = async () => {
    const bridge = window.pixanoDesktop;
    if (!bridge?.getCalendarSyncState) return;
    try {
      const snapshot = await bridge.getCalendarSyncState();
      const nextState = labelCalendarSources(snapshot);
      setCalendarState(nextState);
      const calendars = nextState.calendars
        .filter((calendar) => calendar.mode !== "disabled")
        .map((calendar) => ({
          sourceId: calendar.sourceId as "apple" | "google",
          id: calendar.id,
        }));
      if (bridge.readCalendarSyncEvents && calendars.length > 0) {
        const start = visibleDays[0]!;
        const end = shiftDayKey(visibleDays[visibleDays.length - 1]!, 1);
        const events = await bridge.readCalendarSyncEvents({
          start: `${start}T00:00:00`,
          end: `${end}T00:00:00`,
          calendars,
        });
        setExternalEvents(
          externalEventsForWeek(
            start,
            events as readonly ExternalCalendarEvent[],
          ).filter((event) => visibleDays.includes(event.date)),
        );
      } else setExternalEvents([]);
      setCalendarChanges(
        (await bridge.listCalendarSyncChanges?.()) ?? EMPTY_CALENDAR_CHANGES,
      );
    } catch {
      setCalendarNotice(t("agenda.calendarRefreshFailed"));
    }
  };
  useEffect(() => {
    void refreshExternalCalendar();
  }, [mode, date]);
  useEffect(() => {
    if (mode === "week") setShowConflicts(true);
  }, [mode]);
  const queueCalendarAction = (action: PendingCalendarAction) => {
    setPendingCalendarAction(action);
    setCalendarNotice(`Revise “${action.summary}” antes de enviar.`);
  };
  const sendCalendarChange = async (
    change: CalendarChanges["outgoing"][number],
  ) => {
    const block = data.blocks.find((item) => item.id === change.localId);
    const bridge = window.pixanoDesktop;
    if (!block || !bridge?.prepareCalendarUpdate) return;
    try {
      queueCalendarAction(
        await bridge.prepareCalendarUpdate({
          calendarId: change.calendarId,
          block: {
            id: block.id,
            title: block.title,
            startsAt: block.start,
            endsAt: block.end,
            allDay: false,
          },
        }),
      );
    } catch {
      setCalendarNotice(t("agenda.calendarPrepareFailed"));
    }
  };
  const bringCalendarChange = async (
    change: CalendarChanges["incoming"][number],
  ) => {
    const block = data.blocks.find((item) => item.id === change.localId);
    const bridge = window.pixanoDesktop;
    if (!block || !onMoveBlock || !bridge?.acknowledgeCalendarIncoming) return;
    if (!onMoveBlock(block.id, change.start, change.end)) {
      setCalendarNotice(t("agenda.invalidIncomingTime"));
      return;
    }
    try {
      setCalendarChanges(
        await bridge.acknowledgeCalendarIncoming({
          calendarId: change.calendarId,
          block: {
            id: block.id,
            title: block.title,
            startsAt: change.start,
            endsAt: change.end,
            allDay: false,
          },
        }),
      );
      setCalendarNotice(`“${change.summary}” foi trazido para o Pixano.`);
    } catch {
      setCalendarNotice(t("agenda.calendarUpdateFailed"));
    }
  };
  const resolveCalendarConflict = async (
    conflict: CalendarSyncState["conflicts"][number],
    choice: "keep-calendar" | "keep-hibi",
  ) => {
    const bridge = window.pixanoDesktop;
    if (!bridge?.resolveCalendarConflict) return;
    try {
      const result = await bridge.resolveCalendarConflict({
        id: conflict.id,
        choice,
      });
      if (result.resolved) {
        setCalendarNotice(t("agenda.externalRemoved"));
        await refreshExternalCalendar();
      } else queueCalendarAction(result.action);
    } catch {
      setCalendarNotice(t("agenda.conflictResolveFailed"));
    }
  };
  const confirmCalendarAction = async () => {
    const pending = pendingCalendarAction;
    const bridge = window.pixanoDesktop;
    if (!pending || !bridge?.executeApprovedCalendarPublish) return;
    try {
      await bridge.executeApprovedCalendarPublish({
        actionId: pending.id,
        confirmationId: pending.confirmationId,
      });
      setPendingCalendarAction(null);
      setCalendarNotice(`“${pending.summary}” foi atualizado no calendário.`);
      await refreshExternalCalendar();
    } catch {
      setCalendarNotice(t("agenda.calendarSendFailed"));
    }
  };

  return (
    <PixanoUiRoot className="agenda-screen">
      <SectionHeader
        title={t("agenda.title")}
        subtitle={periodLabel(mode, date, language)}
        actions={
          <Button variant="primary" onPress={() => createAt(date, 9)}>
            <Plus size={17} />
            {t("agenda.createBlock")}
          </Button>
        }
      />
      <div className="agenda-screen__toolbar">
        <Button
          isIconOnly
          variant="ghost"
          aria-label={t(
            mode === "day" ? "agenda.previousDay" : "agenda.previousWeek",
          )}
          onPress={() => movePeriod(-1)}
        >
          <ChevronLeft size={18} />
        </Button>
        <Button
          variant="secondary"
          onPress={() => {
            const today = todayKey();
            setDate(today);
            onDateChange?.(today);
            onEvent("navigation", `Agenda · ${t("agenda.today")}`);
          }}
        >
          {t("agenda.today")}
        </Button>
        <Button
          isIconOnly
          variant="ghost"
          aria-label={t(mode === "day" ? "agenda.nextDay" : "agenda.nextWeek")}
          onPress={() => movePeriod(1)}
        >
          <ChevronRight size={18} />
        </Button>
        <div
          className="agenda-screen__modes"
          role="tablist"
          aria-label={t("agenda.mode")}
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "day"}
            onClick={() => onModeChange("day")}
          >
            {t("agenda.day")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "week"}
            onClick={() => onModeChange("week")}
          >
            {t("agenda.week")}
          </button>
        </div>
        <div className="agenda-screen__layers" aria-label={t("agenda.filters")}>
          {[
            ["schedule", t("agenda.title")],
            ["important", t("agenda.important")],
            ["wellbeing", t("agenda.wellbeing")] as const,
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={layer === value}
              onClick={() => {
                setLayer(value as AgendaLayer);
                onEvent("filter", `Agenda · ${label}`);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {mode === "day" && (
          <>
            <Button
              variant="secondary"
              onPress={() => setShowAllHours((value) => !value)}
            >
              {t("agenda.allHours")}
            </Button>
            <Button variant="secondary" onPress={() => setShowConflicts(true)}>
              {t("agenda.checkPlan")}
            </Button>
          </>
        )}
        <label className="agenda-screen__ics-import">
          <span>{t("agenda.import")}</span>
          <input
            hidden
            type="file"
            accept=".ics,text/calendar"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importIcs(file);
            }}
          />
        </label>
        <Button variant="secondary" onPress={exportIcs}>
          {t("agenda.export")}
        </Button>
      </div>
      {importNotice && (
        <p role="status" className="agenda-screen__import-notice">
          {importNotice}
        </p>
      )}
      {periodBlocks.length > 0 && !periodBlocks.some((block) => block.category === "break" || block.category === "wellbeing") && <ContextualGuidance
        id="agenda.plan-break"
        title={t("contextual.agenda.break.title")}
        description={t("contextual.agenda.break.detail")}
        actionLabel={t("contextual.agenda.break.action")}
        onAction={() => { setLayer("wellbeing"); setShowAllHours(true); onEvent("filter", "Agenda · Bem-estar"); }}
      />}
      <AgendaAvailability blocks={periodBlocks} days={visibleDays} />
      <div className="agenda-screen__body">
        <Card className="agenda-screen__grid-card">
          <div className={`agenda-screen__grid agenda-screen__grid--${mode}`}>
            <div className="agenda-screen__corner">
              <Clock3 size={14} />
            </div>
            {visibleDays.map((day) => (
              <div className="agenda-screen__day-head" key={day}>
                <span>{t(dayNames[localNoon(day).getDay()])}</span>
                <strong>{day.slice(8, 10)}</strong>
              </div>
            ))}
            {hours.map((hour) => (
              <div className="agenda-screen__row" key={hour}>
                <time>{hourTime(hour)}</time>
                {visibleDays.map((day) => {
                  const hourBlocks = blocks.filter(
                    (block) =>
                      toDateKey(block.start) === day &&
                      Number(block.start.slice(11, 13)) === hour,
                  );
                  return (
                    <div
                      className="agenda-screen__slot"
                      key={`${day}-${hour}`}
                      role="button"
                      tabIndex={0}
                      aria-label={t("agenda.addBlock")
                        .replace("{day}", day)
                        .replace("{time}", hourTime(hour))}
                      onClick={() => createAt(day, hour)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          createAt(day, hour);
                        }
                      }}
                    >
                      <span
                        className="agenda-screen__slot-create"
                        aria-hidden="true"
                      >
                        +
                      </span>
                      {hourBlocks.map((block) => (
                        <button
                          className="agenda-screen__event"
                          data-category={block.category}
                          key={block.id}
                          onClick={(event) => {
                            event.stopPropagation();
                            onDeleteBlock?.(block.id);
                          }}
                          aria-label={t("agenda.deleteBlock")
                            .replace("{title}", block.title)
                            .replace("{time}", block.start.slice(11, 16))
                            .replace("{day}", day)}
                        >
                          <strong>{block.title}</strong>
                          <span>
                            {block.start.slice(11, 16)} ·{" "}
                            {durationMinutes(block)} min
                          </span>
                          <PixanoTag tone={categoryTone[block.category]}>
                            {categoryName(block.category)}
                          </PixanoTag>
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          {blocks.length === 0 && (
            <PixanoEmptyState
              icon={CalendarDays}
              tone="lavender"
              title={t("agenda.emptyTitle")}
              description={t("agenda.emptyDetail")}
              action={
                <Button variant="secondary" onPress={() => createAt(date, 9)}>
                  {t("agenda.createBlock")}
                </Button>
              }
            />
          )}
        </Card>
        <aside
          className="agenda-screen__detail"
          aria-label={t("agenda.detail")}
        >
          {selected ? (
            <BlockDetails
              block={selected}
              onClose={() => setSelectedId(null)}
              onDelete={() => {
                onDeleteBlock?.(selected.id);
                setSelectedId(null);
              }}
              onSave={editSelected}
            />
          ) : (
            <Card>
              <CalendarDays size={20} />
              <h2>{t("agenda.timeOverview")}</h2>
              <p>{t("agenda.timeOverviewDetail")}</p>
            </Card>
          )}
        </aside>
      </div>
      <ExternalCalendarPanel
        state={calendarState}
        events={externalEvents}
        changes={calendarChanges}
        onRefresh={() => void refreshExternalCalendar()}
        onSendChange={(change) => void sendCalendarChange(change)}
        onBringChange={(change) => void bringCalendarChange(change)}
        onResolveConflict={(conflict, choice) =>
          void resolveCalendarConflict(conflict, choice)
        }
      />
      {calendarNotice && (
        <p className="agenda-screen__calendar-notice" role="status">
          {calendarNotice}
        </p>
      )}
      {pendingCalendarAction && (
        <Card className="agenda-screen__calendar-confirmation" role="alert">
          <div>
            <strong>{t("agenda.externalConfirm")}</strong>
            <p>
              {t("agenda.externalDescription").replace(
                "{summary}",
                pendingCalendarAction.summary,
              )}
            </p>
          </div>
          <div>
            <Button
              variant="secondary"
              onPress={() => {
                setPendingCalendarAction(null);
                setCalendarNotice(t("agenda.cancel"));
              }}
            >
              {t("agenda.cancel")}
            </Button>
            <Button
              variant="primary"
              onPress={() => void confirmCalendarAction()}
            >
              {t("agenda.confirm")}
            </Button>
          </div>
        </Card>
      )}
      {showConflicts && (
        <ConflictSummary
          pairs={commitmentClashes(periodBlocks)}
          emptyText={
            mode === "week"
              ? t("agenda.conflict.noneWeek")
              : t("agenda.conflict.noneDay")
          }
        />
      )}
    </PixanoUiRoot>
  );
}

function BlockDetails({
  block,
  onClose,
  onDelete,
  onSave,
}: Readonly<{
  block: ScheduleBlock;
  onClose: () => void;
  onDelete: () => void;
  onSave: (start: string, end: string) => void;
}>) {
  const [start, setStart] = useState(block.start.slice(0, 16));
  const [end, setEnd] = useState(block.end.slice(0, 16));
  const t = useT();
  const { language } = useLocale();
  const categoryKey = `agenda.category.${block.category}` as const;
  return (
    <Card>
      <div className="agenda-screen__detail-title">
        <PixanoTag tone={categoryTone[block.category]}>{t(categoryKey)}</PixanoTag>
        <Button
          isIconOnly
          variant="ghost"
          aria-label={t("agenda.closeDetail")}
          onPress={onClose}
        >
          ×
        </Button>
      </div>
      <h2>{block.title}</h2>
      <p>{dateLabel(block.start.slice(0, 10), language)}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave(`${start}:00`, `${end}:00`);
        }}
      >
        <label>
          {t("agenda.start")}
          <input
            type="datetime-local"
            value={start}
            onChange={(event) => setStart(event.target.value)}
          />
        </label>
        <label>
          {t("agenda.end")}
          <input
            type="datetime-local"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
          />
        </label>
        <Button type="submit" variant="primary">
          {t("agenda.saveTime")}
        </Button>
      </form>
      <Button variant="danger" onPress={onDelete}>
        {t("agenda.delete")}
      </Button>
    </Card>
  );
}
