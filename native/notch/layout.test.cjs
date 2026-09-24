const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Limite honesto deste arquivo: os testes leem `src/notch.mm` como texto e provam que o fonte
// contém (ou não contém) certas construções. Um regex sobre fonte quebra quando alguém reformata e
// passa quando a lógica está errada, então aqui só ficou o que o binário não deixa observar: nada
// na ponte N-API expõe máscara de canto, foco de janela, monitor de teclado ou texto desenhado, e
// `doesNotMatch` prova ausência, que nenhuma chamada consegue provar.
// O que dá para medir no painel de verdade (tamanho, posição sob a câmera, recusa de ações, ciclo
// de vida) foi para `host.test.cjs`, que chama o addon compilado — não é mais o smoke manual.
const readSource = () => fs.readFileSync(path.join(__dirname, 'src/notch.mm'), 'utf8');

test('o fonte não guarda mais uma altura interativa', () => {
  // Os valores de kHostWidth/kPassiveHeight são afirmados contra o frame real em `host.test.cjs`;
  // aqui sobra a ausência, que só o fonte mostra.
  assert.doesNotMatch(readSource(), /kInteractiveHeight/);
});

test('o fonte recusa apresentações com ações e não guarda mais o host interativo', () => {
  const source = readSource();

  // A recusa em si (`showHost` com ações devolve false) é exercitada contra o binário em `host.test.cjs`.
  assert.match(source, /gPanel\.ignoresMouseEvents = YES/);
  assert.match(source, /gPanel\.styleMask \|= NSWindowStyleMaskNonactivatingPanel/);
  assert.match(source, /gPanel\.becomesKeyOnlyIfNeeded = YES;/);
  assert.match(source, /- \(BOOL\)canBecomeKeyWindow \{ return NO; \}/);
  assert.match(source, /- \(BOOL\)canBecomeMainWindow \{ return NO; \}/);
  // Sem foco, teclado nem despacho de ação: um painel que recusa ações não teria como usá-los.
  assert.doesNotMatch(source, /gInteractive/);
  assert.doesNotMatch(source, /makeKeyAndOrderFront/);
  assert.doesNotMatch(source, /addLocalMonitorForEventsMatchingMask|NSEventMaskKeyDown/);
  assert.doesNotMatch(source, /- \(void\)keyDown:/);
  assert.doesNotMatch(source, /makeFirstResponder|focusFirstAction/);
  assert.doesNotMatch(source, /DispatchAction|PixanoNotchActionTarget|NSButton/);
  // O observador que sobrou é o de parâmetros de tela, e o destroy continua soltando ele.
  assert.match(source, /removeObserver:gScreenObserver/);
  assert.match(source, /- \(NSAccessibilityRole\)accessibilityRole \{ return NSAccessibilityGroupRole; \}/);
  assert.match(source, /- \(NSString \*\)accessibilityLabel \{ return self\.message; \}/);
});

// O monitor é o que contém o centro do painel nos dois eixos: só pelo eixo horizontal, um MacBook acima
// de um monitor externo mais largo caía dentro da faixa do externo, e o cartão de texto ia para ele.
test('converte a posição do Electron a partir do monitor sob o centro da janela', () => {
  const source = readSource();

  assert.match(source, /NSPoint center = NSMakePoint\(x \+ width \/ 2\.0, NSMaxY\(primary\.frame\) - \(y \+ height \/ 2\.0\)\);/);
  assert.match(source, /if \(NSPointInRect\(center, candidate\.frame\)\)/);
  assert.match(source, /NSMaxY\(targetScreen\.frame\) - height \+ kMenuBarInset/);
  assert.doesNotMatch(source, /NSScreen\.mainScreen/);
});

test('desloca o painel para baixo da câmera e centraliza o texto passivo sem cortar', () => {
  const source = readSource();

  assert.match(source, /CGFloat inset = screen\.safeAreaInsets\.top;/);
  assert.match(source, /CGFloat height = kPassiveHeight \* gScale;/);
  assert.match(source, /\[view applyTopInset:inset\];/);
  assert.doesNotMatch(source, /view\.topInset = inset;/);
  assert.match(source, /\[view setNeedsDisplay:YES\];/);
  assert.doesNotMatch(source, /self\.bounds\.size\.height - bottom - 14\.0/);
});

test('achata quebras de linha (\\n, \\r, \\r\\n, U+2028) no texto passivo em vez de só trocar \\n', () => {
  const source = readSource();

  assert.doesNotMatch(source, /stringByReplacingOccurrencesOfString:@"\\n" withString:@" "\]/);
});

test('mantém cantos inferiores e usa uma máscara geométrica com shoulders superiores', () => {
  const source = readSource();

  assert.match(source, /CGPathAddCurveToPoint\(path/);
  assert.match(source, /kBottomCornerRadius/);
  assert.match(source, /self\.shapeMask\.path = path/);
});
