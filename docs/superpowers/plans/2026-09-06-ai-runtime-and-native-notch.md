# AI Runtime and Native Notch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a provider-neutral AI runtime and a deterministic macOS notch companion to Hibi without executing extracted runtime code.

**Architecture:** The renderer calls a narrow Electron bridge. The main process owns provider credentials, provider execution, policy, tool dispatch, and the notch window. A pure TypeScript companion reducer and geometry module keep the behavior testable without Electron or macOS.

**Tech Stack:** TypeScript, React 19, Electron 44, Vitest, Node test runner, Playwright, optional Node-API Objective-C++ bridge.

---

## File map

- `src/ai/contracts.ts` — provider, proposal, tool, policy, and turn result types.
- `src/ai/provider-parser.ts` — strict parsing and size limits for provider output.
- `src/ai/heuristic-provider.ts` — deterministic provider over local `StudyData`.
- `src/ai/policy.ts` — deterministic action policy and confirmation binding.
- `src/ai/runtime.ts` — turn orchestration independent of Electron.
- `src/companion/contracts.ts` — companion events, state, and presentation types.
- `src/companion/reducer.ts` — priority and state-transition reducer.
- `electron/notch-geometry.cjs` — display selection, scaling, bounds, and hot-zone logic.
- `electron/notch-window.cjs` — singleton overlay window lifecycle and click-through rules.
- `electron/ai-runtime.cjs` — main-process OpenAI-compatible provider and IPC validation.
- `electron/preload.cjs` — narrow AI/notch APIs and subscriptions.
- `src/ui/NotchOverlay.tsx` — overlay renderer.
- `src/ui/TabyView.tsx` — runtime-backed assistant UI.
- `native/notch/` — optional Hibi-owned native promotion bridge.

### Task 1: Provider-neutral AI contracts and parser

**Files:**
- Create: `src/ai/contracts.ts`
- Create: `src/ai/provider-parser.ts`
- Test: `src/ai/__tests__/provider-parser.test.ts`

- [ ] **Step 1: Write failing parser tests**

Test a valid proposal, rejection of unknown tools, more than two tool calls, oversized replies, and malformed JSON. Use an allowed-tool set supplied to `parseProviderProposal` so the parser has no repository dependency.

```ts
expect(parseProviderProposal('{"reply":"Done","toolCalls":[]}', new Set(['create_task']))).toEqual({
  reply: 'Done', toolCalls: [], notchPresentation: null,
});
expect(() => parseProviderProposal('{"reply":"x","toolCalls":[{"name":"shell","arguments":{}}]}', new Set())).toThrow(/Unknown tool/);
```

- [ ] **Step 2: Verify failure**

Run `npx vitest run src/ai/__tests__/provider-parser.test.ts`. Expected: module-not-found failure.

- [ ] **Step 3: Implement contracts and parser**

Define `AiSurface`, `AiTurnStage`, `AiToolCall`, `AiProviderRequest`, `AiProviderProposal`, `AiProvider`, `AiPolicyDecision`, and `AiTurnResult`. Parse JSON as `unknown`, require a non-empty reply of at most 8,000 characters, allow at most two calls, require plain-object arguments, and limit notch text to 240 characters.

```ts
export interface AiProvider {
  id: string;
  label: string;
  generate(request: AiProviderRequest, signal: AbortSignal): Promise<AiProviderProposal>;
}
```

- [ ] **Step 4: Verify and commit**

Run `npx vitest run src/ai/__tests__/provider-parser.test.ts`; expected all tests pass. Commit with `git commit -m "Add provider-neutral AI contracts"`.

### Task 2: Companion contracts and deterministic reducer

**Files:**
- Create: `src/companion/contracts.ts`
- Create: `src/companion/reducer.ts`
- Test: `src/companion/__tests__/reducer.test.ts`

- [ ] **Step 1: Write reducer tests**

Cover idle → listening → thinking → result, confirmation priority over focus, stale request dismissal, animation-only click-through, interactive pointer capture, expiry, and reduced-motion presentation.

```ts
const listening = reduceCompanion(initialCompanionState, { type: 'ai.stage', requestId: 'a', stage: 'listening' });
expect(listening.kind).toBe('listening');
expect(listening.interaction).toBe('passthrough');
```

- [ ] **Step 2: Verify failure**

