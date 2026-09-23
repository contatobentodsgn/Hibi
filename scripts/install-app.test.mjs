import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { installApp, appIsRunning, DEFAULT_TARGET_DIR } from './install-app.mjs';

const recorder = () => { const calls = []; return { calls, run: (file, args, options) => { calls.push({ file, args, env: options?.env }); } }; };

test('constrói, empacota e põe o app onde o Finder acha', () => {
  const { calls, run } = recorder();

  const result = installApp({ projectRoot: '/repo/', targetDir: '/Users/x/Applications', run, exists: () => true, isRunning: () => false, log: () => {} });

  assert.deepEqual(result, { status: 'installed', targetPath: '/Users/x/Applications/Pixano.app' });
  assert.deepEqual(calls.map(({ file, args }) => [file, ...args].join(' ')), [
    'npm run build',
    'npx electron-builder --mac dir',
    'mkdir -p /Users/x/Applications',
    'rm -rf /Users/x/Applications/Pixano.app',
    `cp -R ${path.join('/repo/', 'dist/mac-arm64/Pixano.app')} /Users/x/Applications/Pixano.app`,
  ]);
});

test('não empacota assinatura de distribuição nem exige notarização para a própria máquina', () => {
  const { calls, run } = recorder();

  installApp({ projectRoot: '/repo/', run, exists: () => true, isRunning: () => false, log: () => {} });

  for (const call of calls.slice(0, 2)) {
    assert.equal(call.env.CSC_IDENTITY_AUTO_DISCOVERY, 'false');
    assert.equal(call.env.HIBI_LOCAL_INSTALL, '1');
  }
});

test('recusa trocar o pacote de um app aberto, que ficaria com a janela sobre arquivos apagados', () => {
  const { calls, run } = recorder();

  const result = installApp({ targetDir: '/Users/x/Applications', run, exists: () => true, isRunning: () => true, log: () => {} });

  assert.equal(result.status, 'running');
  assert.match(result.message, /Feche o Pixano/);
  assert.deepEqual(calls, [], 'nada pode rodar antes disso');
});

test('um empacotamento que não deixou app não vira instalação silenciosa', () => {
  const { calls, run } = recorder();

  const result = installApp({ projectRoot: '/repo/', run, exists: () => false, isRunning: () => false, log: () => {} });

  assert.equal(result.status, 'missing-build');
  assert.equal(calls.filter(({ file }) => file === 'cp').length, 0);
});

test('o alvo padrão é a pasta de aplicativos da pessoa, não a do sistema', () => {
  assert.match(DEFAULT_TARGET_DIR, /\/Applications$/);
  assert.ok(DEFAULT_TARGET_DIR.startsWith(process.env.HOME ?? '/Users/'), 'instalar em /Applications pediria senha de administrador');
});

test('só considera aberto o app do caminho de destino', () => {
  const comandos = [];
  const run = (command) => { comandos.push(command); if (!command.includes('/Users/x/Applications/Pixano.app')) throw new Error('nada encontrado'); };

  assert.equal(appIsRunning({ targetPath: '/Users/x/Applications/Pixano.app', run }), true);
  assert.equal(appIsRunning({ targetPath: '/outro/Pixano.app', run }), false);
  assert.match(comandos[0], /pgrep -f/);
});
