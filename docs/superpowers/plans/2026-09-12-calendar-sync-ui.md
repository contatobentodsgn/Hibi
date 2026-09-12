# Calendar Sync UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the renderer interface for secure Google and Apple/iCloud calendar synchronization once the main-process bridge is available.

**Architecture:** The renderer consumes a serializable `CalendarSyncState` and emits intent callbacks only. It has no provider SDK, token, event body or direct write logic. The Electron/data implementation remains a separate Claude-owned deliverable described in issue #48.

**Tech Stack:** React 19, TypeScript, CSS custom properties, Vitest static rendering, Playwright.

---

### Task 1: Define the renderer contract

**Files:**
- Create: `src/ui/calendar-sync.ts`
- Create: `src/ui/__tests__/calendar-sync.test.ts`

- [ ] Write a failing test that accepts only `apple` and `google`, safe calendar modes, and a conflict with a bounded summary.
- [ ] Run the focused test and confirm the contract is absent.
- [ ] Add serializable renderer-only types: `CalendarSyncState`, `CalendarSyncSource`, `CalendarSyncCalendar`, `CalendarSyncConflict` and `CalendarSyncMode`.
- [ ] Re-run the focused test and prove it passes; mutate an accepted provider and observe the test fail.

### Task 2: Build the connected-calendar panel

**Files:**
- Create: `src/ui/CalendarSyncPanel.tsx`
- Create: `src/ui/calendar-sync.css`
- Create: `src/ui/__tests__/CalendarSyncPanel.test.tsx`

- [ ] Write a failing static-render test for provider state, selected calendar controls, a last-sync label, safe error, and a conflict action.
- [ ] Run it and confirm it fails before the panel exists.
- [ ] Implement the panel with accessible grouped controls and callbacks for connection, mode selection, sync and conflict resolution.
- [ ] Add responsive styles that preserve theme and tint tokens; re-run the test and prove it passes.
- [ ] Mutate a conflict button to remove its accessible label, observe failure, then restore it.

### Task 3: Mount only after the bridge contract lands

**Files:**
- Modify: `src/ui/IntegrationsView.tsx` (single new component mount and bridge consumption)
- Modify: `src/i18n/dictionary.ts` (additive `calendar.*` block only)
- Create: `tests/e2e/calendar-sync-ui.spec.ts`

- [ ] Wait for the Claude-owned IPC/data contract in issue #48 and inspect its exact exported payload.
- [ ] Write a failing e2e test with a safe desktop bridge fake: select a calendar, change its mode, request a sync and resolve a conflict.
- [ ] Mount the panel and wire only the documented bridge calls.
- [ ] Re-run e2e and mutate the sync callback to prove no operation is silently skipped.

### Task 4: Verify and publish

- [ ] Run `npm test`, `TZ=Pacific/Kiritimati npm test`, `npm run parity:check`, `npm run safety:renderer`, `npx tsc --noEmit`, `npm run build`, and `HIBI_E2E_PORT=4380 npx playwright test`, checking every exit code.
- [ ] Rebase on `origin/main`, repeat the battery if source changed, then open one PR with the required proofs and shared-file lines.
