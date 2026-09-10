# Dedicated Statistics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a first-class `/stats` page backed by a durable local activity ledger, trustworthy migration, deterministic metrics, accessible charts, and period-scoped exports.

**Architecture:** An append-only activity collection in `StudyData`, owned and validated by `LocalRepository`. Pure modules map successful domain mutations to activity inputs and transform immutable records into period summaries; `StatsView` renders those summaries with accessible table equivalents and no chart dependency. Navigation and instrumentation stay separate from the ledger.

**Tech Stack:** Electron 44, React 19, TypeScript 7, Vite 8, Vitest 5 (node, no DOM, `renderToStaticMarkup`), Playwright 1.63, local JSON persistence, CSS/SVG primitives.

Spec: `docs/superpowers/specs/2026-09-08-dedicated-stats-design.md`.

---

## Revision 2026-09-10 (after merging `main`)

The branch was merged with `main` at `488cd3f` (PRs #1–#6: AI and integrations, new UI foundation, `/folder` and `/break`, notch display, CI). Tasks 1–2 are done. Tasks 3–8 below were rewritten for the current code:

- **Paths changed.** `src/ui/AppShell.tsx` and `src/ui/CommandPalette.tsx` no longer exist: routes live in `src/ui/shell/routes.ts` (`NavKey`, `DOCK_ITEMS`, `MORE_ITEMS`) and commands in `src/ui/palette/commands.ts`.
- **New UI conventions.** User-facing strings go through `src/i18n/dictionary.ts` (`pt` is the source of truth; `en` is typed by its keys) via `useT()`; dates via `useFormat()` from `src/i18n/LocaleProvider.tsx`; colors via the tokens in `src/ui/tokens.css` so light and dark themes work.
- **Focus changed.** `FocusView` has `focus` and `break` modes; breaks emit `break-*` instrumentation and must never produce `focus.*` activity. Today it only reports `onFocusStarted` and `onFocusCompleted`; the "Pause session" button stops the clock without resetting it.
- **Other writers of workspace data** exist now (Taby tools in `src/ai/local-runtime.ts`, Notion sync `src/integrations/notion-apply.ts`, imports, backup restore, reset). Only actions a person performs in Hibi — directly or by confirming a Taby action — record activity.
- **CI.** GitHub Actions runs `npm test`, `tsc`, `vite build` and Playwright on Linux with `TZ=America/Sao_Paulo`; new tests must still be timezone-independent (build timestamps from local `new Date(y, m, d, h)`), and must not need the native addon.
- **Docs.** `docs/parity-audit.md` is superseded; update `docs/IMPLEMENTATION_STATUS_AND_PLAN.md` instead.

### Decisions fixed by this revision

| Topic | Decision |
| --- | --- |
| Where mapping lives | Pure functions in `src/domain/activity-events.ts` turn (before, after) domain snapshots into `ActivityInput`s; `App.tsx` only calls them after the repository mutation succeeded. |
| Tasks | `task.completed` when the status becomes `completed` from anything else; `task.reopened` when it leaves `completed`. Recorded from the Tasks UI and from the Taby `task.update` tool. Notion pulls, imports, restores and resets record nothing. |
| Habits | `habit.completed` / `habit.reopened` only when the date's membership in `completedDates` actually changes. `at` is the time of the action. |
| Goals | `goal.progressed` with `value = current` when `current` changes; `goal.completed` when `status` becomes `completed`. |
| Blocks | `block.created` (with `durationMinutes` from start/end) after a successful create; `block.deleted` after a confirmed delete. `block.moved` and `block.completed` stay in the vocabulary but are not recorded: Hibi has no UI for them yet. |
| Focus | `FocusView` measures running time. `focus.started` on the first start of a session, `focus.paused` on stop, `focus.resumed` on restart of a paused session, `focus.completed` when the clock reaches zero, `focus.cancelled` when a started, unfinished session is abandoned (leaving the screen or switching to break). `completed` and `cancelled` carry the session's measured minutes; `paused`/`resumed` carry none, so minutes are never double counted. Break mode never emits lifecycle events. |
| Metrics | `tasksCompleted` = net `task.completed − task.reopened` (not below 0); `completedMinutes` = sum of `durationMinutes` of `task.completed` minus reopened ones; `plannedMinutes` = `block.created − block.deleted` minutes; `focusSessions` = count of `focus.completed`; `focusMinutes` = minutes of `focus.completed` + `focus.cancelled`; `habitCheckIns` = net habit completions; `goalsCompleted` = count of `goal.completed`. `completionRate` and `habitRate` are omitted in v1 (the ledger alone has no provable denominator). Events are bucketed by `at` in the local timezone with half-open periods. |
| Daily series and distributions | Signed deltas: a reversal counts negatively on its own day and in its own category/folder, so any split of a period adds back up to the unclamped net; only the period totals are clamped at 0. The page must draw a zero baseline and show negative values as such (e.g. "−1"). Folder distribution puts `NO_FOLDER` last on ties. Minutes are rounded to whole minutes. (Review of Task 4.) |
| Periods | Custom periods are limited to 366 calendar days (`MAX_CUSTOM_PERIOD_DAYS`); invalid presets, dates or periods throw `RangeError`, which the page shows as the invalid-period state. The previous period has the same number of calendar days (a custom Mar 1–31 compares with Jan 29–Feb 28), except `month`, which compares with the previous calendar month; the page labels it. |
| Partial history | A period is partial when it starts before the earliest non-seeded record in the ledger, including valid unknown event types (or the ledger is empty). When the previous period is partial, the page shows the comparison as unavailable instead of a delta. |
| Failure | If appending fails, the action stays applied, an instrumentation event with result `fail` is logged and the existing inline error surface shows a short message; the action is never reported as recorded. |

---

## File structure

- `src/domain/activity.ts` — activity types, constructors, validation (done).
- `src/domain/activity-events.ts` — pure mapping from domain changes to activity inputs.
- `src/domain/stats.ts` — period boundaries, aggregation, comparisons, series.
- `src/domain/stats-export.ts` — period filtering and CSV/JSON export.
- `src/domain/models.ts` — `activity` in `StudyData` (done).
- `src/data/local-repository.ts` — append/query/import validation (done).
- `src/data/seed-data.ts` — empty ledger for seed data (done).
- `src/data/workspace-backup.ts` — backup version 2 with migration from version 1.
- `src/ui/FocusView.tsx` — measured focus lifecycle callback.
- `src/ai/local-runtime.ts` — Taby hook passes the completed task id.
- `src/ui/StatsView.tsx`, `src/ui/stats.css` — the page.
- `src/ui/shell/routes.ts`, `src/ui/palette/commands.ts`, `src/ui/HelpView.tsx`, `src/App.tsx`, `src/i18n/dictionary.ts` — route, command and wiring.
- `tests/e2e/stats.spec.ts` — end-to-end workflow.

## Task 1: Define the activity ledger contract — DONE

Commits `ba5126c`, `f0a73a8`, `82a6308`, `8228006`. `src/domain/activity.ts` exports `ACTIVITY_SCHEMA_VERSION`, `ACTIVITY_TYPES`, `KnownActivityType`, `ActivityEntityType`, `ActivityRecord`, `ActivityInput`, `isActivityRecord`, `createActivityRecord`; `StudyData.activity: ActivityRecord[]`.

## Task 2: Persist, validate, and migrate activity records — DONE

Commit `8a4ff4c`, plus the merge fix `488cd3f` (`notion-apply` test fixture). `LocalRepository` has `listActivity()` and `appendActivity(input)`; `fromJson` treats a missing collection as `[]`, validates records, rejects duplicates and unsupported schema versions; seed data starts with `activity: []`.

## Task 3: Upgrade workspace backup compatibility

**Files:**
- Modify: `src/data/workspace-backup.ts`
- Test: `src/data/__tests__/workspace-backup.test.ts` (create if missing; check for an existing backup test file first and extend it)

- [ ] **Step 1: Write failing tests** for: version 2 round-trip keeps `data.activity`; a version 1 backup (no `activity`) parses into a normalized version 2 backup with `activity: []`; malformed or duplicated activity records are rejected with the existing "not a compatible Hibi workspace backup" style of error (or the repository's error surfaced by `parseWorkspaceBackup`); preferences (`language`, `twentyFourHour`) are preserved; the exported JSON contains no credential-shaped keys (`apiKey`, `token`, `secret`, `password`).
- [ ] **Step 2: Run** `rtk proxy npx vitest run src/data/__tests__/workspace-backup.test.ts` → FAIL (version is still 1).
- [ ] **Step 3: Implement.** `WORKSPACE_BACKUP_VERSION = 2`; accept versions 1 and 2; normalize data through `LocalRepository.fromJson(seed, JSON.stringify(data)).snapshot()` so version 1 gains `activity: []`; always return version 2. Keep other validation unchanged. Check `src/ui/SettingsView.tsx` restore/export and any e2e (`tests/e2e/smoke.spec.ts` "restaura um backup completo…") that assert `version: 1` and update them.
- [ ] **Step 4: Run** the focused test, `rtk proxy npx vitest run src --exclude 'src/**/._*' --exclude '**/.worktrees/**'` and the backup e2e (`rtk proxy npx playwright test tests/e2e/smoke.spec.ts -g "backup"`) → PASS.
- [ ] **Step 5: Commit** `feat: include activity in workspace backups`.

## Task 4: Build deterministic statistics calculations

**Files:**
- Create: `src/domain/stats.ts`
- Test: `src/domain/__tests__/stats.test.ts`

- [ ] **Step 1: Write failing tests** with records built from local dates (`new Date(2026, 8, 7, 23, 30).toISOString()` style, never fixed `Z`/offset strings), covering: `resolveStatsPeriod` for `today`, `week` (Monday–Sunday), `month`, `custom` (inclusive end date → exclusive next midnight) with half-open boundaries at midnight and month end; `previousPeriod` of equal length; every metric in the decisions table (including reopen netting, cancelled focus minutes, planned minus deleted); unknown but valid event types ignored; `daily` series with one entry per local day including zero days; `categories` and `folders` distributions from `task.completed` records (empty folder → `NO_FOLDER` from `src/domain/folders.ts`); `partialHistory`; `compareStats` deltas (current − previous) per metric.
- [ ] **Step 2: Run** `rtk proxy npx vitest run src/domain/__tests__/stats.test.ts` → FAIL.
- [ ] **Step 3: Implement pure APIs:**

```ts
export type StatsPreset = 'today' | 'week' | 'month' | 'custom';
export interface StatsPeriod { start: string; endExclusive: string; preset: StatsPreset }
export interface DailyMetric { date: string; tasksCompleted: number; focusMinutes: number; plannedMinutes: number; completedMinutes: number }
export interface DistributionMetric { key: string; tasksCompleted: number; minutes: number }
export interface StatsSummary { period: StatsPeriod; tasksCompleted: number; plannedMinutes: number; completedMinutes: number; focusSessions: number; focusMinutes: number; habitCheckIns: number; goalsCompleted: number; daily: readonly DailyMetric[]; categories: readonly DistributionMetric[]; folders: readonly DistributionMetric[]; partialHistory: boolean }
export type StatsComparison = Readonly<Record<'tasksCompleted' | 'plannedMinutes' | 'completedMinutes' | 'focusSessions' | 'focusMinutes' | 'habitCheckIns' | 'goalsCompleted', number>>;
export function resolveStatsPeriod(preset: StatsPreset, reference: Date, custom?: { start: string; end: string }): StatsPeriod; // custom dates are YYYY-MM-DD; throws on end < start or invalid dates
export function previousPeriod(period: StatsPeriod): StatsPeriod;
export function calculateStats(records: readonly ActivityRecord[], period: StatsPeriod): StatsSummary;
export function compareStats(current: StatsSummary, previous: StatsSummary): StatsComparison;
```

  `DailyMetric.date` is the local `YYYY-MM-DD`. Parse each `at` once. Switch only on `ACTIVITY_TYPES`.
- [ ] **Step 4: Run** the focused test with `TZ=UTC` and `TZ=America/Sao_Paulo` (`TZ=UTC rtk proxy npx vitest run src/domain/__tests__/stats.test.ts`, then the other) → PASS in both.
- [ ] **Step 5: Commit** `feat: calculate local productivity statistics`.

## Task 5: Record successful domain activity exactly once

**Files:**
- Create: `src/domain/activity-events.ts`
- Test: `src/domain/__tests__/activity-events.test.ts`
- Modify: `src/ui/FocusView.tsx`, `src/ai/local-runtime.ts`, `src/App.tsx`
- Test: `src/ui/__tests__/focus-lifecycle.test.ts` (pure lifecycle helper), existing AI runtime tests for the hook signature, `src/App.test.ts` (source assertions, following its current style)

- [ ] **Step 1: Pure mappers, test first.** `taskStatusActivity(before: Task, nextStatus: EntityStatus, at: string): ActivityInput | null`; `habitCompletionActivity(before: Habit, date: string, completed: boolean, at: string): ActivityInput | null`; `goalProgressActivities(before: Goal, after: Goal, at: string): ActivityInput[]`; `blockActivity(kind: 'created' | 'deleted', block: ScheduleBlock, at: string): ActivityInput`; `focusActivity(type: 'started' | 'paused' | 'resumed' | 'completed' | 'cancelled', focusedMinutes: number | undefined, at: string): ActivityInput`. Snapshots copy `title`, `durationMinutes`, `category` and `folder` where the entity has them. Tests cover every transition in the decisions table, including no-op transitions returning `null`/`[]`.
- [ ] **Step 2: Focus lifecycle, test first.** Extract the timing rules into a pure reducer in `src/ui/focus-lifecycle.ts` (`start(now)`, `pause(now)`, `complete(now)`, `abandon(now)` returning the event to emit and the accumulated milliseconds) and test it (started vs resumed, minutes rounded to the nearest minute and never negative, abandon only emits `cancelled` for a started unfinished session, no events in break mode). Then add `onFocusLifecycle?: (event: { type: 'started' | 'paused' | 'resumed' | 'completed' | 'cancelled'; focusedMinutes?: number }) => void` to `FocusView`, keeping `onFocusStarted`, `onFocusCompleted` and all `onEvent` calls unchanged. Emit from event handlers and from the existing completion effect (not inside state updaters), and `cancelled` from an unmount/mode-change cleanup that reads refs (StrictMode's dev mount/unmount before any start must emit nothing).
- [ ] **Step 3: Taby hook.** Change `onTaskCompleted` in `src/ai/local-runtime.ts` to receive `(title: string, id: string)`; update its tests.
- [ ] **Step 4: Wire `App.tsx`.** Add one `recordActivity(inputs: ActivityInput | ActivityInput[] | null)` helper that appends each input via `repository.appendActivity`, then refreshes once; on error logs `('activity', type, 'fail')` and sets the inline error message `Não foi possível registrar a atividade.`. Call it, after the successful mutation and with snapshots taken before it, from: `changeTaskStatus`; the Taby `onTaskCompleted` hook (look the task up by id); `toggleHabitCompletion`; `setGoalProgress`; `createBlock` (only when validation passed); `deleteBlock` (only after the confirm); `FocusView`'s `onFocusLifecycle`. Do not record from Notion apply, imports, restore or reset.
- [ ] **Step 5: Verify.** Focused tests, full Vitest, `npx tsc --noEmit`, and the existing e2e for tasks, habits, goals, day/week and focus/break (`rtk proxy npx playwright test tests/e2e/smoke.spec.ts tests/e2e/break.spec.ts`) → PASS.
- [ ] **Step 6: Commit** `feat: record workspace activity events`.

## Task 6: Create the accessible Stats page and exports

**Files:**
- Create: `src/domain/stats-export.ts`, `src/domain/__tests__/stats-export.test.ts`
- Create: `src/ui/StatsView.tsx`, `src/ui/stats.css`, `src/ui/__tests__/StatsView.test.tsx`
- Modify: `src/i18n/dictionary.ts` (`stats.*` keys in `pt` and `en`)

- [ ] **Step 1: Export helpers, test first.** `recordsForPeriod(records, period)`; `activityToCsv(records)` with fixed columns `at,type,entityType,entityId,title,durationMinutes,category,folder,value`, RFC 4180 quoting (quotes, commas, newlines) and formula-injection protection (prefix `'` to cells starting with `=`, `+`, `-`, `@`); `activityToJson(records)` with only those fields. Nothing else from the workspace is serialized.
- [ ] **Step 2: View tests, test first** (`renderToStaticMarkup` with a fixed `referenceDate` and records): period buttons with `aria-pressed`; custom start/end date inputs; four summary cards (tasks, focus time, habit check-ins, goals) with the comparison to the previous period in text; the partial-history notice; an SVG with `role="img"` and an accessible name plus a sibling `<table>` with the same daily values; planned vs completed minutes; category and folder sections; the history list and its type filter; CSV and JSON export buttons; empty state; invalid custom period message.
- [ ] **Step 3: Implement `StatsView({ records, referenceDate, onEvent })`.** Controlled preset and custom dates; `resolveStatsPeriod`, `previousPeriod`, `calculateStats`, `compareStats`; texts via `useT()`, dates via `useFormat()`; Blob downloads named `hibi-stats-YYYY-MM-DD.csv|json` using the same link pattern as `SettingsView`'s backup export; an `aria-live="polite"` status for period and export changes; `onEvent('navigation' | 'filter' | 'export', …)` without copying records into instrumentation.
- [ ] **Step 4: Styling.** `src/ui/stats.css` with `stats-*` classes, token colors for light/dark, grid collapsing below 900px, visible focus, `prefers-reduced-motion`, no color-only encoding.
- [ ] **Step 5: Verify** focused tests, full Vitest and `npx tsc --noEmit` → PASS.
- [ ] **Step 6: Commit** `feat: add dedicated statistics experience`.

## Task 7: Make Stats a first-class destination

**Files:**
- Modify: `src/ui/shell/routes.ts`, `src/ui/palette/commands.ts`, `src/ui/HelpView.tsx`, `src/App.tsx`, `src/i18n/dictionary.ts`
- Test: `src/ui/__tests__/shell.test.tsx`, `src/ui/__tests__/palette.test.tsx`, `tests/e2e/stats.spec.ts` (create)

- [ ] **Step 1: Failing tests.** `NavKey` includes `stats`; `MORE_ITEMS` has `stats` right after `review` with label `nav.stats` (pt `Estatísticas`, en `Statistics`); `/stats` maps to route `stats` and `/review` still to `review`; Help lists `/stats`. e2e: the palette command `/stats` and the dock menu item "Estatísticas" both open a page whose heading is "Estatísticas", and `/review` still opens Review.
- [ ] **Step 2: Run** `rtk proxy npx vitest run src/ui/__tests__/shell.test.tsx src/ui/__tests__/palette.test.tsx` and `rtk proxy npx playwright test tests/e2e/stats.spec.ts` → FAIL.
- [ ] **Step 3: Wire.** Add the route, menu item, dictionary keys and command mapping; import `./stats.css` where the other view CSS is imported; render `<StatsView records={data.activity} referenceDate={…same reference date helper Review uses…} onEvent={log} />` in the App route switch.
- [ ] **Step 4: Run** the tests again → PASS; then the full Playwright suite → PASS.
- [ ] **Step 5: Commit** `feat: route stats to dedicated page`.

## Task 8: Verify persistence, accessibility, and regression safety

**Files:**
- Modify: `tests/e2e/stats.spec.ts`
- Modify: `docs/IMPLEMENTATION_STATUS_AND_PLAN.md`, `docs/superpowers/specs/2026-09-08-dedicated-stats-design.md` (short "Decisions after implementation" section mirroring the decisions table above)

- [ ] **Step 1: End-to-end scenario.** Complete a task through the Tasks UI; open `/stats`; Today shows 1 completed task and the history row; reload and see it persist; pick a custom period that excludes today and see 0 and no row; export CSV (`page.waitForEvent('download')`) and assert the file contains the task title for Today and not for the excluded period; reach period controls and the table by keyboard. Complete and cancel a short focus session with Playwright's clock (`page.clock`) and assert focus minutes; start and finish a break and assert focus stays unchanged.
- [ ] **Step 2: Full gate.** `rtk proxy npm test`, `npx tsc --noEmit`, `npm run build`, `rtk proxy npx playwright test` → PASS; also `TZ=UTC rtk proxy npx vitest run src/domain/__tests__/stats.test.ts`.
- [ ] **Step 3: Real app check (controller).** Production build in Electron (`HIBI_PRODUCTION=1`), open Stats through the dock, capture a screenshot of the Hibi window only (not the desktop), check summary, chart, table, history, custom dates and exports; Review unchanged; no network requests from Stats.
- [ ] **Step 4: Docs.** In `IMPLEMENTATION_STATUS_AND_PLAN.md` mark "Estatísticas dedicadas" implemented with evidence, tick item 1 of Fase 5 and remove Stats from the "Falta" table; add the spec section.
- [ ] **Step 5: Commit** `test: verify dedicated statistics workflow`, push, open the PR and let CI run.
