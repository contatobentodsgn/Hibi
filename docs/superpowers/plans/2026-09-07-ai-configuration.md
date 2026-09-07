# AI Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configure an AI provider, endpoint and model while storing API credentials only in the macOS Keychain.

**Architecture:** Electron owns Keychain and non-secret preference persistence. The renderer consumes only redacted status through constrained IPC and labels each assistant response with its runtime model.

**Tech Stack:** Electron, React, TypeScript, public macOS Keychain Services, Vitest and Node test runner.

---

### Task 1: Main-process secret boundary

**Files:** `electron/ai-config.cjs`, `electron/ai-config.test.cjs`, `electron/main.cjs`, `electron/preload.cjs`

- [x] Test that JSON preferences exclude API keys.
- [x] Validate providers and HTTPS/loopback endpoints.
- [x] Save and remove secrets through Keychain only, submitting secrets through standard input rather than process arguments.
- [x] Expose redacted configuration IPC and refresh the main-process AI client after changes.

### Task 2: Settings screen

**Files:** `src/ui/SettingsView.tsx`, `src/ui/__tests__/AiSettings.test.tsx`, `src/global.d.ts`

- [x] Add an AI settings tab with provider, endpoint, model and Keychain credential controls.
- [x] Prevent local mode from accepting a credential.
- [x] Display whether a credential is stored without returning its value.

### Task 3: Model provenance

**Files:** `src/ui/TabyView.tsx`, `src/ui/__tests__/TabyView.test.tsx`

- [x] Prefer provider metadata model labels with a provider-label fallback.
- [x] Render the model beneath assistant messages.

### Task 4: Verification

- [ ] Run complete automated, build, parity and renderer-safety checks.
- [ ] Inspect the final diff and integrate the feature branch.
