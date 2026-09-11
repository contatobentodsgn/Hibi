const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Limite honesto deste arquivo: os testes leem `src/notch.mm` como texto e provam que o fonte
// contém (ou não contém) certas construções. Não provam nada sobre o comportamento do binário
// compilado — quem exercita o addon de verdade é `npm run native:notch:smoke`, manual.
const readSource = () => fs.readFileSync(path.join(__dirname, 'src/notch.mm'), 'utf8');

test('o fonte fixa as proporções compactas do painel e não guarda mais uma altura interativa', () => {
  const source = readSource();

  assert.match(source, /constexpr CGFloat kHostWidth = 256\.0/);
  assert.match(source, /constexpr CGFloat kPassiveHeight = 38\.0/);
  assert.doesNotMatch(source, /kInteractiveHeight/);
});

test('o fonte recusa apresentações com ações e não guarda mais o host interativo', () => {
  const source = readSource();

  // A recusa é o contrato: com ações, a apresentação é da overlay Electron, não deste painel.
  assert.match(source, /if \(actionsValue\.Length\(\) > 0\) return Napi::Boolean::New\(info\.Env\(\), false\);/);
  assert.match(source, /gPanel\.ignoresMouseEvents = YES/);
  assert.match(source, /gPanel\.styleMask \|= NSWindowStyleMaskNonactivatingPanel/);
  assert.match(source, /gPanel\.becomesKeyOnlyIfNeeded = YES; \[gPanel orderFrontRegardless\]/);
  assert.match(source, /- \(BOOL\)canBecomeKeyWindow \{ return NO; \}/);
  assert.match(source, /- \(BOOL\)canBecomeMainWindow \{ return NO; \}/);
  // Sem foco, teclado nem despacho de ação: um painel que recusa ações não teria como usá-los.
  assert.doesNotMatch(source, /gInteractive/);
  assert.doesNotMatch(source, /makeKeyAndOrderFront/);
  assert.doesNotMatch(source, /addLocalMonitorForEventsMatchingMask|NSEventMaskKeyDown/);
  assert.doesNotMatch(source, /- \(void\)keyDown:/);
  assert.doesNotMatch(source, /makeFirstResponder|focusFirstAction/);
  assert.doesNotMatch(source, /DispatchAction|HibiNotchActionTarget|NSButton/);
  // O observador que sobrou é o de parâmetros de tela, e o destroy continua soltando ele.
  assert.match(source, /removeObserver:gScreenObserver/);
  assert.match(source, /- \(NSAccessibilityRole\)accessibilityRole \{ return NSAccessibilityGroupRole; \}/);
  assert.match(source, /- \(NSString \*\)accessibilityLabel \{ return self\.message; \}/);
});

test('converte a posição do Electron a partir da tela principal, não da tela com foco', () => {
  const source = readSource();

  assert.match(source, /NSScreen \*primary = NSScreen\.screens\.firstObject;/);
  assert.match(source, /NSMaxY\(primary\.frame\) - electronY - height/);
  assert.doesNotMatch(source, /NSScreen\.mainScreen/);
});

test('desloca o painel para baixo da câmera e centraliza o texto passivo sem cortar', () => {
  const source = readSource();

  assert.match(source, /@property\(nonatomic\) CGFloat topInset;/);
  assert.match(source, /CGFloat inset = screen\.safeAreaInsets\.top;/);
  assert.match(source, /CGFloat height = kPassiveHeight \+ inset;/);
  // `applyTopInset:` é o único lugar que grava o inset usado no desenho e nos cantos.
  assert.match(source, /- \(void\)applyTopInset:\(CGFloat\)topInset \{\n  self\.topInset = topInset;/);
  assert.match(source, /\[view applyTopInset:inset\];/);
  assert.doesNotMatch(source, /view\.topInset = inset;/);
  assert.match(source, /\[view setNeedsDisplay:YES\];/);
  assert.match(source, /NSLineBreakByTruncatingTail/);
  assert.doesNotMatch(source, /self\.bounds\.size\.height - bottom - 14\.0/);
});

test('achata quebras de linha (\\n, \\r, \\r\\n, U+2028) no texto passivo em vez de só trocar \\n', () => {
  const source = readSource();

  assert.match(source, /componentsSeparatedByCharactersInSet:NSCharacterSet\.newlineCharacterSet\]/);
  assert.doesNotMatch(source, /stringByReplacingOccurrencesOfString:@"\\n" withString:@" "\]/);
});

test('arredonda só os cantos de baixo sob a câmera e mede a linha passiva num texto de referência', () => {
  const source = readSource();

  assert.match(source, /layer\.maskedCorners = kCALayerMinXMinYCorner \| kCALayerMaxXMinYCorner/);
  assert.match(source, /@"Hg" sizeWithAttributes:attributes\]\.height/);
  assert.doesNotMatch(source, /CGFloat lineHeight = ceil\(\[self\.message sizeWithAttributes:attributes\]\.height\)/);
});
