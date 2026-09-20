import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const NOTARIZATION = ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'];
const IDENTITY = 'Developer ID Application';

/**
 * A conferência antes de gastar dez minutos assinando e notarizando.
 *
 * Cada item aqui é uma forma de descobrir tarde demais que o release não vale: sem os
 * entitlements, o app assinado não abre microfone nem calendário; sem identidade, o macOS não
 * substitui uma versão pela outra e a atualização automática nunca se aplica; sem as credenciais
 * de notarização, o Gatekeeper avisa quem baixar que o app não foi verificado.
 *
 * A identidade é procurada no Keychain quando não vem por variável: é onde ela fica depois de
 * instalada, e um `CSC_NAME` digitado errado falharia só no fim do build.
 */
export function checkReleasePreflight({
  env = process.env,
  platform = process.platform,
  root = fileURLToPath(new URL('..', import.meta.url)),
  exists = existsSync,
  run = (file, args) => execFileSync(file, args, { encoding: 'utf8' }),
} = {}) {
  const problems = [];
  if (platform !== 'darwin') problems.push('macOS is required to build and notarize the Hibi release.');
  if (!exists(resolve(root, 'electron/entitlements.mac.plist'))) problems.push('Missing macOS hardened-runtime entitlements.');
  const declared = env.CSC_LINK || env.CSC_NAME;
  if (!declared && !keychainHasIdentity({ run })) problems.push(`No "${IDENTITY}" certificate found. Install one in the Keychain, or set CSC_LINK or CSC_NAME.`);
  const missing = NOTARIZATION.filter((name) => !env[name]);
  if (missing.length) problems.push(`Missing notarization environment variable${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`);
  return { ok: problems.length === 0, problems };
}

function keychainHasIdentity({ run }) {
  try {
    return run('security', ['find-identity', '-v', '-p', 'codesigning']).includes(IDENTITY);
  } catch {
    return false;
  }
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const { ok, problems } = checkReleasePreflight();
  if (!ok) {
    for (const problem of problems) console.error(`- ${problem}`);
    console.error('\nO passo a passo está em docs/release-signing.md.');
    process.exit(1);
  }
  console.log('Release preflight passed. Signing and notarization credentials are present.');
}
