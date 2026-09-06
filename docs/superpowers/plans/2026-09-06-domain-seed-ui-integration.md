# Domain Seed UI Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static Tasks, Reminders, Day, Week, and Settings data paths with a single in-memory `LocalRepository` owned by `App`, while preserving the current visual design and passing the TypeScript build.

**Architecture:** `App` constructs one `LocalRepository(createSeedData())`, owns a cloned `StudyData` snapshot in React state, and exposes small mutation callbacks that update the repository, refresh the snapshot, and log the existing UI event. The affected views receive only the snapshot and actions they need; their markup and existing class names remain intact. Calendar views derive labels and blocks from the seeded ISO dates instead of hard-coded August content.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, existing `LocalRepository` and domain schedule helpers.

---

### Task 1: Define the failing UI data-contract tests

**Files:**
- Create: `src/ui/__tests__/data-bound-views.test.tsx`
- Modify: `src/ui/TasksView.tsx`
- Modify: `src/ui/RemindersView.tsx`
- Modify: `src/ui/DayView.tsx`
- Modify: `src/ui/WeekView.tsx`
- Modify: `src/ui/SettingsView.tsx`

- [ ] **Step 1: Write tests that render the seeded snapshot through each affected view.**

  Use `renderToStaticMarkup`, `createSeedData`, and the typed view props to assert that seeded task titles, the Horizontes reminder, seeded day blocks, weekly English class, and the reset action are present. Keep callbacks as no-op functions because the first test only proves the data contract.

- [ ] **Step 2: Run the new test and verify it fails for the missing data props/static content.**

  Run: `npm test -- src/ui/__tests__/data-bound-views.test.tsx`

  Expected: FAIL because the views do not yet accept or render the repository snapshot.

### Task 2: Make affected views render the real snapshot and expose mutations

**Files:**
- Modify: `src/ui/TasksView.tsx`
- Modify: `src/ui/RemindersView.tsx`
- Modify: `src/ui/DayView.tsx`
- Modify: `src/ui/WeekView.tsx`
- Modify: `src/ui/SettingsView.tsx`

- [ ] **Step 1: Add minimal typed props for `StudyData` and view actions.**

  Keep `onEvent` and add only the required callbacks: task status changes, reminder status changes, block creation/update/delete hooks where needed, and `onReset` for Settings.

- [ ] **Step 2: Replace static task and reminder arrays with `data.tasks` and `data.reminders`.**

  Derive open counts, category labels, recurrence detail, and checked/paused presentation from the snapshot. Keep the current rows, pills, filters, and buttons visually unchanged.

- [ ] **Step 3: Replace static Day and Week block content with filtered `data.blocks`.**

  Use `toDateKey` and `durationMinutes`; show the seeded Monday 07 September 2026 day and the 07–13 September week. Keep the existing grid structure, class names, and conflict call-to-action; quick-add continues to emit the existing event until App supplies a repository mutation.

- [ ] **Step 4: Connect Settings reset to an `onReset` action.**

  Leave preference controls local to Settings, but make the Study data button invoke App’s repository reset callback and preserve the existing event logging.

- [ ] **Step 5: Run the focused UI test and existing unit tests.**

  Run: `npm test -- src/ui/__tests__/data-bound-views.test.tsx src/data/__tests__/local-repository.test.ts`

  Expected: PASS.

### Task 3: Own the repository in App and refresh snapshots after actions

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/ui/AppShell.tsx`

- [ ] **Step 1: Create the repository once in `App` and initialize `data` from `snapshot()`.**

  Construct `new LocalRepository(createSeedData())` via `useState` lazy initialization, then keep `StudyData` state synchronized through a `refreshData` callback.

- [ ] **Step 2: Add App-owned mutation callbacks.**

  Wrap existing repository methods for task completion, reminder pause, and study reset. Each callback performs the repository mutation, refreshes the snapshot, and logs the existing event shape. Add no persistence beyond the existing in-memory repository.

- [ ] **Step 3: Pass snapshot and callbacks to Tasks, Reminders, Day, Week, and Settings.**

  Preserve the existing route switch and event instrumentation. Update shell badge counts from the snapshot so navigation reflects the real seed and mutations.

- [ ] **Step 4: Run the focused UI test, all unit tests, and the build.**

  Run: `npm test && npm run build`

  Expected: all tests pass and `tsc --noEmit` plus `vite build` complete successfully.

### Task 4: Review, verify, and commit

**Files:**
- Verify: `src/App.tsx`, `src/ui/AppShell.tsx`, `src/ui/TasksView.tsx`, `src/ui/RemindersView.tsx`, `src/ui/DayView.tsx`, `src/ui/WeekView.tsx`, `src/ui/SettingsView.tsx`, `src/ui/__tests__/data-bound-views.test.tsx`
- Include: `docs/superpowers/plans/2026-09-06-domain-seed-ui-integration.md`

- [ ] **Step 1: Inspect the diff and ensure unrelated working-tree files are not staged.**

  Run: `git diff --check`, `git status --short`, and `git diff --stat`.

- [ ] **Step 2: Re-run verification before claiming completion.**

  Run: `npm test && npm run build`

- [ ] **Step 3: Commit only the implementation, test, and plan files.**

  Run: `git add docs/superpowers/plans/2026-09-06-domain-seed-ui-integration.md src/App.tsx src/ui/AppShell.tsx src/ui/TasksView.tsx src/ui/RemindersView.tsx src/ui/DayView.tsx src/ui/WeekView.tsx src/ui/SettingsView.tsx src/ui/__tests__/data-bound-views.test.tsx && git commit -m "feat: wire domain seed into study UI"`

  Expected: a new commit containing only the requested integration and its focused test.

## Self-review

- The plan covers the required `App` repository ownership, snapshot/action props for all five requested views, real seeded content, reset/mutation refreshes, visual preservation, TypeScript build verification, and the requested commit.
- There are no placeholder implementation steps; each step names files, commands, and expected outcomes.
- The shared type source remains `src/domain/models.ts`, and all method names match the existing `LocalRepository` API.
