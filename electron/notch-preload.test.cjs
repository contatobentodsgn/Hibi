const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');

// Carrega o preload do notch com um `electron` falso, para inspecionar o que ele expõe de verdade.
const loadNotchPreload = () => {
  const exposed = {};
  const channels = [];
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') {
      return {
        contextBridge: { exposeInMainWorld: (key, api) => { exposed[key] = api; } },
        ipcRenderer: {
          invoke: (channel, ...args) => { channels.push({ channel, args }); return Promise.resolve(null); },
          on: (channel) => { channels.push({ channel, args: [] }); },
          removeListener: () => {},
        },
      };
    }
    return originalLoad.call(Module, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve('./notch-preload.cjs')];
    require('./notch-preload.cjs');
  } finally {
    Module._load = originalLoad;
  }
  return { exposed, channels };
};

test('expõe ao notch somente os quatro canais que a overlay usa', () => {
  const { exposed } = loadNotchPreload();
  assert.deepEqual(Object.keys(exposed), ['hibiDesktop']);
  assert.deepEqual(
    Object.keys(exposed.hibiDesktop).sort(),
    ['getNotchPresentation', 'hideNotch', 'onCompanionPresentation', 'resolveNotchAction'],
  );
});

// A janela do notch é uma superfície pequena e sempre visível: não pode alcançar IA, Keychain,
// OAuth, webhook nem a API local, e também não pode apresentar cartões — só responder o ativo.
test('não expõe IA, integrações, OAuth, webhook, API local nem a apresentação de cartões', () => {
  const { exposed } = loadNotchPreload();
  const forbidden = [
    'runAiTurn', 'getAiConfig', 'saveAiConfig', 'deleteAiKey',
    'connectIntegration', 'revokeIntegration', 'prepareIntegrationAction', 'executeApprovedIntegrationAction',
    'authorizeIntegration', 'configureWebhook', 'startWebhook',
    'startLocalApi', 'resolveLocalApiWrite', 'syncLocalApiWorkspace',
    'showNotch', 'testNotch', 'setNotchDisplay', 'onLocalApiConfirmation',
  ];
  for (const name of forbidden) {
    assert.equal(exposed.hibiDesktop[name], undefined, `${name} não deve existir no preload do notch`);
  }
});

test('cada função fala com o canal correspondente', () => {
  const { exposed, channels } = loadNotchPreload();
  void exposed.hibiDesktop.getNotchPresentation();
  void exposed.hibiDesktop.hideNotch('req-1');
  void exposed.hibiDesktop.resolveNotchAction('req-1', 'confirm');
  exposed.hibiDesktop.onCompanionPresentation(() => {});
  assert.deepEqual(
    channels.map((entry) => entry.channel),
    ['hibi:notch:current', 'hibi:notch:hide', 'hibi:notch:action', 'hibi:companion:presentation'],
  );
});

test('assinar a apresentação devolve um cancelador', () => {
  const { exposed } = loadNotchPreload();
  assert.equal(typeof exposed.hibiDesktop.onCompanionPresentation(() => {}), 'function');
});

test('a janela do notch é criada com o preload dedicado, não com o do app', () => {
  const source = fs.readFileSync(path.join(__dirname, 'main.cjs'), 'utf8');
  // Compara só a linha da criação: afirmar contra o arquivo inteiro imprime todo o main.cjs quando falha.
  const creation = source.split('\n').find((line) => line.includes('createNotchWindowManager({')) ?? '';
  assert.ok(creation, 'createNotchWindowManager não foi encontrado em main.cjs');
  assert.ok(
    creation.includes("preloadPath: path.join(__dirname, 'notch-preload.cjs')"),
    'a janela do notch deve ser criada com o preload dedicado',
  );
});
