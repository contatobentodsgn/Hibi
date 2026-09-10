# Production AI and Integrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver streaming, resilient, transparent configured AI and a secure extensible integration platform for Hibi.

**Architecture:** Electron owns remote transport, secrets, retry policy, OAuth, connector execution, and the local-only API host. React receives bounded status/events through preload; the existing AI policy remains the only gateway for actions. Connectors share typed transport, audit, confirmation, and import contracts.

**Tech Stack:** React, TypeScript, Electron IPC, Node fetch/SSE, macOS Keychain, Vitest, Node test runner.

---

### Task 1: Production AI contracts

**Files:**
- Modify: `src/ai/contracts.ts`
- Create: `src/ai/production.ts`
- Test: `src/ai/__tests__/production.test.ts`

- [ ] Write failing tests for normalized provider usage (`prompt_tokens` plus `completion_tokens`), 429 Retry-After classification, 401 invalid credentials, unavailable timeout, and fast/balanced/reasoning model presets.
- [ ] Run `npx vitest run src/ai/__tests__/production.test.ts`; confirm failure is due to missing production helpers.
- [ ] Add stream events, usage, safe failure, fallback policy, and model preset types. Implement bounded token normalization, Retry-After parsing, `min(1000 * 2 ** attempt, 4000)` backoff, and deterministic error classification.
- [ ] Run `npx vitest run src/ai/__tests__/production.test.ts && npx tsc --noEmit`.
- [ ] Commit `feat: define production AI transport contracts`.

### Task 2: Main-process streaming, retry, and classified failure

**Files:**
- Modify: `electron/ai-runtime.cjs`
- Modify: `electron/ai-runtime.test.cjs`
- Modify: `electron/main.cjs`
- Modify: `electron/preload.cjs`

- [ ] Write failing Node tests for SSE deltas/usage, JSON fallback, 401 no-retry, 429 Retry-After once, unavailable retry twice, and abort closing the reader.
- [ ] Run `node --test electron/ai-runtime.test.cjs`; confirm the present single-response client fails the new cases.
- [ ] Request `stream: true`, parse bounded `data:` SSE frames, keep JSON fallback, send sanitized request-scoped stream events to only the initiating webContents, classify failures, and retry generation transport only. Never retry tools or mutations.
- [ ] Expose `onAiStreamEvent(callback)` through preload with removal and strict event/request-ID bounds.
- [ ] Run `node --test electron/ai-runtime.test.cjs electron/main.test.cjs` and commit `feat: stream and harden configured AI transport`.

### Task 3: Renderer stream assembly, cancellation, and fallback policy

**Files:**
- Modify: `src/ai/electron-provider.ts`
- Modify: `src/ai/runtime.ts`
- Modify: `src/ai/__tests__/electron-provider.test.ts`
- Modify: `src/ai/__tests__/runtime.test.ts`

- [ ] Write failing tests proving deltas arrive before final parsing, cancellation never falls back, automatic fallback occurs only for retryable failure, and results contain actual provider/model/usage/fallback metadata.
- [ ] Run `npx vitest run src/ai/__tests__/electron-provider.test.ts src/ai/__tests__/runtime.test.ts` and verify failure.
- [ ] Subscribe by request ID, assemble live text without bypassing final structured-proposal validation, extend `AiRuntimeResult`, and implement `ask | automatic | never` fallback behavior.
- [ ] Run focused tests plus `npx tsc --noEmit`; commit `feat: assemble AI streams with truthful fallback`.

### Task 4: Safe usage ledger and model selection

**Files:**
- Create: `src/ai/usage.ts`
- Modify: `src/ai/history.ts`
- Modify: `src/App.tsx`
- Test: `src/ai/__tests__/usage.test.ts`
- Modify: `src/ui/SettingsView.tsx`
- Modify: `src/ui/__tests__/AiSettings.test.tsx`

- [ ] Write failing tests for bounded local usage retention, known-cost estimation, absent cost for unknown models, prompt/secret exclusion, custom model fallback, and preset selection.
- [ ] Run `npx vitest run src/ai/__tests__/usage.test.ts src/ui/__tests__/AiSettings.test.tsx`; verify failure.
- [ ] Persist sanitized usage records containing provider, model, tokens, known estimate, outcome, and fallback only. Add fallback-policy and recommended/custom model controls.
- [ ] Run focused tests and `npx tsc --noEmit`; commit `feat: record AI usage and guide model selection`.

### Task 5: Assistant streaming and error interface

**Files:**
- Modify: `src/ui/TabyView.tsx`
- Modify: `src/global.d.ts`
- Create: `src/ui/__tests__/TabyView.test.tsx`

- [ ] Write failing UI tests for live text, Stop, cancelled state, retry/fallback prompt, 401/rate-limit/unavailable actions, and provider/model/usage provenance on every final response.
- [ ] Run `npx vitest run src/ui/__tests__/TabyView.test.tsx`; verify failure.
- [ ] Render request-scoped live messages, accessible status, Stop, retry/fallback card, classified safe errors, and provenance chips. Keep all actions below the visual-only notch.
- [ ] Run UI tests and `npx tsc --noEmit`; commit `feat: show streaming AI state and provenance`.

### Task 6: Integration connector core

