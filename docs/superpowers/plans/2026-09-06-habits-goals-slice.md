# Habits and Goals Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add functional, isolated Habits and Goals domain/UI sections with empty seed data, local CRUD, navigation, and practical progress actions.

**Architecture:** Extend the existing `StudyData` snapshot with independent `habits` and `goals` collections. Keep all mutations behind `LocalRepository`, with `App` owning refresh/logging callbacks and dedicated views consuming only the snapshot and their action props. Older local JSON remains valid by defaulting missing collections to empty arrays.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, existing local repository and shell styles.

---

### Task 1: Define the failing domain and view tests

**Files:**
- Modify: `src/data/__tests__/local-repository.test.ts`
- Modify: `src/ui/__tests__/data-bound-views.test.tsx`

- [ ] Add repository tests for empty habit/goal seed data, create/update/delete, habit completion toggling, and goal progress updates.
- [ ] Add static-render tests proving empty-state copy and the create actions for both new views.
- [ ] Run the focused tests and confirm they fail because the new models, repository methods, and views do not exist.

### Task 2: Add independent models, seed collections, and repository CRUD

**Files:**
- Modify: `src/domain/models.ts`
- Modify: `src/data/seed-data.ts`
- Modify: `src/data/local-repository.ts`

- [ ] Add `Habit` and `Goal` interfaces with only slice-owned fields: recurrence/progress dates for habits and target/current progress for goals.
- [ ] Return `habits: []` and `goals: []` from the seed.
- [ ] Add list/get/create/update/delete methods plus `setHabitCompletion` and `setGoalProgress` without changing existing method signatures.
- [ ] Make `fromJson` accept legacy snapshots that omit either new collection.
- [ ] Run repository tests and confirm they pass.

### Task 3: Build the Habits and Goals views

**Files:**
- Create: `src/ui/HabitsView.tsx`
- Create: `src/ui/GoalsView.tsx`
- Modify: `src/ui/theme.css`

- [ ] Render empty states from the snapshot and create buttons.
- [ ] Provide habit create/edit/delete and a today completion toggle, with streak/progress details derived from stored completion dates.
- [ ] Provide goal create/edit/delete and progress increment/set action, with a clamped progress bar and completion state.
- [ ] Reuse existing classes and add only focused row/progress styling.
- [ ] Run the focused view tests and TypeScript build.

### Task 4: Connect routes, navigation, palette, and App callbacks

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/ui/AppShell.tsx`
- Modify: `src/ui/CommandPalette.tsx`

- [ ] Add `habits` and `goals` route keys and navigation items.
- [ ] Add command palette entries for both sections.
- [ ] Add App callbacks for create/edit/delete/progress/completion that mutate the repository, refresh state, and preserve event logging.
- [ ] Render the views through the existing route switch and persist the snapshot through the existing localStorage effect.
- [ ] Run all unit tests and the build.

### Task 5: Verify and commit

**Files:**
- Verify all files above and the final repository diff.

- [ ] Run `git diff --check`, `npm test`, and `npm run build`.
- [ ] Confirm only the requested implementation, tests, and plan are staged.
- [ ] Commit with `feat: add habits and goals slice`.
