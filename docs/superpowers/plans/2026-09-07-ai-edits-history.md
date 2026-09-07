# AI Edits and History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add confirmed AI edits/deletions for workspace entities and a private local audit history for AI activity.

**Architecture:** The existing renderer-local tool registry owns changes to local data. Updates are reversible, deletions destructive, and both require the existing one-time confirmation policy. `AiTurnRuntime` emits a bounded audit stream containing only provider/model identifiers, tool names, decisions, summaries, and errors; the application persists this stream locally and displays it in Instrumentation.

**Tech Stack:** React, TypeScript, Vitest, localStorage, Electron-safe renderer.

---

### Task 1: Confirmed edit and delete tools

**Files:** `src/ai/local-runtime.ts`, `src/ai/__tests__/local-runtime.test.ts`

- [ ] Add failing tests for task and reminder update/delete operations requiring confirmation.
- [ ] Register validated `task.update`, `task.delete`, `reminder.update`, `reminder.delete`, and equivalent block/note operations.
- [ ] Verify each operation changes only the selected local entity after approval.

### Task 2: Bounded AI audit stream

**Files:** `src/ai/history.ts`, `src/ai/runtime.ts`, `src/ai/__tests__/history.test.ts`, `src/ai/__tests__/runtime.test.ts`

- [ ] Add failing tests for request, confirmation, cancellation, execution, error, provider and model history events.
- [ ] Emit sanitized events from runtime and exclude call arguments, request text, and secrets.
- [ ] Keep the history capped to protect local storage.

### Task 3: Persist and display history

**Files:** `src/App.tsx`, `src/ui/TabyView.tsx`, `src/ui/InstrumentationView.tsx`, associated tests.

- [ ] Store bounded audit history locally and expose it in Instrumentation.
- [ ] Render provider, model, requested tools, decision, result, cancellation and error summaries.
- [ ] Verify full suite, production build, parity and renderer safety before merge.
