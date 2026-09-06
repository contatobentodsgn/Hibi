# Native macOS Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Schedule native Electron notifications for active reminders and open task deadlines, with a test action in Settings and passing build/tests.

**Architecture:** The renderer derives a small notification payload from `StudyData` and sends it through an optional preload API. Electron main owns timer lifecycle and native `Notification` creation in `electron/notifications.cjs`; recurring schedules are calculated there and rescheduled after firing. Tests inject timers and a notification constructor so the scheduling behavior is testable without opening Electron.

**Tech Stack:** Electron CommonJS main/preload, React 19, TypeScript, Vite, Vitest, Node's built-in test runner.

---

### Task 1: Add red tests for renderer payload derivation

**Files:**
- Create: `src/domain/notifications.ts`
- Create: `src/domain/__tests__/notifications.test.ts`

- [ ] **Step 1: Write failing tests for active deadlines and reminders.**

  Add tests that call `buildNotificationEntries` with `createSeedData()` plus a completed task, paused task, open task with a deadline, paused reminder, and active reminder. Assert only the open deadline and active reminder are returned, with stable IDs, titles, source `at` values, and recurrence preserved.

- [ ] **Step 2: Run the focused test and verify the intended failure.**

  Run: `npm test -- src/domain/__tests__/notifications.test.ts`

  Expected: FAIL because `src/domain/notifications.ts` does not yet export `buildNotificationEntries`.

- [ ] **Step 3: Implement the minimal typed payload builder.**

  Define `NotificationEntry` with `id`, `kind`, `title`, `body`, `at`, and optional `recurrence`. Return one `deadline` entry for each task whose status is neither `completed` nor `paused` and whose deadline is present, plus one `reminder` entry for each reminder whose status is not `paused`. Use the existing reminder recurrence object without changing domain models.

- [ ] **Step 4: Run the focused test and verify it passes.**

  Run: `npm test -- src/domain/__tests__/notifications.test.ts`

  Expected: PASS with all payload assertions green.

### Task 2: Add red tests and the timer-backed Electron scheduler

**Files:**
- Create: `electron/notifications.cjs`
- Create: `electron/notifications.test.cjs`

- [ ] **Step 1: Write failing Node tests for one-time and recurring notifications.**

  Use a fake clock and injected `setTimeout`, `clearTimeout`, `now`, and notification constructor. Test that a future one-time entry creates one timer and calling its callback shows a notification with the expected title/body. Test that a weekly reminder schedules the next configured weekday and schedules its following occurrence after the first callback. Test `sync([])` clears existing timers.

- [ ] **Step 2: Run the focused Node tests and verify the intended failure.**

  Run: `node --test electron/notifications.test.cjs`

  Expected: FAIL because `electron/notifications.cjs` does not yet export the scheduler.

- [ ] **Step 3: Implement the minimal scheduler module.**

  Export `createNotificationScheduler(options)`, `nextOccurrence(entry, afterMs)`, and `sanitizeEntries(entries)`. Use `NotificationClass` only when a timer fires, schedule one-time entries once, calculate daily/weekly next occurrences while respecting start/end dates, and reschedule recurring entries after delivery. Clear old timers on every sync. For delays beyond `2_147_000_000`, use a bounded timer chunk and re-evaluate the entry afterward.

- [ ] **Step 4: Run the focused Node tests and verify they pass.**

  Run: `node --test electron/notifications.test.cjs`

  Expected: PASS with one-time, recurrence, and cancellation assertions green.

### Task 3: Connect the minimal preload/main IPC bridge

**Files:**
- Modify: `electron/preload.cjs`
- Modify: `electron/main.cjs`
- Modify: `src/global.d.ts`

- [ ] **Step 1: Add the two narrow preload methods and global types.**

  Expose `syncNotifications(entries)` and `showTestNotification()` alongside the existing `info` and login-item methods. Type the payload as the renderer `NotificationEntry` shape and return `Promise<void>` for sync and `Promise<boolean>` for the test action.

