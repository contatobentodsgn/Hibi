# Notch Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve explicit Confirmar/Cancelar actions from a notch card through a narrow, validated Electron bridge.

**Architecture:** The notch window manager owns the active request and emits a safe action event. Main-process IPC validates IDs and action values before resolving the request. The overlay renders only supplied labels and returns only the selected action ID.

**Tech Stack:** Electron IPC, React, Node test runner, Vitest.

---

### Task 1: Notch manager action contract

**Files:**
- Modify: `electron/notch-window.cjs`
- Test: `electron/notch-window.test.cjs`

- [ ] **Step 1: Write the failing test**

```js
test('resolves only an action belonging to the active presentation', () => {
  const manager = createNotchWindowManager({ /* existing fake dependencies */ });
  manager.show({ requestId: 'confirm-1', kind: 'confirmation', text: 'Create task?', actions: [{ id: 'confirm', label: 'Confirmar' }], interaction: 'capture' });
  assert.equal(manager.resolveAction('other', 'confirm'), false);
  assert.equal(manager.resolveAction('confirm-1', 'confirm'), true);
});
```

- [ ] **Step 2: Run the focused test and verify it fails because `resolveAction` is absent.**

Run: `node --test electron/notch-window.test.cjs`

- [ ] **Step 3: Add `onAction` dependency and `resolveAction(requestId, actionId)`**

```js
resolveAction(requestId, actionId) {
  const target = getWindow();
  if (!target || requestId !== activeRequestId || !activeActions.has(actionId)) return false;
  onAction?.({ requestId, actionId });
  target.hide(); activeRequestId = null; activeActions = new Set();
  return true;
}
```

- [ ] **Step 4: Re-run the focused test and verify it passes.**

- [ ] **Step 5: Commit the manager change.**

### Task 2: Narrow preload and main-process IPC

**Files:**
- Modify: `electron/main.cjs`
- Modify: `electron/preload.cjs`
- Modify: `src/global.d.ts`
- Test: `electron/notch-window.test.cjs`

- [ ] **Step 1: Add a failing manager-level assertion that invalid action IDs are not forwarded.**
- [ ] **Step 2: Add `hibi:notch:action` IPC that accepts only a bounded request ID and `confirm` or `cancel`.**
- [ ] **Step 3: Expose `resolveNotchAction(requestId, actionId)` through preload and type it.**
- [ ] **Step 4: Run the Electron tests and verify they pass.**
- [ ] **Step 5: Commit the bridge change.**

### Task 3: Accessible notch card

**Files:**
- Modify: `src/ui/NotchOverlay.tsx`
- Test: `src/ui/NotchOverlay.test.tsx`

- [ ] **Step 1: Add a failing test requiring a confirmation dialog to call `resolveNotchAction` with the chosen action.**
- [ ] **Step 2: Render action buttons with `type="button"`, an accessible dialog label and the narrow bridge call.**
- [ ] **Step 3: Keep Escape disabled while actions exist and preserve passive Escape dismissal.**
- [ ] **Step 4: Run the focused renderer test and then all tests.**
- [ ] **Step 5: Commit the overlay change.**
