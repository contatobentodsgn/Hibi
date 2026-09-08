# Dedicated Statistics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a first-class `/stats` page backed by a durable local activity ledger, trustworthy migration, deterministic metrics, accessible charts, and period-scoped exports.

**Architecture:** Add an append-only activity collection to `StudyData`, owned and validated by `LocalRepository`. Pure analytics modules transform immutable records into period summaries; `StatsView` renders those summaries and accessible table equivalents without a chart dependency. Existing domain mutations append records only after success, while navigation and instrumentation remain separate concerns.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Playwright, local JSON persistence, CSS/SVG primitives.

---

## File structure

- `src/domain/activity.ts` — activity types, constructors, validation, and trusted legacy migration.
- `src/domain/stats.ts` — period boundaries, aggregation, comparisons, streaks, and chart series.
- `src/domain/models.ts` — adds the versioned activity collection to `StudyData`.
- `src/data/local-repository.ts` — owns append/query/import validation and idempotent migration.
- `src/data/seed-data.ts` — initializes an empty non-analytic ledger for study seed data.
- `src/data/workspace-backup.ts` — upgrades backup schema and migrates version 1 safely.
- `src/ui/StatsView.tsx` — dedicated metrics, filters, accessible chart/table, history, and exports.
- `src/ui/stats.css` — layout and visualization styling.
- `src/ui/AppShell.tsx`, `src/ui/CommandPalette.tsx`, `src/App.tsx` — route and mutation wiring.
- Focused unit/UI/E2E tests prove each boundary before integration.

### Task 1: Define the activity ledger contract

**Files:**
- Create: `src/domain/activity.ts`
- Modify: `src/domain/models.ts`
- Test: `src/domain/__tests__/activity.test.ts`

- [ ] **Step 1: Write the failing contract tests**

```ts
import { describe, expect, it } from 'vitest';
import { createActivityRecord, isActivityRecord } from '../activity';

describe('activity records', () => {
  it('creates a bounded versioned record', () => {
    const record = createActivityRecord({ type: 'task.completed', at: '2026-09-08T12:00:00.000Z', entityType: 'task', entityId: 'task-1', title: 'Post', durationMinutes: 60 });
    expect(record).toMatchObject({ schemaVersion: 1, type: 'task.completed', entityId: 'task-1', durationMinutes: 60 });
    expect(isActivityRecord(record)).toBe(true);
  });

  it('rejects invalid timestamps, negative duration, and malformed event names', () => {
    expect(() => createActivityRecord({ type: 'task.completed', at: 'wrong', durationMinutes: -1 })).toThrow();
    expect(isActivityRecord({ id: 'future-1', schemaVersion: 1, type: 'future.valid', at: '2026-09-08T12:00:00.000Z' })).toBe(true);
    expect(isActivityRecord({ id: 'bad-1', schemaVersion: 1, type: '../bad', at: '2026-09-08T12:00:00.000Z' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npx vitest run src/domain/__tests__/activity.test.ts`
Expected: FAIL because `src/domain/activity.ts` does not exist.

- [ ] **Step 3: Implement the types and bounded constructor**

```ts
export const ACTIVITY_SCHEMA_VERSION = 1 as const;
export const ACTIVITY_TYPES = ['task.completed','task.reopened','focus.started','focus.paused','focus.resumed','focus.completed','focus.cancelled','habit.completed','habit.reopened','goal.progressed','goal.completed','block.created','block.completed','block.moved','block.deleted'] as const;
export type KnownActivityType = typeof ACTIVITY_TYPES[number];
export type ActivityEntityType = 'task' | 'focus' | 'habit' | 'goal' | 'block';
export interface ActivityRecord { id: string; schemaVersion: 1; type: string; at: string; entityType?: ActivityEntityType; entityId?: string; title?: string; durationMinutes?: number; category?: Category; folder?: string; value?: number; seeded?: boolean; }
```

