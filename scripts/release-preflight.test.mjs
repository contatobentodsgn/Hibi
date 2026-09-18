import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkReleasePreflight } from './release-preflight.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const completo = { APPLE_ID: 'quem@apple.id', APPLE_APP_SPECIFIC_PASSWORD: 'x', APPLE_TEAM_ID: 'TEAM123' };
const comIdentidade = () => '  1) ABC "Developer ID Application: Fulano (TEAM123)"\n';

test('com certificado no Keychain e as três credenciais, o release pode começar', () => {
  assert.deepEqual(checkReleasePreflight({ env: completo, platform: 'darwin', exists: () => true, run: comIdentidade }), { ok: true, problems: [] });
});

test('sem certificado nenhum, diz qual tipo instalar em vez de falhar no fim do build', () => {
  const { ok, problems } = checkReleasePreflight({ env: completo, platform: 'darwin', exists: () => true, run: () => '  0 identities found' });

  assert.equal(ok, false);
  assert.match(problems[0], /Developer ID Application/);
});

// Um certificado de desenvolvimento assina para depurar; o Gatekeeper recusa na outra máquina.
test('certificado de desenvolvimento não passa por certificado de distribuição', () => {
  const soDesenvolvimento = () => '  1) ABC "Apple Development: Fulano (TEAM123)"\n';

  assert.equal(checkReleasePreflight({ env: completo, platform: 'darwin', exists: () => true, run: soDesenvolvimento }).ok, false);
});

test('um certificado declarado por variável dispensa a busca no Keychain', () => {
  const resultado = checkReleasePreflight({ env: { ...completo, CSC_NAME: 'Developer ID Application: Fulano' }, platform: 'darwin', exists: () => true, run: () => { throw new Error('não deveria consultar'); } });

  assert.equal(resultado.ok, true);
});

test('cada credencial de notarização que falta é nomeada', () => {
  const { problems } = checkReleasePreflight({ env: { APPLE_ID: 'quem@apple.id' }, platform: 'darwin', exists: () => true, run: comIdentidade });

  assert.match(problems.join(' '), /APPLE_APP_SPECIFIC_PASSWORD/);
  assert.match(problems.join(' '), /APPLE_TEAM_ID/);
  assert.doesNotMatch(problems.join(' '), /APPLE_ID,/);
});

test('sem os entitlements o app assinado não abriria microfone nem calendário', () => {
  const { problems } = checkReleasePreflight({ env: completo, platform: 'darwin', exists: () => false, run: comIdentidade });

  assert.match(problems.join(' '), /entitlements/);
});

test('fora do macOS não há release para assinar', () => {
  assert.equal(checkReleasePreflight({ env: completo, platform: 'linux', exists: () => true, run: comIdentidade }).ok, false);
});

// A publicação é o que liga a atualização automática: sem os segredos no passo do build, o pacote
// sai sem assinatura e sem notarização, e o app instalado nunca conseguiria aplicá-lo.
test('o workflow de release publica por tag e leva as cinco credenciais ao build', () => {
  const workflow = readFileSync(`${root}.github/workflows/release.yml`, 'utf8');
  const build = workflow.slice(workflow.indexOf('Construir, assinar, notarizar e publicar'));

  assert.match(workflow, /tags:\n\s+- 'v\*'/);
  for (const secret of ['CSC_LINK', 'CSC_KEY_PASSWORD', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID']) {
    assert.match(build, new RegExp(`${secret}: \\$\\{\\{ secrets.${secret} \\}\\}`), `${secret} precisa chegar ao build`);
  }
  assert.match(build, /--publish always/);
});
