const test = require('node:test');
const { after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const bridge = require('./index.cjs');

// Este arquivo exercita o BINÁRIO compilado (`build/Release/hibi_notch.node`) — não o texto do
// `.mm` (isso é `layout.test.cjs`) nem um stub (isso é `index.test.cjs`). É a única verificação
// automática que chama AppKit de verdade: cria o NSPanel, mede o frame que ele ocupou na tela real
// e o destrói.
//
// Regra deste arquivo: nada de asserção que desaparece. Quando falta ambiente (addon não compilado,
// sessão sem telas), o teste é PULADO explicitamente, com motivo legível no relatório. Um ramo
// `if (!disponível)` some justamente quando a capacidade existe, que é quando a asserção valeria.
const ADDON_PATH = path.join(__dirname, 'build/Release/hibi_notch.node');
const addonBuilt = fs.existsSync(ADDON_PATH);
const NO_ADDON = 'addon não compilado em native/notch/build/Release/hibi_notch.node — rode `npm run native:build`';
const NO_SCREENS = 'NSScreen.screens vazio: esta sessão não tem window server para abrir um painel';
// O app carrega o addon no Node embutido no Electron, não no Node do sistema que roda este arquivo.
// Fora do app, `require('electron')` devolve o caminho do binário e lança quando ele não foi baixado.
let electronBinary = null;
try { electronBinary = require('electron'); } catch { electronBinary = null; }
const NO_ELECTRON = 'binário do Electron não instalado (ELECTRON_SKIP_BINARY_DOWNLOAD): falta o runtime onde o app carrega o addon';

// Os números do contrato passivo, afirmados aqui contra o frame real em vez de por regex no fonte.
const HOST_WIDTH = 264;
const PASSIVE_HEIGHT = 167;
const IDLE_ANIMATION = path.resolve(__dirname, '../../public/companion-assets/animations/notch/idle_01_loop.mp4');
// O painel nasce centralizado e colado no topo físico, cobrindo a faixa da câmera.
const expectedFrame = (screen) => ({
  x: screen.frame.x + screen.frame.width / 2 - HOST_WIDTH / 2,
  y: screen.frame.y + screen.frame.height - PASSIVE_HEIGHT,
  width: HOST_WIDTH,
  height: PASSIVE_HEIGHT,
});
const passive = (requestId, text = 'verificação do host nativo', animationPath = null) => ({ requestId, kind: 'result', text, interaction: 'passthrough', actions: [], ...(animationPath ? { animationPath } : {}) });
// Cada teste começa e termina sem painel: o host é estado global do processo.
const reset = () => { if (addonBuilt) bridge.destroyHost(); };
// Rede de segurança: nenhuma janela sobrevive ao arquivo, mesmo se uma asserção estourar no meio.
after(reset);

test('o binário compilado anuncia capacidade real em vez do contrato de indisponibilidade', (t) => {
  if (!addonBuilt) return t.skip(NO_ADDON);
  assert.equal(bridge.available(), true);
  assert.equal(bridge.promotionAvailable(), true);
  assert.equal(bridge.nativeHostAvailable(), true);
  assert.equal(bridge.hostDiagnostics().available, true);
  // O adaptador público sobre o bridge real, e não sobre um stub, é o que o app carrega.
  const adapter = bridge.createNotchAdapter({ platform: 'darwin', isPackaged: false });
  assert.equal(adapter.id, 'public');
  assert.equal(adapter.available(), true);
  assert.equal(adapter.nativeHostAvailable(), true);
});

test('screenGeometry descreve as telas reais com os campos que o seletor de tela consome', (t) => {
  if (!addonBuilt) return t.skip(NO_ADDON);
  const screens = bridge.screenGeometry();
  assert.ok(Array.isArray(screens));
  if (screens.length === 0) return t.skip(NO_SCREENS);
  screens.forEach((screen, index) => {
    assert.equal(screen.index, index);
    assert.ok(Number.isInteger(screen.displayId) && screen.displayId > 0, `displayId inválido: ${screen.displayId}`);
    assert.ok(screen.frame.width > 0 && screen.frame.height > 0);
    assert.equal(typeof screen.frame.x, 'number');
    assert.equal(typeof screen.frame.y, 'number');
    assert.ok(Number.isFinite(screen.safeAreaTop) && screen.safeAreaTop >= 0);
    assert.equal(typeof screen.hasCameraHousing, 'boolean');
  });
  // `notch-window.cjs` casa `displayId` com os displays do Electron: repetido, escolheria a tela errada.
  assert.equal(new Set(screens.map((screen) => screen.displayId)).size, screens.length);
});

test('o ciclo de vida do host nativo cria, mostra, esconde e destrói um NSPanel de verdade', (t) => {
  if (!addonBuilt) return t.skip(NO_ADDON);
  const screens = bridge.screenGeometry();
  if (screens.length === 0) return t.skip(NO_SCREENS);
  reset();
  const displayId = screens[0].displayId;

  assert.equal(bridge.createHost(() => {}), true);
  const created = bridge.hostDiagnostics();
  assert.equal(created.created, true);
  assert.equal(created.visible, false, 'criar o host não pode acender o painel sozinho');
  assert.equal(created.frame.width, HOST_WIDTH);
  assert.equal(created.frame.height, PASSIVE_HEIGHT);

  assert.equal(bridge.showHost(passive('ciclo-de-vida'), displayId), true);
  const shown = bridge.hostDiagnostics();
  assert.equal(shown.visible, true);
  assert.equal(shown.requestId, 'ciclo-de-vida');
  assert.equal(shown.displayId, displayId);
  assert.deepEqual(shown.frame, expectedFrame(screens[0]));
  assert.equal(typeof shown.activeSpace, 'boolean');

  assert.equal(bridge.hideHost(), true);
  const hidden = bridge.hostDiagnostics();
  assert.equal(hidden.visible, false);
  assert.equal(hidden.created, true, 'esconder preserva o painel para a próxima apresentação');
  assert.equal(hidden.requestId, undefined, 'o pedido escondido não pode continuar ativo no host');

  assert.equal(bridge.destroyHost(), true);
  const destroyed = bridge.hostDiagnostics();
  assert.equal(destroyed.created, false);
  assert.equal(destroyed.visible, false);
  assert.equal(destroyed.frame, undefined);
  assert.equal(destroyed.displayId, undefined);
  // Sem painel não há o que esconder nem reposicionar: a recusa prova que o destroy soltou o estado.
  assert.equal(bridge.hideHost(), false);
  assert.equal(bridge.repositionHost(displayId), false);
});

test('o host toca o loop ocioso original quando recebe um arquivo local de animação', (t) => {
  if (!addonBuilt) return t.skip(NO_ADDON);
  const screens = bridge.screenGeometry();
  if (screens.length === 0) return t.skip(NO_SCREENS);
  assert.equal(fs.existsSync(IDLE_ANIMATION), true, 'o loop ocioso precisa existir no pacote-fonte');
  reset();
  assert.equal(bridge.showHost(passive('animacao-ociosa', 'Hibi', IDLE_ANIMATION), screens[0].displayId), true);
  assert.equal(bridge.hostDiagnostics().animatingAsset, true);
  assert.equal(bridge.showHost(passive('fallback-sem-arquivo', 'Hibi', '/arquivo/que/nao/existe.mp4'), screens[0].displayId), true);
  assert.equal(bridge.hostDiagnostics().animatingAsset, false, 'um caminho inválido volta ao desenho seguro em vez de deixar o painel vazio');
  reset();
});

test('o painel nasce abaixo da câmera: altura e posição saem da geometria real de cada tela', (t) => {
  if (!addonBuilt) return t.skip(NO_ADDON);
  const screens = bridge.screenGeometry();
  if (screens.length === 0) return t.skip(NO_SCREENS);
  reset();
  assert.equal(bridge.showHost(passive('geometria'), screens[0].displayId), true);
  for (const screen of screens) {
    assert.equal(bridge.repositionHost(screen.displayId), true);
    const { frame, displayId } = bridge.hostDiagnostics();
    assert.equal(displayId, screen.displayId);
    // O companion cobre a câmera e começa no topo físico do display.
    assert.deepEqual(frame, expectedFrame(screen), `frame errado na tela ${screen.displayId}`);
    assert.equal(frame.height, PASSIVE_HEIGHT);
  }
  reset();
});

test('uma tela desconhecida cai numa tela real em vez de largar o painel fora do mundo', (t) => {
  if (!addonBuilt) return t.skip(NO_ADDON);
  const screens = bridge.screenGeometry();
  if (screens.length === 0) return t.skip(NO_SCREENS);
  reset();
  assert.equal(bridge.showHost(passive('tela-inexistente'), 999999), true);
  const { frame } = bridge.hostDiagnostics();
  const candidates = screens.map(expectedFrame);
  assert.ok(candidates.some((candidate) => candidate.x === frame.x && candidate.y === frame.y && candidate.height === frame.height),
    `o painel foi para ${JSON.stringify(frame)}, que não é nenhuma tela real`);
  // Havendo tela com câmera, a queda é para ela: é onde o cartão faz sentido.
  const housing = screens.find((screen) => screen.hasCameraHousing);
  if (housing) assert.deepEqual(frame, expectedFrame(housing));
  reset();
});

test('o host recusa apresentações com ações: clique e teclado são da overlay Electron', (t) => {
  if (!addonBuilt) return t.skip(NO_ADDON);
  const screens = bridge.screenGeometry();
  if (screens.length === 0) return t.skip(NO_SCREENS);
  reset();
  const displayId = screens[0].displayId;
  assert.equal(bridge.showHost(passive('passivo'), displayId), true);
  // A recusa é o contrato do painel: ele não aceita foco, então não teria como despachar a ação.
  assert.equal(bridge.showHost({ requestId: 'com-acao', kind: 'confirm', text: 'Confirmar?', actions: [{ id: 'ok', label: 'OK' }] }, displayId), false);
  // E a apresentação recusada não pode ter substituído a que estava no ar.
  assert.equal(bridge.hostDiagnostics().requestId, 'passivo');
  reset();
});

test('o host recusa apresentações malformadas sem derrubar o processo', (t) => {
  if (!addonBuilt) return t.skip(NO_ADDON);
  const screens = bridge.screenGeometry();
  if (screens.length === 0) return t.skip(NO_SCREENS);
  reset();
  const displayId = screens[0].displayId;
  assert.equal(bridge.showHost({ actions: [] }, displayId), false, 'sem requestId');
  assert.equal(bridge.showHost({ requestId: '', actions: [] }, displayId), false, 'requestId vazio');
  assert.equal(bridge.showHost({ requestId: 42, actions: [] }, displayId), false, 'requestId não string');
  assert.equal(bridge.showHost({ requestId: 'a', actions: 'nope' }, displayId), false, 'actions não é lista');
  assert.equal(bridge.showHost({ requestId: 'a' }, displayId), false, 'sem actions');
  assert.equal(bridge.showHost({ requestId: 'x'.repeat(129), actions: [] }, displayId), false, 'requestId acima de 128');
  assert.equal(bridge.showHost(passive('a'), 'não é número'), false, 'displayId não numérico');
  assert.equal(bridge.showHost({ requestId: 'x'.repeat(128), actions: [] }, displayId), true, '128 é o limite aceito');
  // Quebras de linha viram uma linha só na hora de desenhar; aqui o que se prova é que não explode.
  assert.equal(bridge.showHost(passive('multilinha', 'uma\nduas\r\ntrês quatro'), displayId), true);
  reset();
});

test('place exige os cinco argumentos e recusa handles que não apontam para janela', (t) => {
  if (!addonBuilt) return t.skip(NO_ADDON);
  // Posicionar uma janela de verdade exige o handle de um BrowserWindow do Electron; o que dá para
  // provar fora dele são as guardas — e elas são justamente o que separa um erro de um crash.
  assert.throws(() => bridge.place(), { name: 'TypeError', message: 'Expected native handle and x, y, width, height.' });
  assert.throws(() => bridge.place({}, 0, 0, 10, 10), { name: 'TypeError' });
  assert.throws(() => bridge.place(Buffer.alloc(8), 0, 0, 10), { name: 'TypeError' });
  assert.equal(bridge.place(Buffer.alloc(2), 0, 0, 10, 10), false, 'handle menor que um ponteiro');
  assert.equal(bridge.place(Buffer.alloc(8), 0, 0, 10, 10), false, 'ponteiro nulo');
});

test('teardown desfaz o host e é idempotente', (t) => {
  if (!addonBuilt) return t.skip(NO_ADDON);
  const screens = bridge.screenGeometry();
  if (screens.length === 0) return t.skip(NO_SCREENS);
  reset();
  assert.equal(bridge.createHost(() => {}), true);
  assert.equal(bridge.showHost(passive('teardown'), screens[0].displayId), true);
  assert.equal(bridge.teardown(), undefined);
  assert.equal(bridge.hostDiagnostics().created, false);
  // Chamado duas vezes no desligamento do app, não pode estourar na segunda.
  assert.equal(bridge.teardown(), undefined);
  assert.equal(bridge.hostDiagnostics().created, false);
});

// O roteiro do antigo `scripts/native-notch-smoke.cjs` (adaptador público, createHost, showHost,
// diagnóstico, destroy), que rodava sob `electron` e só imprimia JSON. Aqui roda no mesmo runtime,
// com asserção. O `screen` do Electron não existe nesse modo; o smoke também não afirmava nada sobre ele.
test('no runtime do Electron, onde o app o carrega, o mesmo binário cria, mostra e destrói o painel', (t) => {
  if (!addonBuilt) return t.skip(NO_ADDON);
  if (!electronBinary) return t.skip(NO_ELECTRON);
  const script = `
    const bridge = require(${JSON.stringify(path.join(__dirname, 'index.cjs'))});
    const adapter = bridge.createNotchAdapter({ platform: process.platform, isPackaged: false });
    const screens = adapter.screenGeometry();
    const out = { electron: process.versions.electron, id: adapter.id, available: adapter.available(), screens };
    if (screens.length > 0) {
      out.created = adapter.createHost(() => {});
      out.shown = adapter.showHost(${JSON.stringify(passive('runtime-electron'))}, screens[0].displayId);
      out.shownDiagnostics = adapter.hostDiagnostics();
      out.destroyed = adapter.destroyHost();
      out.destroyedDiagnostics = adapter.hostDiagnostics();
    }
    process.stdout.write(JSON.stringify(out));
  `;
  const run = spawnSync(electronBinary, ['-e', script], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8',
    timeout: 30_000,
  });
  assert.equal(run.status, 0, `o Electron saiu com ${run.status} (sinal ${run.signal}): ${run.stderr}`);
  const out = JSON.parse(run.stdout);
  assert.equal(typeof out.electron, 'string', 'o roteiro precisa ter rodado no Node do Electron');
  assert.equal(out.id, 'public');
  assert.equal(out.available, true, 'o binário não carregou no runtime do Electron');
  if (out.screens.length === 0) return t.skip(NO_SCREENS);
  assert.equal(out.created, true);
  assert.equal(out.shown, true);
  assert.equal(out.shownDiagnostics.visible, true);
  assert.equal(out.shownDiagnostics.requestId, 'runtime-electron');
  assert.deepEqual(out.shownDiagnostics.frame, expectedFrame(out.screens[0]));
  assert.equal(out.destroyed, true);
  assert.equal(out.destroyedDiagnostics.created, false);
});

test('o adaptador público entrega o host real do binário, e não só o contrato seguro', (t) => {
  if (!addonBuilt) return t.skip(NO_ADDON);
  const screens = bridge.screenGeometry();
  if (screens.length === 0) return t.skip(NO_SCREENS);
  reset();
  const adapter = bridge.createNotchAdapter({ platform: 'darwin', isPackaged: false });
  assert.equal(adapter.createHost('não é função'), false, 'o adaptador barra o callback inválido antes da ponte');
  assert.equal(adapter.createHost(() => {}), true);
  assert.equal(adapter.showHost(passive('via-adaptador'), screens[0].displayId), true);
  const diagnostics = adapter.hostDiagnostics();
  assert.equal(diagnostics.created, true);
  assert.equal(diagnostics.requestId, 'via-adaptador');
  assert.deepEqual(diagnostics.frame, expectedFrame(screens[0]));
  assert.equal(adapter.hideHost(), true);
  assert.equal(adapter.destroyHost(), true);
  assert.equal(adapter.hostDiagnostics().created, false);
});