Run `npx vitest run src/companion/__tests__/reducer.test.ts`. Expected: module-not-found failure.

- [ ] **Step 3: Implement the reducer**

Use a total switch over typed events. Store `requestId`, `kind`, `priority`, `animation`, `text`, `actions`, `interaction`, and `expiresAtMs`. Ignore dismiss/ended events whose request ID differs from the active presentation.

- [ ] **Step 4: Verify and commit**

Run the reducer tests and commit with `git commit -m "Add deterministic companion state machine"`.

### Task 3: Tool registry, policy, and confirmation binding

**Files:**
- Create: `src/ai/tools.ts`
- Create: `src/ai/policy.ts`
- Test: `src/ai/__tests__/policy.test.ts`

- [ ] **Step 1: Write policy tests**

Assert that searches are automatic, explicit reversible single mutations may execute, delete/bulk/external actions require confirmation, unknown tools are blocked, and a token cannot approve modified arguments or be reused.

- [ ] **Step 2: Verify failure**

Run `npx vitest run src/ai/__tests__/policy.test.ts`. Expected: module-not-found failure.

- [ ] **Step 3: Implement policy and binding**

Create a registry containing tool name, risk, validator, and executor. Generate confirmations from a SHA-256 digest of normalized tool calls plus a random nonce and expiry. Keep consumed confirmation IDs in memory.

```ts
export type ToolRisk = 'read' | 'reversible' | 'destructive' | 'external';
export type PolicyOutcome = { kind: 'execute' } | { kind: 'confirm'; confirmation: Confirmation } | { kind: 'blocked'; reason: string };
```

- [ ] **Step 4: Verify and commit**

Run policy tests and commit with `git commit -m "Add AI tool policy and confirmations"`.

### Task 4: Runtime orchestration and heuristic provider

**Files:**
- Create: `src/ai/context.ts`
- Create: `src/ai/heuristic-provider.ts`
- Create: `src/ai/runtime.ts`
- Test: `src/ai/__tests__/runtime.test.ts`

- [ ] **Step 1: Write runtime tests**

Use fake providers and tools. Cover minimal context selection, stage events, successful read, confirmation return, sequential calls, partial failure truthfulness, cancellation before execution, and provider label propagation.

- [ ] **Step 2: Verify failure**

Run `npx vitest run src/ai/__tests__/runtime.test.ts`. Expected: module-not-found failure.

- [ ] **Step 3: Implement runtime**

`runTurn` normalizes input, selects evidence by intent, emits stages, calls the provider, parses the proposal, applies policy, executes tools sequentially, and returns actual results. The heuristic adapter wraps existing local response logic and returns no unsafe calls.

- [ ] **Step 4: Verify and commit**

Run runtime tests and commit with `git commit -m "Add provider-neutral AI turn runtime"`.

### Task 5: Notch geometry and Electron fallback window

**Files:**
- Create: `electron/notch-geometry.cjs`
- Create: `electron/notch-window.cjs`
- Test: `electron/notch-geometry.test.cjs`
- Test: `electron/notch-window.test.cjs`

- [ ] **Step 1: Write geometry/window tests**

Cover 392 × 296 base size, auto-scale clamp 0.78–0.94, top-center bounds using display bounds on macOS, selected-display fallback, hot-zone clamps, all-Spaces setup, click-through, request-ID guard, and teardown.

- [ ] **Step 2: Verify failure**

Run `node --test electron/notch-geometry.test.cjs electron/notch-window.test.cjs`. Expected: module-not-found failure.

- [ ] **Step 3: Implement pure geometry and injected window manager**

The manager receives `BrowserWindowClass`, `screen`, preload path, URL loader, and optional native bridge. It never imports the renderer repository and validates presentation payloads before forwarding them.

- [ ] **Step 4: Verify and commit**

Run Node tests and commit with `git commit -m "Add Electron notch window fallback"`.

### Task 6: Main-process AI adapter and secure bridge

**Files:**
- Create: `electron/ai-runtime.cjs`
- Modify: `electron/main.cjs`
- Modify: `electron/preload.cjs`
- Modify: `src/global.d.ts`
- Test: `electron/ai-runtime.test.cjs`

- [ ] **Step 1: Write IPC/provider tests**

Inject `fetch`, validate loopback/HTTPS endpoint URLs, redact authorization headers from errors, enforce a 30-second timeout and 1 MiB response bound, reject invalid renderer payloads, and verify cancellation.

