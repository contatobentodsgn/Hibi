const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAppMenuTemplate, hideFromDock } = require('./app-menu.cjs');

const roles = (template, label) => template.find((menu) => menu.label === label).submenu.map((item) => item.role ?? item.type);

// Num app só de barra de menus o menu não aparece, e é ele que carrega os atalhos de edição.
test('o menu traz copiar, colar, desfazer e selecionar tudo, que somem sem ele', () => {
  const template = buildAppMenuTemplate({ appName: 'Hibi' });

  for (const role of ['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll']) {
    assert.ok(roles(template, 'Edit').includes(role), `${role} precisa existir no menu`);
  }
  assert.ok(roles(template, 'Hibi').includes('quit'));
});

test('o primeiro menu leva o nome do app, que é o que o macOS mostra', () => {
  assert.equal(buildAppMenuTemplate({ appName: 'Hibi' })[0].label, 'Hibi');
});

test('esconder do Dock não derruba o app quando a plataforma não tem Dock', () => {
  assert.equal(hideFromDock({ app: {} }), false);
  assert.equal(hideFromDock({}), false);
});

test('no macOS o Dock é escondido de verdade', () => {
  let escondido = false;
  const app = { dock: { hide: () => { escondido = true; }, isVisible: () => !escondido } };

  assert.equal(hideFromDock({ app }), true);
  assert.equal(escondido, true);
});

test('uma falha ao esconder vira false, nunca exceção que impede a abertura', () => {
  assert.equal(hideFromDock({ app: { dock: { hide: () => { throw new Error('sem Dock'); } } } }), false);
});
