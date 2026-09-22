import { useState, type FormEvent } from "react";
import { Check, Flame, Pencil, Plus, Trash2 } from "lucide-react";
import type { Habit, StudyData } from "../../../domain/models";
import { todayKey } from "../../../domain/date-context";
import { progressFor, streakFor } from "../../progress-rhythm";
import { HibiEmptyState } from "../components/HibiEmptyState";
import { ActionDialog } from "../components/ActionDialog";
import { HibiUiRoot } from "../components/HibiUiRoot";
import { SectionHeader } from "../components/SectionHeader";
import { useT } from "../../../i18n/LocaleProvider";
import "./rhythm-screens.css";

type Changes = Partial<Omit<Habit, "id">>;
type Props = Readonly<{
  data: StudyData;
  onCreate: (
    title: string,
    frequency?: Habit["frequency"],
    targetPerWeek?: number,
  ) => void;
  onToggleCompletion: (id: string, date: string, completed: boolean) => void;
  onUpdate: (id: string, changes: Changes) => void;
  onDelete: (id: string) => void;
  now?: Date;
}>;

export function HabitsScreen({
  data,
  onCreate,
  onToggleCompletion,
  onUpdate,
  onDelete,
  now,
}: Props) {
  const t = useT();
  const today = todayKey(now);
  const [title, setTitle] = useState("");
  const [frequency, setFrequency] = useState<Habit["frequency"]>("daily");
  const [target, setTarget] = useState("3");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    title: string;
    frequency: Habit["frequency"];
    target: string;
  }>({ title: "", frequency: "daily", target: "3" });
  const [deleting, setDeleting] = useState<Habit | null>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const clean = title.trim();
    const value = frequency === "daily" ? 7 : Number(target);
    if (clean && Number.isFinite(value) && value > 0) {
      onCreate(clean, frequency, value);
      setTitle("");
    }
  };
  const save = (event: FormEvent, habit: Habit) => {
    event.preventDefault();
    const clean = draft.title.trim();
    const value = draft.frequency === "daily" ? 7 : Number(draft.target);
    if (!clean || !Number.isFinite(value) || value <= 0) return;
    const changes: Changes = { title: clean, frequency: draft.frequency };
    if (draft.frequency === "weekly") changes.targetPerWeek = value;
    onUpdate(habit.id, changes);
    setEditing(null);
  };
  const completed = data.habits.filter((habit) =>
    habit.completedDates.includes(today),
  ).length;
  const streak = Math.max(
    0,
    ...data.habits.map((habit) => streakFor(habit, today)),
  );
  return (
    <HibiUiRoot className="rhythm-screen habits-screen">
      <SectionHeader
        title={t("habits.title")}
        subtitle={t("habits.subtitle").replace(
          "{count}",
          String(data.habits.length),
        )}
        actions={
          <button
            className="rhythm-button rhythm-button--primary"
            type="button"
            onClick={() => document.getElementById("new-habit-title")?.focus()}
          >
            <Plus size={16} aria-hidden="true" />
            {t("habits.new")}
          </button>
        }
      />
      <div className="rhythm-stats">
        <div>
          <span>{t("habits.today")}</span>
          <strong>
            {completed}{" "}
            <small>
              {t("habits.of")} {data.habits.length}
            </small>
          </strong>
        </div>
        <div>
          <span>{t("habits.longestStreak")}</span>
          <strong>
            <Flame size={17} aria-hidden="true" />
            {streak} <small>{t("habits.days")}</small>
          </strong>
        </div>
        <div>
          <span>{t("habits.pending")}</span>
          <strong>{Math.max(0, data.habits.length - completed)}</strong>
        </div>
      </div>
      <form
        className="rhythm-create"
        aria-label={t("habits.create.aria")}
        onSubmit={submit}
      >
        <div>
          <label htmlFor="new-habit-title">{t("habits.name")}</label>
          <input
            id="new-habit-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("habits.placeholder")}
            required
          />
        </div>
        <div>
          <label htmlFor="new-habit-frequency">{t("habits.frequency")}</label>
          <select
            id="new-habit-frequency"
            value={frequency}
            onChange={(event) =>
              setFrequency(event.target.value as Habit["frequency"])
            }
          >
            <option value="daily">{t("habits.everyDay")}</option>
            <option value="weekly">{t("habits.everyWeek")}</option>
          </select>
        </div>
        {frequency === "weekly" && (
          <div>
            <label htmlFor="new-habit-target">{t("habits.timesPerWeek")}</label>
            <input
              id="new-habit-target"
              type="number"
              min="1"
              step="1"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
            />
          </div>
        )}
        <button className="rhythm-button rhythm-button--primary" type="submit">
          {t("habits.add")}
        </button>
      </form>
      <section className="rhythm-list" aria-label={t("habits.title")}>
        <header>
          <div>
            <h2>{t("habits.rhythm")}</h2>
            <p>{t("habits.rhythmDescription")}</p>
          </div>
          <span>{today}</span>
        </header>
        {data.habits.length === 0 ? (
          <HibiEmptyState
            icon={Flame}
            tone="mint"
            title={t("habits.empty")}
            description={t("habits.emptyDescription")}
          />
        ) : (
          <div className="rhythm-items">
            {data.habits.map((habit) => {
              const done = habit.completedDates.includes(today);
              const progress = progressFor(habit, today);
              const percent = Math.min(
                100,
                Math.round(
                  (progress.completed / Math.max(progress.target, 1)) * 100,
                ),
              );
              return (
                <article className="rhythm-item" key={habit.id}>
                  <button
                    className={`rhythm-check ${done ? "is-checked" : ""}`}
                    aria-label={t(
                      done ? "habits.unmark" : "habits.mark",
                    ).replace("{title}", habit.title)}
                    onClick={() => onToggleCompletion(habit.id, today, !done)}
                  >
                    {done && <Check size={15} aria-hidden="true" />}
                  </button>
                  {editing === habit.id ? (
                    <form
                      className="rhythm-edit"
                      aria-label={t("habits.edit").replace(
                        "{title}",
                        habit.title,
                      )}
                      onSubmit={(event) => save(event, habit)}
                    >
                      <input
                        aria-label={t("habits.nameOf").replace(
                          "{title}",
                          habit.title,
                        )}
                        value={draft.title}
                        onChange={(event) =>
                          setDraft({ ...draft, title: event.target.value })
                        }
                        required
                      />
                      <select
                        value={draft.frequency}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            frequency: event.target.value as Habit["frequency"],
                          })
                        }
                      >
                        <option value="daily">{t("habits.everyDay")}</option>
                        <option value="weekly">{t("habits.everyWeek")}</option>
                      </select>
                      {draft.frequency === "weekly" && (
                        <input
                          aria-label={t("habits.goalOf").replace(
                            "{title}",
                            habit.title,
                          )}
                          type="number"
                          min="1"
                          value={draft.target}
                          onChange={(event) =>
                            setDraft({ ...draft, target: event.target.value })
                          }
                        />
                      )}
                      <button
                        className="rhythm-button rhythm-button--primary"
                        type="submit"
                      >
                        {t("habits.save")}
                      </button>
                      <button
                        className="rhythm-button"
                        type="button"
                        onClick={() => setEditing(null)}
                      >
                        {t("habits.cancel")}
                      </button>
                    </form>
                  ) : (
                    <div className="rhythm-item__copy">
                      <strong>{habit.title}</strong>
                      <span>
                        {habit.frequency === "daily"
                          ? t("habits.daily")
                          : t("habits.weeklySummary").replace(
                              "{count}",
                              String(habit.targetPerWeek),
                            )}{" "}
                        ·{" "}
                        {t("habits.streakSummary").replace(
                          "{count}",
                          String(streakFor(habit, today)),
                        )}
                      </span>
                      <div className="rhythm-progress">
                        <span style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                  )}
                  <div className="rhythm-item__actions">
                    <button
                      aria-label={t("habits.edit").replace(
                        "{title}",
                        habit.title,
                      )}
                      onClick={() => {
                        setEditing(habit.id);
                        setDraft({
                          title: habit.title,
                          frequency: habit.frequency,
                          target: String(habit.targetPerWeek),
                        });
                      }}
                    >
                      <Pencil size={15} aria-hidden="true" />
                    </button>
                    <button
                      aria-label={t("habits.delete").replace(
                        "Excluir hábito",
                        `Excluir ${habit.title}`,
                      )}
                      onClick={() => setDeleting(habit)}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
      {deleting && (
        <ActionDialog
          trigger={
            <button className="sr-only" aria-hidden="true" type="button">
              {t("habits.delete")}
            </button>
          }
          isOpen
          onOpenChange={(open) => !open && setDeleting(null)}
          title={t("habits.deleteTitle").replace("{title}", deleting.title)}
          description={t("habits.deleteDescription")}
        >
          <div className="rhythm-dialog__actions">
            <button className="rhythm-button" onClick={() => setDeleting(null)}>
              {t("habits.cancel")}
            </button>
            <button
              className="rhythm-button rhythm-button--danger"
              onClick={() => {
                onDelete(deleting.id);
                setDeleting(null);
              }}
            >
              {t("habits.delete")}
            </button>
          </div>
        </ActionDialog>
      )}
    </HibiUiRoot>
  );
}