**Files:**
- Create: `src/integrations/contracts.ts`
- Create: `src/integrations/registry.ts`
- Create: `electron/integrations.cjs`
- Create: `electron/integrations.test.cjs`
- Modify: `electron/main.cjs`
- Modify: `electron/preload.cjs`
- Modify: `src/global.d.ts`

- [ ] Write failing tests for secret-free status, Keychain-only credential references, HTTPS allowlist, bounded remote fetch, redacted audit, and execution blocked without confirmation.
- [ ] Run `node --test electron/integrations.test.cjs`; verify failure.
- [ ] Define connector capability/state/error/import/action/audit contracts. Implement registry, Keychain secret references, safe fetch, refresh/revoke, audit, prepared actions, confirmed execution, and narrow IPC.
- [ ] Run `node --test electron/integrations.test.cjs && npx tsc --noEmit`; commit `feat: add secure integration connector core`.

### Task 7: Notion, Slack, and email adapters

**Files:**
- Create: `electron/connectors/notion.cjs`
- Create: `electron/connectors/slack.cjs`
- Create: `electron/connectors/email.cjs`
- Create: `electron/connectors/connectors.test.cjs`
- Modify: `electron/integrations.cjs`

- [ ] Write local fixture-server tests for Notion page normalization without body, Slack message prepare-not-post, flagged email header import, and approved-only send.
- [ ] Run `node --test electron/connectors/connectors.test.cjs`; verify failure.
- [ ] Implement OAuth PKCE descriptors, least-data imports, remote ID/revision tracking, and prepared create/update/post/send actions. Do not embed vendor client secrets.
- [ ] Run connector/core tests; commit `feat: add Notion Slack and email connectors`.

### Task 8: Import, sharing, webhooks, and remote notifications

**Files:**
- Create: `src/integrations/imports.ts`
- Create: `src/integrations/shares.ts`
- Create: `src/integrations/__tests__/imports.test.ts`
- Create: `electron/webhooks.cjs`
- Create: `electron/webhooks.test.cjs`
- Create: `electron/connectors/remote-notifications.cjs`
- Modify: `electron/integrations.cjs`

- [ ] Write failing tests for remote-ID deduplication, keep-local/keep-remote/duplicate/skip decisions, expiring read-only share scope, invalid/replayed HMAC webhook rejection, and approved-only remote notification delivery.
- [ ] Run `npx vitest run src/integrations/__tests__/imports.test.ts && node --test electron/webhooks.test.cjs`; verify failure.
- [ ] Implement CSV/JSON/ICS preview, conflict resolution, signed expiry shares, loopback HMAC webhook receiver with nonce/timestamp/body bounds, and confirmation-gated notification connector.
- [ ] Run focused tests; commit `feat: add safe imports shares webhooks and remote notifications`.

### Task 9: Loopback public API

**Files:**
- Create: `electron/local-api.cjs`
- Create: `electron/local-api.test.cjs`
- Modify: `electron/main.cjs`
- Modify: `electron/integrations.cjs`

- [ ] Write failing tests for loopback-only binding, revocable Keychain bearer token, rate/body limits, OpenAPI JSON, read endpoints, and destructive writes returning confirmation rather than executing.
- [ ] Run `node --test electron/local-api.test.cjs`; verify failure.
- [ ] Implement local-only HTTP server, token lifecycle, OpenAPI endpoint, bounded read endpoints, and confirmation-routed write intents.
- [ ] Run server/core tests; commit `feat: add local Hibi public API`.

### Task 10: Integrations UI and live-provider verification

**Files:**
- Create: `src/ui/IntegrationsView.tsx`
- Create: `src/ui/__tests__/IntegrationsView.test.tsx`
- Modify: `src/ui/SettingsView.tsx`
- Modify: `src/App.tsx`
- Create: `scripts/test-live-providers.mjs`
- Create: `scripts/test-live-providers.test.mjs`
- Modify: `package.json`
- Create: `docs/provider-live-test.md`

- [ ] Write failing tests for connection state without secrets, confirmation before remote action, import conflicts, and live harness refusal without explicit opt-in and allowlisted endpoint.
- [ ] Run `npx vitest run src/ui/__tests__/IntegrationsView.test.tsx && node --test scripts/test-live-providers.test.mjs`; verify failure.
- [ ] Build settings UI with connect/revoke/refresh/import/audit/API/webhook/notification controls. Add `test:providers:live`, requiring `HIBI_LIVE_PROVIDER_TEST=1`, sandbox endpoint/model/key, and producing a redacted stream/cancel/provenance report.
- [ ] Run focused tests; commit `feat: manage integrations and verify live providers`.

### Task 11: Full verification and documentation

**Files:**
- Modify: `docs/local-capability-contracts.md`
- Modify: `docs/security-review.md`
- Modify: `docs/parity-audit.md`
- Modify: `docs/release-readiness.md`

- [ ] Run `npm run build && npm test && npm run test:e2e`.
- [ ] Run `npm run release:preflight`, then inspect renderer, backups, and exports for API-key, authorization, refresh-token, or access-token serialization paths.
- [ ] Document offline behavior, confirmation requirements, Keychain handling, sandbox live tests, and unavailable remote deployment configurations.
- [ ] Commit `docs: record AI and integration production boundaries`.
