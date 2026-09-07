# Native AppKit Notch Host Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unreliable Electron overlay host with a public-API AppKit `NSPanel` that presents compact Hibi companion cards and returns confirmation actions safely.

**Architecture:** Electron remains the coordinator for presentation validation, request ownership, and the fallback BrowserWindow. The public native adapter owns a singleton `NSPanel`, positions it from the selected `NSScreen` rather than Electron coordinate conversions, and invokes a narrowly scoped action callback. The fallback remains active whenever the compiled native host is unavailable.

**Tech Stack:** Electron main process, Node-API C++, Objective-C++/AppKit, node:test.

---

### Task 1: Define the native-host adapter contract

**Files:**
- Modify: `native/notch/adapters/public.cjs`
- Modify: `native/notch/index.test.cjs`

- [ ] **Step 1: Write a failing adapter test** for `nativeHostAvailable`, `createHost`, `showHost`, `hideHost`, `repositionHost`, and `destroyHost`.
- [ ] **Step 2: Run `node --test native/notch/index.test.cjs`** and confirm the new contract fails because these methods are absent.
- [ ] **Step 3: Delegate those methods safely** in the public adapter, always returning `false` when the compiled bridge cannot provide a method.
- [ ] **Step 4: Run the same test** and confirm it passes.

### Task 2: Implement the public AppKit host

**Files:**
- Modify: `native/notch/src/notch.mm`
- Modify: `native/notch/index.test.cjs`

- [ ] **Step 1: Extend the failing capability test** to require native-host methods when the addon is compiled.
- [ ] **Step 2: Build a singleton borderless nonactivating `NSPanel`** with a compact native view, public AppKit collection behavior, safe display selection by `CGDirectDisplayID`, and a callback containing only `requestId` plus `confirm` or `cancel`.
- [ ] **Step 3: Add show, hide, reposition, teardown and diagnostic operations**; panel visibility, selected display ID, frame, interaction state and fallback reason form the authoritative diagnostic state.
- [ ] **Step 4: Rebuild with `npm run native:build` and run native tests.**

### Task 3: Select native host before Electron fallback

**Files:**
- Modify: `electron/notch-window.cjs`
- Modify: `electron/notch-window.test.cjs`

- [ ] **Step 1: Write failing tests** showing that a native-capable adapter avoids creating `BrowserWindow`, preserves request guards, and falls back if host creation fails.
- [ ] **Step 2: Update the manager** so `show`, `hide`, `reposition`, and `destroy` dispatch to the native host when available and otherwise retain current Electron behavior.
- [ ] **Step 3: Run `node --test electron/notch-window.test.cjs`** and verify native and fallback paths pass.

### Task 4: Connect display/power lifecycle and diagnostics

**Files:**
- Modify: `electron/main.cjs`
- Modify: `electron/navigation-policy.test.cjs`

- [ ] **Step 1: Add failing tests** for capability diagnostics exposing the native host state without renderer access to native handles.
- [ ] **Step 2: Subscribe to Electron display metrics/add/remove and power resume** then call manager repositioning; unregister listeners during shutdown.
- [ ] **Step 3: Return native host diagnostics through the existing narrow capabilities IPC.**
- [ ] **Step 4: Run the complete test suite and launch the app for a visual confirmation.**

### Task 5: Document and verify the release-safe contract

**Files:**
- Modify: `docs/notch-adapters.md`
- Modify: `docs/local-capability-contracts.md`

- [ ] **Step 1: Describe `public` as the default documented-AppKit host and keep `experimental` opt-in-only and unavailable in signed packages.**
- [ ] **Step 2: State the manual validation matrix:** built-in notch, non-notch Mac, external screen, Spaces, full screen, sleep/wake, and display reconnection.
- [ ] **Step 3: Verify `npm test`, `npm run build`, and `npm run native:build`; inspect the native host’s diagnostics and a live macOS presentation.**