Implement `createActivityRecord` for `KnownActivityType` with ISO timestamp validation, finite non-negative numbers, 240-character title/folder limits, enum checks, and a stable `activity-${crypto.randomUUID()}` identifier. Implement `isActivityRecord(value: unknown)` using the same structural rules without throwing; accept bounded namespaced future event names matching `^[a-z][a-z0-9-]{0,31}\.[a-z][a-z0-9-]{0,31}$`. Add `activity: ActivityRecord[]` to `StudyData`. Calculators must switch only on `ACTIVITY_TYPES` and ignore other valid names.

- [ ] **Step 4: Run the focused test**

Run: `npx vitest run src/domain/__tests__/activity.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/activity.ts src/domain/models.ts src/domain/__tests__/activity.test.ts
git commit -m "feat: define activity ledger contract"
```

### Task 2: Persist, validate, and migrate activity records

**Files:**
- Modify: `src/data/local-repository.ts`
- Modify: `src/data/seed-data.ts`
- Test: `src/data/__tests__/local-repository.test.ts`

- [ ] **Step 1: Add failing repository tests**

Add tests proving that seed data starts with `activity: []`, `appendActivity(input)` stores exactly one clone, `listActivity()` cannot mutate repository state, malformed imported records are rejected, legacy snapshots without `activity` load with an empty ledger, and duplicate activity IDs are rejected.

- [ ] **Step 2: Run the repository test**

Run: `npx vitest run src/data/__tests__/local-repository.test.ts`
Expected: FAIL because the repository has no activity API and seed data lacks the collection.

- [ ] **Step 3: Implement repository ownership**

Add:

```ts
listActivity(): ActivityRecord[] { return clone(this.data.activity); }
appendActivity(input: ActivityInput): ActivityRecord {
  const record = createActivityRecord(input);
  if (this.data.activity.some((item) => item.id === record.id)) throw new Error(`Duplicate activity id: ${record.id}`);
  this.data.activity.push(record);
  return clone(record);
}
```

During `fromJson`, treat a missing collection as `[]`; validate every supplied record with `isActivityRecord`, reject duplicate IDs, and preserve structurally valid namespaced event types that current calculators do not recognize. Reject unsupported schema versions. Initialize `activity: []` in `createSeedData()`.

- [ ] **Step 4: Run repository and seed tests**

Run: `npx vitest run src/data/__tests__/local-repository.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/local-repository.ts src/data/seed-data.ts src/data/__tests__/local-repository.test.ts
git commit -m "feat: persist local activity history"
```

### Task 3: Upgrade workspace backup compatibility

**Files:**
- Modify: `src/data/workspace-backup.ts`
- Test: `src/data/__tests__/workspace-backup.test.ts`

- [ ] **Step 1: Write failing migration tests**

Cover version 2 round-trip with activity, migration of version 1 to version 2 with an empty ledger, rejection of duplicate or malformed records, and preservation of preferences. Assert that exported JSON has no credential-shaped fields.

- [ ] **Step 2: Run the backup tests**

Run: `npx vitest run src/data/__tests__/workspace-backup.test.ts`
Expected: FAIL because the backup version is still 1.

- [ ] **Step 3: Implement version 2 parsing**

Set `WORKSPACE_BACKUP_VERSION = 2`. Define a version-1 input type and migrate it by passing its data through `LocalRepository.fromJson`, which supplies `activity: []`. Continue rejecting any version other than 1 or 2 and return a normalized version-2 backup.

- [ ] **Step 4: Run the backup tests**

Run: `npx vitest run src/data/__tests__/workspace-backup.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/workspace-backup.ts src/data/__tests__/workspace-backup.test.ts
git commit -m "feat: include activity in workspace backups"
```

### Task 4: Build deterministic statistics calculations

**Files:**
- Create: `src/domain/stats.ts`
- Test: `src/domain/__tests__/stats.test.ts`

- [ ] **Step 1: Write failing calculation tests**

Use fixed records around midnight and month boundaries. Cover Today/Week/Month/custom half-open periods, previous-equivalent comparison, task counts, planned/completed minutes, focus minutes, habit rate, goal completions, daily series, category/folder distribution, zero-denominator omission, and partial-history detection.

- [ ] **Step 2: Run the stats tests**

