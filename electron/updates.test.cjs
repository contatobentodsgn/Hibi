const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createUpdateService, createElectronUpdateService, packagedFeedPath } = require('./updates.cjs');

function updaterFake({ failOn = null } = {}) {
  const listeners = new Map();
  const calls = [];
  return {
    calls,
    listeners,
    setFeedURL: (value) => calls.push(['setFeedURL', value]),
    checkForUpdates: async () => { calls.push(['check']); if (failOn === 'check') throw new Error('sem rede'); listeners.get('update-available')?.({ version: '0.2.0' }); },
    downloadUpdate: async () => { calls.push(['download']); if (failOn === 'download') throw new Error('disco cheio'); listeners.get('update-downloaded')?.({ version: '0.2.0' }); },
    quitAndInstall: () => { calls.push(['install']); if (failOn === 'install') throw new Error('Could not get code signature'); },
    on: (event, fn) => listeners.set(event, fn),
  };
}

test('fora do app empacotado não há atualização, mesmo com feed configurado', async () => {
  const service = createUpdateService({ isPackaged: false, hasPackagedFeed: true, autoUpdater: updaterFake() });

  assert.equal(service.state().status, 'disabled');
  await service.check();
  assert.equal(service.state().status, 'disabled');
});

test('o app empacotado sem feed nenhum nasce desligado, em vez de prometer o que não pode', () => {
  assert.equal(createUpdateService({ isPackaged: true, autoUpdater: updaterFake() }).state().status, 'disabled');
});

test('o feed do empacotamento basta, e não é sobrescrito sem alguém pedir', async () => {
  const autoUpdater = updaterFake();
  const service = createUpdateService({ isPackaged: true, hasPackagedFeed: true, autoUpdater });

  assert.equal(service.state().status, 'idle');
  assert.deepEqual(autoUpdater.calls.filter(([name]) => name === 'setFeedURL'), [], 'o endereço do pacote é o que vale');
});

test('um feed pedido de propósito aponta o serviço para ele', () => {
  const autoUpdater = updaterFake();
  createUpdateService({ isPackaged: true, feedUrl: 'https://feed.example.test', autoUpdater });

  assert.deepEqual(autoUpdater.calls[0], ['setFeedURL', { provider: 'generic', url: 'https://feed.example.test' }]);
});

test('baixar exige pedido, e cada passo aparece na tela', async () => {
  const estados = [];
  const autoUpdater = updaterFake();
  const service = createUpdateService({ isPackaged: true, hasPackagedFeed: true, autoUpdater, onEvent: (state) => estados.push(state.status) });

  await service.check();
  assert.equal(service.state().status, 'available');
  await service.download();
  assert.equal(service.state().status, 'downloaded');
  service.install();

  assert.deepEqual(estados, ['available', 'downloaded']);
  assert.deepEqual(autoUpdater.calls.map(([name]) => name), ['check', 'download', 'install']);
  assert.equal(autoUpdater.autoDownload, false, 'nada pode descer sem pedido');
});

test('nada é instalado antes de estar baixado', () => {
  const autoUpdater = updaterFake();
  const service = createUpdateService({ isPackaged: true, hasPackagedFeed: true, autoUpdater });

  service.install();

  assert.deepEqual(autoUpdater.calls, []);
});

test('falha de rede, de download e de instalação viram estado na tela, não exceção', async () => {
  for (const [momento, esperado] of [['check', 'sem rede'], ['download', 'disco cheio'], ['install', 'Could not get code signature']]) {
    const autoUpdater = updaterFake({ failOn: momento });
    const service = createUpdateService({ isPackaged: true, hasPackagedFeed: true, autoUpdater });
    if (momento !== 'check') await service.check();
    if (momento === 'install') await service.download();

    const resultado = momento === 'install' ? service.install() : await service[momento]();

    assert.equal(resultado.status, 'error', `falha em ${momento} precisa virar estado`);
    assert.equal(service.state().error, esperado);
  }
});

test('o serviço do Electron procura o feed ao lado dos recursos do app', () => {
  const consultados = [];
  const service = createElectronUpdateService({ app: { isPackaged: true }, autoUpdater: updaterFake(), resourcesPath: '/Applications/Hibi.app/Contents/Resources', exists: (file) => { consultados.push(file); return true; } });

  assert.equal(service.enabled, true);
  assert.deepEqual(consultados, [packagedFeedPath('/Applications/Hibi.app/Contents/Resources')]);
  assert.equal(path.basename(consultados[0]), 'app-update.yml');
});

test('sem o arquivo do empacotamento, o serviço do Electron fica desligado', () => {
  assert.equal(createElectronUpdateService({ app: { isPackaged: true }, autoUpdater: updaterFake(), resourcesPath: '/Applications/Hibi.app/Contents/Resources', exists: () => false }).enabled, false);
});