- [ ] **Step 2: Verify failure**

Run `node --test electron/ai-runtime.test.cjs`. Expected: module-not-found failure.

- [ ] **Step 3: Implement adapter and bridge**

Store endpoint/model/key in main-process memory for this slice. Expose `runAiTurn`, `cancelAiTurn`, `getCompanionState`, `showNotch`, `hideNotch`, and state subscriptions. Keep arbitrary IPC and bounds setters unavailable.

- [ ] **Step 4: Verify and commit**

Run Node tests and commit with `git commit -m "Add secure AI and notch IPC bridge"`.

### Task 7: Overlay renderer and assistant integration

**Files:**
- Create: `src/ui/NotchOverlay.tsx`
- Create: `src/ui/notch-overlay.css`
- Modify: `src/main.tsx`
- Modify: `src/ui/TabyView.tsx`
- Modify: `src/App.tsx`
- Test: `src/ui/__tests__/NotchOverlay.test.tsx`
- Test: `tests/e2e/ai-notch.spec.ts`

- [ ] **Step 1: Write renderer tests**

Test state labels, semantic media lookup, buttons, keyboard dismissal, reduced motion, and click-through updates. E2E should submit a heuristic turn, observe thinking/result states, and reopen the complete reply in Taby.

- [ ] **Step 2: Verify failure**

Run `npx vitest run src/ui/__tests__/NotchOverlay.test.tsx`. Expected: module-not-found failure.

- [ ] **Step 3: Implement renderer integration**

Choose overlay mode from a query parameter. Subscribe to companion state once, render semantic assets only through the existing registry, send interaction preference when controls appear, and keep full answers in `TabyView`.

- [ ] **Step 4: Verify and commit**

Run renderer and E2E tests, then commit with `git commit -m "Connect AI runtime to notch overlay"`.

### Task 8: Optional Hibi-owned native macOS promotion bridge

**Files:**
- Create: `native/notch/package.json`
- Create: `native/notch/binding.gyp`
- Create: `native/notch/index.cjs`
- Create: `native/notch/src/notch.mm`
- Modify: `electron/notch-window.cjs`
- Test: `native/notch/index.test.cjs`

- [ ] **Step 1: Write bridge contract tests**

Verify that the loader reports `available: false` without a compiled addon and that the window manager stays in degraded mode. On macOS CI with a built addon, verify invalid handles/frames throw without crashing.

- [ ] **Step 2: Implement the documented AppKit path**

Resolve the `NSWindow` from Electron's native handle, apply borderless/transparent/non-movable configuration, use a documented high window level and collection behavior, and convert Electron top-left coordinates to AppKit bottom-left coordinates. Do not include private CGS/SkyLight calls in the default build.

- [ ] **Step 3: Build and verify**

Run `npm install --prefix native/notch`, `npm run build --prefix native/notch`, and `node --test native/notch/index.test.cjs`. Expected: contract tests pass; the addon build is optional outside macOS development environments.

- [ ] **Step 4: Commit**

Commit with `git commit -m "Add documented AppKit notch promotion bridge"`.

### Task 9: Full verification and documentation

**Files:**
- Modify: `scripts/parity-check.mjs`
- Modify: `scripts/renderer-safety-check.mjs`
- Modify: `docs/local-capability-contracts.md`
- Modify: `docs/security-review.md`
- Modify: `docs/parity-audit.md`

- [ ] **Step 1: Expand release gates**

Require AI contracts, policy, companion reducer, notch geometry, secure IPC, and an explicit degraded/native capability status. Continue rejecting extracted runtime/native references from renderer source.

- [ ] **Step 2: Run complete verification**

Run `npm run audit`, `npm run safety:renderer`, `npm run check:companion-assets`, `npm audit --omit=dev`, and native contract tests. Expected: all checks pass and zero production dependency vulnerabilities.

- [ ] **Step 3: Perform macOS manual matrix**

Verify hardware-notch Mac, non-notch Mac, external display, full-screen Space, pointer pass-through, interactive capture, sleep/wake, and display reconnect. Record actual/degraded capability in `docs/parity-audit.md`.

- [ ] **Step 4: Commit and push**

Commit with `git commit -m "Document AI runtime and notch capability"` and push `main` after the worktree is clean.
