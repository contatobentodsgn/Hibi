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
| Goals | `goal.progressed` with `value = current` when `current` changes; `goal.completed` when `status` becomes `completed`; `goal.reopened` (added to the vocabulary after the Task 5 review) when it leaves `completed`, so `goalsCompleted` is netted like tasks. |
| Taby | Confirmed Taby actions record like the UI: `onTaskStatusChanged(before, after)` records completions and reopens; `onBlockCreated` / `onBlockDeleted` record blocks. The "Tarefa concluída" notch appears only on the transition to completed. (Review of Task 5.) |
| Blocks | `block.created` (with `durationMinutes` from start/end) after a successful create; `block.deleted` after a confirmed delete. `block.moved` and `block.completed` stay in the vocabulary but are not recorded: Hibi has no UI for them yet. |
| Focus | `FocusView` measures running time. `focus.started` on the first start of a session, `focus.paused` on stop, `focus.resumed` on restart of a paused session, `focus.completed` when the clock reaches zero, `focus.cancelled` when a started, unfinished session is abandoned (leaving the screen or switching to break). `completed` and `cancelled` carry the session's measured minutes; `paused`/`resumed` carry none, so minutes are never double counted. Break mode never emits lifecycle events. |
| Metrics | `tasksCompleted` = net `task.completed − task.reopened` (not below 0); `completedMinutes` = sum of `durationMinutes` of `task.completed` minus reopened ones; `plannedMinutes` = `block.created − block.deleted` minutes; `focusSessions` = count of `focus.completed`; `focusMinutes` = minutes of `focus.completed` + `focus.cancelled`; `habitCheckIns` = net habit completions; `goalsCompleted` = `goal.completed − goal.reopened` (not below 0). `completionRate` and `habitRate` are omitted in v1 (the ledger alone has no provable denominator). Events are bucketed by `at` in the local timezone with half-open periods. |
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

## Task 3: Upgrade workspace backup compatibility — DONE

Commit `c7ddc95`. `WORKSPACE_BACKUP_VERSION = 2`; versions 1 and 2 are accepted and normalized through `LocalRepository.fromJson`, so a version 1 backup gains `activity: []`; malformed or duplicated activity records and future versions are rejected; preferences survive and no credential-shaped keys are exported (`src/data/__tests__/workspace-backup.test.ts`).

## Task 4: Build deterministic statistics calculations — DONE

Commit `8fcd7d0`, plus the review fixes `79a6dcd` (signed daily and distribution deltas that add up to the period totals) and `44d8c5f` (decisions recorded above). `src/domain/stats.ts` exports `resolveStatsPeriod`, `previousPeriod`, `calculateStats`, `compareStats` and `MAX_CUSTOM_PERIOD_DAYS`; `src/domain/__tests__/stats.test.ts` passes with `TZ=UTC` and `TZ=America/Sao_Paulo`.

## Task 5: Record successful domain activity exactly once — DONE

Commits `cae0a8d` (pure mappers in `src/domain/activity-events.ts`), `c990567` (focus lifecycle reducer in `src/ui/focus-lifecycle.ts` and `FocusView.onFocusLifecycle`), `c0ef060` (`recordActivity` in `App.tsx`), plus the review fixes `c5fc4a8` (Taby `onTaskStatusChanged`), `23d6020` (Taby `onBlockCreated` / `onBlockDeleted`), `ac9c2c7` (measured focus capped at the session length), `f56501e` (`goal.reopened`), `5631efb` (snapshot copies and ledger limits), `fd6c23a` (decisions recorded above) and the focus guard fix `444f376` (the paused-session duration guard applies only to focus mode; in break mode any duration choice resets the clock).

## Task 6: Create the accessible Stats page and exports — DONE

Commits `7be9ab2` (`src/domain/stats-export.ts`: `recordsForPeriod`, CSV with fixed columns, RFC 4180 quoting and formula-injection protection, JSON with the same fields) and `8cc791d` (`StatsView`, `stats.css`, `stats.*` dictionary keys), plus the review fixes `850fcc5` (exports stay available for an empty period: CSV header only, JSON `[]`), `f0e728d` (pure formatting helpers moved to `src/ui/stats-format.ts`) and `8928538` (custom period validation, announcements and table semantics).

## Task 7: Make Stats a first-class destination — DONE

Commit `fbb3c83`. `stats` route in `MORE_ITEMS` right after `review`, `/stats` command, Help entry, and `StatsView` rendered in `App.tsx` with the same reference date Review uses; `tests/e2e/stats.spec.ts` covers the dock menu, the palette, `/review` still opening Review, and the dock's current-section state.

## Task 8: Verify persistence, accessibility, and regression safety — DONE (Steps 3 and 5 pending the controller)

Commit `test: verify dedicated statistics workflow` (e2e and docs). The Electron check, push and PR are still pending the controller.

**Files:**
- Modify: `tests/e2e/stats.spec.ts`
- Modify: `docs/IMPLEMENTATION_STATUS_AND_PLAN.md`, `docs/superpowers/specs/2026-09-08-dedicated-stats-design.md` (short "Decisions after implementation" section mirroring the decisions table above)

- [x] **Step 1: End-to-end scenario.** Done as four new tests in `tests/e2e/stats.spec.ts` (task in Today, reload and excluded custom period; CSV per period; keyboard; focus completed and cancelled, then a break). The clock is pinned with `page.clock.install` to local 2026-09-07 10:00, the workspace reference date the page uses as "Today", so the tests do not depend on the real date or timezone. Complete a task through the Tasks UI; open `/stats`; Today shows 1 completed task and the history row; reload and see it persist; pick a custom period that excludes today and see 0 and no row; export CSV (`page.waitForEvent('download')`) and assert the file contains the task title for Today and not for the excluded period; reach period controls and the table by keyboard. Complete and cancel a short focus session with Playwright's clock (`page.clock`) and assert focus minutes; start and finish a break and assert focus stays unchanged.
- [x] **Step 2: Full gate.** `rtk proxy npm test`, `npx tsc --noEmit`, `npm run build`, `rtk proxy npx playwright test` → PASS; also `TZ=UTC rtk proxy npx vitest run src/domain/__tests__/stats.test.ts`. Result on 2026-09-10: Vitest 503 tests in 66 files plus 176 `node --test`; `tsc` without errors; build (native addon, `tsc`, `vite build`) exit 0; Playwright 99 passed; `stats.test.ts` 28 passed with `TZ=UTC` and with `TZ=America/Sao_Paulo`. The Stats spec also passed twice each under `America/Sao_Paulo`, `UTC` and `Pacific/Kiritimati`.
- [ ] **Step 3: Real app check (controller).** Pending the controller. Production build in Electron (`HIBI_PRODUCTION=1`), open Stats through the dock, capture a screenshot of the Hibi window only (not the desktop), check summary, chart, table, history, custom dates and exports; Review unchanged; no network requests from Stats.
- [x] **Step 4: Docs.** In `IMPLEMENTATION_STATUS_AND_PLAN.md` mark "Estatísticas dedicadas" implemented with evidence, tick item 1 of Fase 5 and remove Stats from the "Falta" table; add the spec section.
- [ ] **Step 5: Commit** `test: verify dedicated statistics workflow`, push, open the PR and let CI run. The commit is made; push, PR and CI are pending the controller.
