import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const KEY = 'NSSpeechRecognitionUsageDescription';
const TEXT = 'Pixano recognises your speech on this Mac to type what you dictate.';
const PLIST_BUDDY = '/usr/libexec/PlistBuddy';

/** `.../Electron.app/Contents/Info.plist` → `.../Electron.app` */
const appBundleOf = (plistPath) => plistPath.replace(/\/Contents\/Info\.plist$/, '');

export const devElectronPlistPath = (root = fileURLToPath(new URL('..', import.meta.url))) =>
  `${root}node_modules/electron/dist/Electron.app/Contents/Info.plist`;

/**
 * Deixa a voz funcionar no app de desenvolvimento.
 *
 * O macOS mata com SIGABRT quem pede reconhecimento de fala sem o texto de uso, e o Electron
 * baixado traz só o de microfone: por isso a voz funcionava no app empacotado e morria em
 * desenvolvimento, sem diálogo nenhum na tela. A chave é acrescentada ao Electron do
 * `node_modules` — que é descartável e volta a cada `npm install` —, nunca ao app empacotado,
 * que já a declara no `package.json`.
 *
 * Nada aqui pode impedir o `npm run desktop` de subir: uma falha vira aviso, não exceção.
 */
export function ensureSpeechUsageString({ plistPath = devElectronPlistPath(), run = execFileSync, exists = existsSync } = {}) {
  if (!exists(plistPath)) return { status: 'absent', plistPath };
  try {
    run(PLIST_BUDDY, ['-c', `Print :${KEY}`, plistPath], { stdio: 'pipe' });
    return { status: 'present', plistPath };
  } catch {
    // Ausente é o caso normal: o Electron baixado nunca traz esta chave.
  }
  try {
    run(PLIST_BUDDY, ['-c', `Add :${KEY} string ${TEXT}`, plistPath], { stdio: 'pipe' });
    // Mexer no Info.plist invalida a assinatura do pacote, e no Apple Silicon um pacote com
    // assinatura quebrada pode nem abrir. A assinatura ad-hoc é a mesma que o Electron já trazia.
    run('codesign', ['--force', '--sign', '-', '--deep', appBundleOf(plistPath)], { stdio: 'pipe' });
    return { status: 'added', plistPath };
  } catch (error) {
    return { status: 'failed', plistPath, error: error instanceof Error ? error.message : String(error) };
  }
}

export function describeSpeechUsageString(result) {
  if (result.status === 'added') return 'Voz em desenvolvimento: texto de reconhecimento de fala acrescentado ao Electron baixado.';
  if (result.status === 'failed') return `Voz em desenvolvimento indisponível: ${result.error}`;
  if (result.status === 'absent') return 'Voz em desenvolvimento indisponível: o Electron baixado não foi encontrado.';
  return '';
}
