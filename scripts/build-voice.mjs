import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Compila o helper de voz e o deixa pronto para o macOS pedir a permissão.
 *
 * Duas coisas que o `swiftc` sozinho não faz e sem as quais a captura falha em silêncio:
 *
 * 1. O `Info.plist` precisa estar **dentro** do binário. O macOS só mostra o pedido de microfone e de
 *    reconhecimento de fala se o processo responsável trouxer os textos de uso; sem eles não há
 *    diálogo, e a permissão é negada sem explicação.
 * 2. A assinatura precisa carregar o entitlement de entrada de áudio. Aqui ela é ad-hoc, que basta
 *    neste Mac; no empacotamento de release o electron-builder reassina com o certificado de verdade,
 *    preservando o mesmo entitlement.
 */
export function buildVoiceHelper({ root, run = (file, args) => execFileSync(file, args, { stdio: 'inherit' }), ensureDir = (dir) => mkdirSync(dir, { recursive: true }) } = {}) {
  const base = resolve(root);
  const source = resolve(base, 'native/voice/hibi-voice.swift');
  const plist = resolve(base, 'native/voice/hibi-voice.plist');
  const entitlements = resolve(base, 'native/voice/hibi-voice.entitlements');
  const output = resolve(base, 'native/voice/build/hibi-voice');
  ensureDir(dirname(output));
  run('swiftc', ['-parse-as-library', source, '-o', output, '-framework', 'Speech', '-framework', 'AVFoundation',
    '-Xlinker', '-sectcreate', '-Xlinker', '__TEXT', '-Xlinker', '__info_plist', '-Xlinker', plist]);
  run('codesign', ['--force', '--sign', '-', '--options', 'runtime', '--entitlements', entitlements, output]);
  return output;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) buildVoiceHelper({ root: fileURLToPath(new URL('..', import.meta.url)) });
