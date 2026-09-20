import assert from 'node:assert/strict';
import test from 'node:test';
import { buildVoiceHelper } from './build-voice.mjs';

const capturar = () => { const chamadas = []; return { chamadas, run: (file, args) => chamadas.push([file, args]), ensureDir: () => {} }; };

test('embute o Info.plist no binário: sem ele o macOS não pede a permissão', () => {
  const { chamadas, run, ensureDir } = capturar();

  buildVoiceHelper({ root: '/projeto', run, ensureDir });

  const [ferramenta, args] = chamadas[0];
  assert.equal(ferramenta, 'swiftc');
  // A seção precisa ir junto na linha de link, apontando para o plist com os textos de uso.
  const secao = args.join(' ');
  assert.match(secao, /-sectcreate .*__TEXT .*__info_plist .*\/projeto\/native\/voice\/hibi-voice\.plist/);
  assert.ok(args.includes('/projeto/native/voice/hibi-voice.swift'));
  assert.ok(args.includes('/projeto/native/voice/build/hibi-voice'));
});

test('assina com o entitlement de entrada de áudio, sem o qual a captura é barrada', () => {
  const { chamadas, run, ensureDir } = capturar();

  buildVoiceHelper({ root: '/projeto', run, ensureDir });

  const [ferramenta, args] = chamadas[1];
  assert.equal(ferramenta, 'codesign');
  assert.deepEqual(args, ['--force', '--sign', '-', '--options', 'runtime', '--entitlements', '/projeto/native/voice/hibi-voice.entitlements', '/projeto/native/voice/build/hibi-voice']);
});

test('a assinatura vem depois da compilação, nunca antes', () => {
  const { chamadas, run, ensureDir } = capturar();

  buildVoiceHelper({ root: '/projeto', run, ensureDir });

  assert.deepEqual(chamadas.map(([ferramenta]) => ferramenta), ['swiftc', 'codesign']);
});