Run: `npx vitest run src/domain/__tests__/stats.test.ts`
Expected: FAIL because the statistics module does not exist.

- [ ] **Step 3: Implement pure calculation APIs**

Define:

```ts
export type StatsPreset = 'today' | 'week' | 'month' | 'custom';
export interface StatsPeriod { start: string; endExclusive: string; label: string; }
export interface StatsSummary { period: StatsPeriod; tasksCompleted: number; completionRate?: number; plannedMinutes: number; completedMinutes: number; focusSessions: number; focusMinutes: number; habitRate?: number; goalsCompleted: number; daily: readonly DailyMetric[]; categories: readonly DistributionMetric[]; folders: readonly DistributionMetric[]; partialHistory: boolean; }
export function resolveStatsPeriod(preset: StatsPreset, reference: Date, custom?: { start: string; end: string }): StatsPeriod;
export function calculateStats(records: readonly ActivityRecord[], period: StatsPeriod): StatsSummary;
export function compareStats(current: StatsSummary, previous: StatsSummary): StatsComparison;
```

Parse ISO timestamps once, bucket by local calendar date, filter with `start <= at < endExclusive`, and omit rates whose denominator cannot be proven.

- [ ] **Step 4: Run the calculation tests**

Run: `npx vitest run src/domain/__tests__/stats.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/stats.ts src/domain/__tests__/stats.test.ts
git commit -m "feat: calculate local productivity statistics"
```

### Task 5: Record successful domain activity exactly once

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/ui/FocusView.tsx`
- Test: `src/App.test.ts`
- Test: `src/ui/__tests__/data-bound-views.test.tsx`

- [ ] **Step 1: Write failing mutation-wiring tests**

Test task complete/reopen, habit complete/reopen, goal progress/completion, block create/delete, and focus lifecycle. Assert a failed schedule validation appends nothing and repeated rendering does not duplicate activity.

- [ ] **Step 2: Run focused wiring tests**

Run: `npx vitest run src/App.test.ts src/ui/__tests__/data-bound-views.test.tsx`
Expected: FAIL because mutations do not append activity.

- [ ] **Step 3: Append records after successful mutations**

Introduce one `recordActivity(input)` helper in `App.tsx`. Capture entity snapshots before destructive changes, call the existing repository mutation first, then append the corresponding activity record and refresh once. Extend `FocusView` callbacks to report `started`, `paused`, `resumed`, `completed`, and `cancelled` with measured duration; do not infer focused minutes from wall-clock time after a reload.

- [ ] **Step 4: Run focused wiring tests**

Run: `npx vitest run src/App.test.ts src/ui/__tests__/data-bound-views.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/ui/FocusView.tsx src/App.test.ts src/ui/__tests__/data-bound-views.test.tsx
git commit -m "feat: record workspace activity events"
```

### Task 6: Create the accessible Stats page and exports

**Files:**
- Create: `src/ui/StatsView.tsx`
- Create: `src/ui/stats.css`
- Create: `src/ui/__tests__/StatsView.test.tsx`
- Create: `src/domain/stats-export.ts`
- Test: `src/domain/__tests__/stats-export.test.ts`

- [ ] **Step 1: Write failing UI and export tests**

Render fixed records and assert period controls, four summary cards, partial-history notice, trend SVG with an accessible name, equivalent data table, planned/completed comparison, category/folder sections, filtered history, and CSV/JSON export buttons. Test RFC-4180 escaping and selected-period filtering in pure export helpers.

- [ ] **Step 2: Run the focused tests**

Run: `npx vitest run src/ui/__tests__/StatsView.test.tsx src/domain/__tests__/stats-export.test.ts`
Expected: FAIL because the files do not exist.

- [ ] **Step 3: Implement export helpers**

Export `recordsForPeriod`, `activityToCsv`, and `activityToJson`. Include only approved fields (`at`, `type`, entity metadata, title snapshot, duration, category, folder, value), use a fixed column order, escape quotes/newlines, and never serialize workspace content or credentials.

- [ ] **Step 4: Implement `StatsView`**

Use controlled preset/custom dates, `resolveStatsPeriod`, `calculateStats`, and `compareStats`. Render an SVG polyline/bar series with visible labels and a sibling `<table>` carrying the same daily values. Use Blob downloads named `hibi-stats-YYYY-MM-DD.csv|json`. Announce period and export changes through `aria-live` and call `onEvent` for local instrumentation.

- [ ] **Step 5: Add responsive styling**

Create dedicated `stats-*` classes using existing color tokens, grid collapse below 900px, visible keyboard focus, `prefers-reduced-motion`, and no color-only encoding.

- [ ] **Step 6: Run UI and export tests**

Run: `npx vitest run src/ui/__tests__/StatsView.test.tsx src/domain/__tests__/stats-export.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/StatsView.tsx src/ui/stats.css src/ui/__tests__/StatsView.test.tsx src/domain/stats-export.ts src/domain/__tests__/stats-export.test.ts
git commit -m "feat: add dedicated statistics experience"
```

### Task 7: Make Stats a first-class destination

**Files:**
- Modify: `src/ui/AppShell.tsx`
- Modify: `src/ui/CommandPalette.tsx`
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`
- Test: `src/ui/__tests__/data-bound-views.test.tsx`
- Test: `tests/e2e/smoke.spec.ts`

