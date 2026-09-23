const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createAppTray, resolveTrayIcon } = require('./tray.cjs');

function electronFake() {
  const registrado = { menu: null, tooltip: null, destruido: false, imagem: null, template: false, cliques: new Map() };
  class TrayFake {
    constructor(image) { registrado.imagem = image; }
    setToolTip(value) { registrado.tooltip = value; }
    setContextMenu(menu) { registrado.menu = menu; }
    on(event, fn) { registrado.cliques.set(event, fn); }
    destroy() { registrado.destruido = true; }
  }
  return {
    registrado,
    Tray: TrayFake,
    Menu: { buildFromTemplate: (template) => ({ template }) },
    nativeImage: { createFromPath: (file) => ({ file, setTemplateImage: (value) => { registrado.template = value; } }) },
  };
}

test('o ícone abre, leva ao Assistant, esconde e sai, nessa ordem', () => {
  const chamadas = [];
  const { Tray, Menu, nativeImage, registrado } = electronFake();
  createAppTray({ Tray, Menu, nativeImage, iconPath: '/icone.png', onOpen: () => chamadas.push('abrir'), onAssistant: () => chamadas.push('assistant'), onHide: () => chamadas.push('ocultar'), onQuit: () => chamadas.push('sair') });

  const rotulos = registrado.menu.template.map((item) => item.type ?? item.label);
  assert.deepEqual(rotulos, ['Abrir Pixano', 'Abrir assistente', 'Ocultar janela', 'separator', 'Sair do Pixano']);
  for (const item of registrado.menu.template) item.click?.();
  assert.deepEqual(chamadas, ['abrir', 'assistant', 'ocultar', 'sair']);
});

test('clicar no ícone abre a janela, que é o caminho de volta depois de fechá-la', () => {
  let aberturas = 0;
  const { Tray, Menu, nativeImage, registrado } = electronFake();
  createAppTray({ Tray, Menu, nativeImage, iconPath: '/icone.png', onOpen: () => { aberturas += 1; }, onQuit: () => {} });

  registrado.cliques.get('click')();

  assert.equal(aberturas, 1);
});

// Sem isto o ícone vira um borrão preto no modo escuro do macOS.
test('o ícone é marcado como template, para seguir o tema do sistema', () => {
  const { Tray, Menu, nativeImage, registrado } = electronFake();
  createAppTray({ Tray, Menu, nativeImage, iconPath: '/icone.png', onOpen: () => {}, onQuit: () => {} });

  assert.equal(registrado.template, true);
  assert.equal(registrado.imagem.file, '/icone.png');
  assert.equal(registrado.tooltip, 'Pixano');
});

test('sem quem abrir ou sair, o ícone não é criado pela metade', () => {
  const { Tray, Menu, nativeImage } = electronFake();
  assert.throws(() => createAppTray({ Tray, Menu, nativeImage, onOpen: () => {} }), /open handler and a quit handler/);
});

test('encerrar tira o ícone da barra', () => {
  const { Tray, Menu, nativeImage, registrado } = electronFake();
  createAppTray({ Tray, Menu, nativeImage, iconPath: '/icone.png', onOpen: () => {}, onQuit: () => {} }).destroy();

  assert.equal(registrado.destruido, true);
});

test('o ícone do app empacotado ganha do que está no repositório, e o que existe ganha do palpite', () => {
  const empacotado = path.join('/app', 'dist', 'companion-assets/tray/hibi-trayTemplate.png');
  const repositorio = path.join('/app', 'public', 'companion-assets/tray/hibi-trayTemplate.png');

  assert.equal(resolveTrayIcon({ root: '/app', exists: () => true }), empacotado);
  assert.equal(resolveTrayIcon({ root: '/app', exists: (file) => file === repositorio }), repositorio);
  assert.equal(resolveTrayIcon({ root: '/app', exists: () => false }), repositorio);
});
