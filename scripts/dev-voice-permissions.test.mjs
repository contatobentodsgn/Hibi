import assert from 'node:assert/strict';
import test from 'node:test';
import { describeSpeechUsageString, ensureSpeechUsageString } from './dev-voice-permissions.mjs';

const runnerFor = ({ hasKey = false, addFails = false } = {}) => {
  const calls = [];
  const run = (file, args) => {
    calls.push([file, ...args]);
    const command = args[1] ?? '';
    if (command.startsWith('Print') && !hasKey) throw new Error('Does Not Exist');
    if (command.startsWith('Add') && addFails) throw new Error('read-only volume');
    return '';
  };
  return { calls, run };
};

test('o Electron que já declara o texto de fala é deixado em paz', () => {
  const { calls, run } = runnerFor({ hasKey: true });

  assert.deepEqual(ensureSpeechUsageString({ plistPath: '/repo/node_modules/electron/dist/Electron.app/Contents/Info.plist', run, exists: () => true }), { status: 'present', plistPath: '/repo/node_modules/electron/dist/Electron.app/Contents/Info.plist' });
  assert.equal(calls.filter(([, , command]) => String(command).startsWith('Add')).length, 0, 'nada a acrescentar num plist que já tem a chave');
});

test('a chave que falta é acrescentada com uma frase legível', () => {
  const { calls, run } = runnerFor();

  assert.equal(ensureSpeechUsageString({ plistPath: '/repo/node_modules/electron/dist/Electron.app/Contents/Info.plist', run, exists: () => true }).status, 'added');
  const add = calls.find(([, , command]) => String(command).startsWith('Add'));
  assert.ok(add, 'a chave precisa ser acrescentada');
  assert.match(String(add[2]), /^Add :NSSpeechRecognitionUsageDescription string \S.*\s\S/, 'o macOS mostra este texto a quem concede a permissão');
  // Sem reassinar, o pacote fica com assinatura quebrada e o macOS pode recusar abri-lo.
  assert.deepEqual(calls.find(([file]) => file === 'codesign'), ['codesign', '--force', '--sign', '-', '--deep', '/repo/node_modules/electron/dist/Electron.app'], 'assina o pacote, não o arquivo dentro dele');
});

test('uma falha ao escrever, ou ao reassinar, vira aviso e nunca exceção que derruba o dev', () => {
  const { run } = runnerFor({ addFails: true });

  const result = ensureSpeechUsageString({ plistPath: '/repo/node_modules/electron/dist/Electron.app/Contents/Info.plist', run, exists: () => true });

  assert.equal(result.status, 'failed');
  assert.match(describeSpeechUsageString(result), /read-only volume/);
});

test('sem o Electron baixado, o aviso diz isso e nada é executado', () => {
  const { calls, run } = runnerFor();

  assert.equal(ensureSpeechUsageString({ plistPath: '/repo/node_modules/electron/dist/Electron.app/Contents/Info.plist', run, exists: () => false }).status, 'absent');
  assert.deepEqual(calls, []);
});

test('o caminho feliz não imprime nada, porque não há o que contar', () => {
  assert.equal(describeSpeechUsageString({ status: 'present' }), '');
  assert.match(describeSpeechUsageString({ status: 'added' }), /acrescentado/);
});