- [ ] **Step 2: Register main handlers and scheduler lifecycle.**

  Instantiate the scheduler after `app.whenReady()` with Electron's `Notification` class. Handle `hibi:notifications:sync` by passing the incoming list through the scheduler. Handle `hibi:notifications:test` by returning `false` when native notifications are unsupported and otherwise showing a short Hibi test notification and returning `true`. Clear scheduler timers on `before-quit`.

- [ ] **Step 3: Run build/type verification for the bridge.**

  Run: `npm run build`

  Expected: TypeScript and Vite complete successfully with the new global bridge types.

### Task 4: Sync App state and expose the Settings test action

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/ui/SettingsView.tsx`
- Create: `src/ui/__tests__/notifications-settings.test.tsx`
- Modify: `package.json`

- [ ] **Step 1: Add the Settings render assertion before UI changes.**

  Add a focused Settings test that asserts the native notification test action label is rendered. Keep the existing data-bound view test untouched because it contains unrelated in-progress Goals/Habits changes.

- [ ] **Step 2: Run the focused UI test and verify the intended failure.**

  Run: `npm test -- src/ui/__tests__/notifications-settings.test.tsx`

  Expected: FAIL because Settings has no native notification test action yet.

- [ ] **Step 3: Add App synchronization and Settings action.**

  In `App`, call `buildNotificationEntries(data)` from an effect guarded by the optional bridge. This automatically re-syncs after repository mutations, reset, persisted-data load, or reminder/task status changes. Pass an async `onTestNotification` callback to Settings that invokes the bridge, logs `pass` or `unsupported`, and does not throw in browser mode. Add a “Native notifications” Settings row with a “Send test notification” button.

- [ ] **Step 4: Include the Node scheduler suite in `npm test`.**

  Change the script from `vitest run src` to `vitest run src && node --test electron/notifications.test.cjs`, keeping the existing test behavior and adding the main-process coverage.

- [ ] **Step 5: Run focused tests and verify they pass.**

  Run: `npm test -- src/ui/__tests__/notifications-settings.test.tsx`

  Expected: PASS with the new Settings action assertion.

### Task 5: Full verification and commit

**Files:**
- Include: `docs/superpowers/specs/2026-09-06-native-macos-notifications-design.md`
- Include: `docs/superpowers/plans/2026-09-06-native-macos-notifications.md`
- Include: all implementation and test files from Tasks 1–4
- Exclude: every Goals/Habits file

- [ ] **Step 1: Run the complete verification set.**

  Run: `npm test && npm run build && git diff --check`

  Expected: all Vitest and Node tests pass, TypeScript/Vite build exits 0, and diff check reports no whitespace errors.

- [ ] **Step 2: Inspect changed paths for scope.**

  Run: `git status --short` and `git diff --stat`; confirm only notification code, Settings/App/preload/main/types, tests, package script, and the new design/plan docs are present. Confirm no path containing `Goals` or `Habits` is listed.

- [ ] **Step 3: Commit the scoped implementation.**

  Run: `git add docs/superpowers/specs/2026-09-06-native-macos-notifications-design.md docs/superpowers/plans/2026-09-06-native-macos-notifications.md electron/main.cjs electron/preload.cjs electron/notifications.cjs electron/notifications.test.cjs src/global.d.ts src/App.tsx src/domain/notifications.ts src/domain/__tests__/notifications.test.ts src/ui/SettingsView.tsx src/ui/__tests__/notifications-settings.test.tsx package.json && git commit -m "feat: add native reminder notifications"`

  Expected: a new commit containing only the scoped notification feature and its tests/docs.

## Self-review

- Automatic scheduling is covered by renderer payload derivation, main-process timers, and App snapshot synchronization.
- The test action is covered by Settings rendering and the preload/main return contract.
- IPC is intentionally limited to sync and test methods; existing `info` and login-item APIs remain unchanged.
- One-time, daily, weekly, paused, completed, past, and cancellation behaviors are explicitly bounded.
- No Goals/Habits files are part of the implementation or commit command.
