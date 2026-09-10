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

test('keeps the native mascot host passive and rejects interactive presentations', () => {
  const source = fs.readFileSync(path.join(__dirname, 'src/notch.mm'), 'utf8');

  assert.match(source, /gPanel\.becomesKeyOnlyIfNeeded = YES; \[gPanel orderFrontRegardless\]/);
  assert.match(source, /gPanel\.styleMask \|= NSWindowStyleMaskNonactivatingPanel/);
  assert.match(source, /if \(actionsValue\.Length\(\) > 0\) return Napi::Boolean::New\(info\.Env\(\), false\)/);
  assert.match(source, /gPanel\.ignoresMouseEvents = !gInteractive/);
  assert.match(source, /gInteractive = NO/);
  assert.match(source, /removeMonitor:gKeyObserver/);
  assert.match(source, /- \(NSAccessibilityRole\)accessibilityRole \{ return NSAccessibilityGroupRole; \}/);
  assert.match(source, /- \(NSString \*\)accessibilityLabel \{ return self\.message; \}/);
});

test('converte a posição do Electron a partir da tela principal, não da tela com foco', () => {
  const source = fs.readFileSync(path.join(__dirname, 'src/notch.mm'), 'utf8');

  assert.match(source, /NSScreen \*primary = NSScreen\.screens\.firstObject;/);
  assert.match(source, /NSMaxY\(primary\.frame\) - electronY - height/);
  assert.doesNotMatch(source, /NSScreen\.mainScreen/);
});
