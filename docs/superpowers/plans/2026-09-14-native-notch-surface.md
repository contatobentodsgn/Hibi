# Native Notch Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Present Hibi's startup companion on a native macOS panel that is anchored to the physical top of the MacBook display and can draw above the menu bar.

**Architecture:** Keep Electron as the application and confirmation controller. Replace only the passive startup surface with an `NSPanel` selected by the display that has a camera housing; the panel owns the black companion shape and a small native animated face. Electron remains the fallback for interactive confirmation cards.

**Tech Stack:** Electron main process, Node-API C++/Objective-C++, AppKit, `node:test`.

---

### Task 1: Make the native panel own the startup surface

**Files:**
- Modify: `electron/notch-startup.cjs`
- Modify: `electron/notch-window.test.cjs`
- Test: `electron/notch-startup.test.cjs`

- [ ] **Step 1: Write the failing startup-host assertion**

```js
assert.equal(STARTUP_PRESENTATION.host, 'native');
```

- [ ] **Step 2: Run the narrow test**

Run: `node --test electron/notch-startup.test.cjs`

Expected: fail because startup uses the Electron surface.

- [ ] **Step 3: Route only the startup presentation to the native host**

```js
host: 'native',
```

- [ ] **Step 4: Verify the manager uses the native host for startup**

```js
assert.equal(result.host, 'native');
```

- [ ] **Step 5: Run the narrow suite**

Run: `node --test electron/notch-window.test.cjs electron/notch-startup.test.cjs`

Expected: pass.

### Task 2: Render a full native companion at the physical display edge

**Files:**
- Modify: `native/notch/src/notch.mm`
- Test: `native/notch/host.test.cjs`

- [ ] **Step 1: Write a diagnostic assertion for the physical camera display**

```js
assert.equal(bridge.showHost(passive('startup-notch'), cameraDisplay.displayId), true);
assert.equal(bridge.hostDiagnostics().displayId, cameraDisplay.displayId);
```

- [ ] **Step 2: Run the narrow native suite**

Run: `node --test native/notch/host.test.cjs`

Expected: fail until the panel reports the selected display consistently.

- [ ] **Step 3: Use a borderless `NSPanel` at screen-saver level**

```objc
panel.level = NSScreenSaverWindowLevel + 1;
NSRect frame = NSMakeRect(NSMidX(screen.frame) - kHostWidth / 2.0,
                          NSMaxY(screen.frame) - height,
                          kHostWidth, height);
[gPanel setFrame:frame display:YES animate:NO];
[gPanel orderFrontRegardless];
```

- [ ] **Step 4: Draw the native companion face**

```objc
// black panel with rounded lower corners; two white eyes and a curved smile
// are redrawn on a short repeating timer without accepting mouse or keyboard focus.
```

- [ ] **Step 5: Run the native suite**

Run: `npm run native:build && node --test native/notch/host.test.cjs`

Expected: pass.

### Task 3: Preserve the MacBook-first contract and interactive fallback

**Files:**
- Modify: `electron/notch-window.cjs`
- Modify: `electron/notch-window.test.cjs`

- [ ] **Step 1: Write the failing MacBook-first test**

```js
assert.deepEqual(calls, [macbook.id]);
```

- [ ] **Step 2: Ensure startup ignores any saved external-display preference**

```js
preferredDisplayId: activeRequestId === 'startup-notch' ? null : preferredDisplayId,
```

- [ ] **Step 3: Keep cards with actions on the Electron overlay**

```js
if (activeActions.size > 0) return false;
```

- [ ] **Step 4: Run the manager tests**

Run: `node --test electron/notch-window.test.cjs electron/notch-startup.test.cjs`

Expected: pass.

### Task 4: Rebuild and visually validate

**Files:**
- Modify: none

- [ ] **Step 1: Build and start the desktop app**

Run: `npm run desktop`

Expected: the startup companion is visible at the top of the internal display.

- [ ] **Step 2: Confirm size and placement**

Check that the panel touches the top screen edge, covers the menu-bar area, remains centered over the hardware camera, and does not open on the external display.

- [ ] **Step 3: Run targeted verification**

Run: `npm run native:build && node --test electron/notch-window.test.cjs electron/notch-startup.test.cjs native/notch/host.test.cjs`

Expected: pass.
