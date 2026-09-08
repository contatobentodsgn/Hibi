const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('uses the reference compact notch proportions for the native panel', () => {
  const source = fs.readFileSync(path.join(__dirname, 'src/notch.mm'), 'utf8');

  assert.match(source, /constexpr CGFloat kHostWidth = 256\.0/);
  assert.match(source, /constexpr CGFloat kPassiveHeight = 38\.0/);
  assert.match(source, /constexpr CGFloat kInteractiveHeight = 190\.0/);
});

test('keeps passive cards non-activating but makes confirmation actions keyboard reachable', () => {
  const source = fs.readFileSync(path.join(__dirname, 'src/notch.mm'), 'utf8');

  assert.match(source, /canBecomeKeyWindow \{ return gInteractive; \}/);
  assert.match(source, /gPanel\.becomesKeyOnlyIfNeeded = NO; \[gPanel makeKeyAndOrderFront:nil\]/);
  assert.match(source, /gPanel\.becomesKeyOnlyIfNeeded = YES; \[gPanel orderFrontRegardless\]/);
  assert.match(source, /gPanel\.styleMask &= ~NSWindowStyleMaskNonactivatingPanel/);
  assert.match(source, /gPanel\.styleMask \|= NSWindowStyleMaskNonactivatingPanel/);
  assert.match(source, /- \(void\)focusFirstAction/);
  assert.match(source, /\[view focusFirstAction\]/);
  assert.match(source, /- \(void\)keyDown:\(NSEvent \*\)event/);
  assert.match(source, /event\.keyCode == 48/);
  assert.match(source, /addLocalMonitorForEventsMatchingMask:NSEventMaskKeyDown/);
  assert.match(source, /removeMonitor:gKeyObserver/);
  assert.match(source, /event\.keyCode == 36 \|\| event\.keyCode == 76/);
  assert.match(source, /\[\(NSButton \*\)gPanel\.firstResponder performClick:nil\]/);
  assert.match(source, /- \(NSAccessibilityRole\)accessibilityRole \{ return NSAccessibilityGroupRole; \}/);
  assert.match(source, /- \(NSString \*\)accessibilityLabel \{ return self\.message; \}/);
});
