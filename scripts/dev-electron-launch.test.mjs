import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { devLaunchPlan, devOpenArgs, launchDevElectron, stopDevElectron, streamLog } from './dev-electron-launch.mjs';

const APP = '/repo/node_modules/electron/dist/Electron.app';

test('no macOS com o Electron baixado, o app é aberto pelo sistema', () => {
  assert.deepEqual(devLaunchPlan({ platform: 'darwin', electronAppPath: APP, exists: () => true }), { kind: 'open', electronAppPath: APP });
});

test('fora do macOS, ou sem o Electron baixado, segue o caminho antigo', () => {
  assert.deepEqual(devLaunchPlan({ platform: 'linux', electronAppPath: APP, exists: () => true }), { kind: 'npx' });
  assert.deepEqual(devLaunchPlan({ platform: 'darwin', electronAppPath: APP, exists: () => false }), { kind: 'npx' });
});

test('o projeto vai depois de --args, senão o `open` fica com ele em vez do app', () => {
  const args = devOpenArgs({ electronAppPath: APP, projectRoot: '/repo/', logPath: '/tmp/hibi.log' });

  assert.equal(args.at(-1), '/repo/');
  assert.equal(args.at(-2), '--args');
  assert.ok(args.includes('-W'), 'sem -W o `open` volta na hora e o dev acha que o app fechou');
  assert.deepEqual([args[args.indexOf('--stdout') + 1], args[args.indexOf('--stderr') + 1]], ['/tmp/hibi.log', '/tmp/hibi.log']);
});

test('o caminho antigo continua recebendo o endereço do servidor de desenvolvimento', () => {
  const calls = [];
  launchDevElectron({ plan: { kind: 'npx' }, projectRoot: '/repo/', logPath: '/tmp/hibi.log', devServer: 'http://127.0.0.1:5173', spawnProcess: (file, args, options) => { calls.push([file, args, options]); return {}; } });

  assert.match(calls[0][0], /npx/);
  assert.equal(calls[0][2].env.HIBI_DEV_SERVER, 'http://127.0.0.1:5173');
});

test('sair do dev fecha o app que o sistema abriu, que não é filho deste processo', () => {
  const calls = [];
  const run = (file, args) => { calls.push([file, args]); };

  assert.equal(stopDevElectron({ plan: { kind: 'open', electronAppPath: APP }, run }), true);
  assert.deepEqual(calls, [['pkill', ['-f', `${APP}/Contents/MacOS/Electron`]]]);
  assert.equal(stopDevElectron({ plan: { kind: 'npx' }, run }), false, 'no caminho antigo o filho morre com o pai');
});

test('o terminal mostra o que o app escreve, sem repetir o que já mostrou', async () => {
  const logPath = path.join(mkdtempSync(path.join(tmpdir(), 'hibi-log-')), 'hibi-desktop.log');
  writeFileSync(logPath, 'primeira linha\n');
  const escrito = [];
  const stop = streamLog({ logPath, write: (text) => escrito.push(text), intervalMs: 10 });

  await new Promise((resolve) => setTimeout(resolve, 60));
  appendFileSync(logPath, 'segunda linha\n');
  await new Promise((resolve) => setTimeout(resolve, 60));
  stop();

  assert.equal(escrito.join(''), 'primeira linha\nsegunda linha\n');
});