- [ ] **Step 1: Add failing navigation tests**

Assert `NavKey` accepts `stats`, primary navigation contains Stats, `/stats` has `route: 'stats'`, `/review` remains `review`, and command execution renders a heading named `Statistics` rather than `Review`.

- [ ] **Step 2: Run navigation tests**

Run: `npx vitest run src/ui/__tests__/data-bound-views.test.tsx && npx playwright test tests/e2e/smoke.spec.ts -g "statistics"`
Expected: FAIL because no stats route exists.

- [ ] **Step 3: Wire route, command, view, and CSS**

Add `stats` to `NavKey` and `items`, change `/stats` to `route: 'stats'`, import `StatsView` and `stats.css`, and render `<StatsView records={data.activity} referenceDate={referenceDate(data)} onEvent={log} />` from the App switch. Keep `/review` unchanged.

- [ ] **Step 4: Run navigation tests**

Run: `npx vitest run src/ui/__tests__/data-bound-views.test.tsx && npx playwright test tests/e2e/smoke.spec.ts -g "statistics"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/AppShell.tsx src/ui/CommandPalette.tsx src/App.tsx src/main.tsx src/ui/__tests__/data-bound-views.test.tsx tests/e2e/smoke.spec.ts
git commit -m "feat: route stats to dedicated page"
```

### Task 8: Verify persistence, accessibility, and regression safety

**Files:**
- Modify: `tests/e2e/smoke.spec.ts`
- Modify: `docs/parity-audit.md`

- [ ] **Step 1: Add the end-to-end activity scenario**

Create and complete a task through the UI, open `/stats`, verify the task count and history row, reload, verify persistence, switch to a custom period that excludes it, and confirm it disappears. Verify keyboard access to period controls and the table alternative.

- [ ] **Step 2: Run the full automated suite**

Run: `npm test && npm run test:e2e && npm run build`
Expected: all Vitest/Node tests pass, all Playwright tests pass, and the production build completes without TypeScript or bundling errors.

- [ ] **Step 3: Inspect generated behavior manually**

Run: `npm run desktop:production`
Expected: `/stats` opens a distinct page; summary, chart, accessible table, history, custom dates, CSV, and JSON work; Review remains unchanged; no unexpected network request is made.

- [ ] **Step 4: Update the parity audit with evidence**

Change `/stats` from a Review alias to a dedicated local statistics feature, list the exact automated commands and manual checks completed, and retain cloud/cross-device analytics as absent.

- [ ] **Step 5: Commit final verification evidence**

```bash
git add tests/e2e/smoke.spec.ts docs/parity-audit.md
git commit -m "test: verify dedicated statistics workflow"
```

- [ ] **Step 6: Confirm the worktree is clean**

Run: `git status --short`
Expected: no output.
