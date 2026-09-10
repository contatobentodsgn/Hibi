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

test('desloca o painel para baixo da câmera e centraliza o texto passivo sem cortar', () => {
  const source = fs.readFileSync(path.join(__dirname, 'src/notch.mm'), 'utf8');

  assert.match(source, /@property\(nonatomic\) CGFloat topInset;/);
  assert.match(source, /CGFloat inset = screen\.safeAreaInsets\.top;/);
  assert.match(source, /CGFloat height = \(gInteractive \? kInteractiveHeight : kPassiveHeight\) \+ inset;/);
  // `applyTopInset:` é o único lugar que grava o inset usado no desenho e nos cantos.
  assert.match(source, /- \(void\)applyTopInset:\(CGFloat\)topInset \{\n  self\.topInset = topInset;/);
  assert.match(source, /\[view applyTopInset:inset\];/);
  assert.doesNotMatch(source, /view\.topInset = inset;/);
  assert.match(source, /\[view setNeedsDisplay:YES\];/);
  assert.match(source, /NSLineBreakByTruncatingTail/);
  assert.doesNotMatch(source, /self\.bounds\.size\.height - bottom - 14\.0/);
});

test('arredonda só os cantos de baixo sob a câmera e mede a linha passiva num texto de referência', () => {
  const source = fs.readFileSync(path.join(__dirname, 'src/notch.mm'), 'utf8');

  assert.match(source, /layer\.maskedCorners = kCALayerMinXMinYCorner \| kCALayerMaxXMinYCorner/);
  assert.match(source, /@"Hg" sizeWithAttributes:attributes\]\.height/);
  assert.doesNotMatch(source, /CGFloat lineHeight = ceil\(\[self\.message sizeWithAttributes:attributes\]\.height\)/);
});
