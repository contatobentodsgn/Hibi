# Configured AI Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the interactive assistant use the configured OpenAI-compatible provider without exposing secrets, and verify endpoint, credential, and model before configuration is persisted.

**Architecture:** The renderer keeps the authoritative local tool registry, policy, confirmations, and execution. A bounded Electron IPC bridge sends the generated provider request to the main process, which reads the Keychain-only secret and returns raw provider content; the renderer parses it against the real registry schemas before policy evaluation. Saving an external configuration probes the exact candidate credentials before writing preferences or Keychain state.

**Tech Stack:** Electron IPC, React/TypeScript, Node test runner, Vitest, macOS Keychain bridge.

---

### Task 1: Secure configured-provider bridge

**Files:**
- Create: `src/ai/electron-provider.ts`
- Test: `src/ai/__tests__/electron-provider.test.ts`
- Modify: `src/ai/local-runtime.ts`, `src/App.tsx`, `src/global.d.ts`

- [ ] Write failing renderer tests for request forwarding, parser enforcement, model provenance, and local fallback.
- [ ] Implement the provider adapter with a bounded desktop bridge and preserve the renderer-local `ToolRegistry` plus `AiToolPolicy`.
- [ ] Use the adapter in the application runtime so an external configured provider replaces only generation, never validation, confirmation, or execution.

### Task 2: Candidate connection verification

**Files:**
- Modify: `electron/ai-runtime.cjs`, `electron/ai-config.cjs`, `electron/main.cjs`, `electron/preload.cjs`, `src/global.d.ts`, `src/ui/SettingsView.tsx`
- Test: `electron/ai-runtime.test.cjs`, `electron/ai-config.test.cjs`, `src/ui/__tests__/AiSettings.test.tsx`

- [ ] Write failing tests proving the connection probe uses the candidate endpoint, key, and model; failures do not persist settings; and success enables saving.
- [ ] Add a bounded provider probe and candidate runtime configuration that reads an existing Keychain key or uses the submitted transient key without serializing it.
- [ ] Make the save IPC test the candidate before persistence and render clear, actionable status in the settings screen.

### Task 3: Full verification and integration

**Files:**
- Modify: `scripts/parity-check.mjs` if a new safety invariant needs coverage.

- [ ] Run targeted tests after each red/green cycle.
- [ ] Run `npm test`, `npm run build`, `npm run parity:check`, `npm run safety:renderer`, and `git diff --check`.
- [ ] Commit and merge the verified isolated branch into `main`.
