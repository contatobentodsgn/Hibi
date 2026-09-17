const test = require('node:test');
const assert = require('node:assert/strict');
const notarize = require('./notarize.cjs').default;

const contexto = { electronPlatformName: 'darwin', appOutDir: '/tmp/out', packager: { appInfo: { productFilename: 'Hibi' } } };
const semCredenciais = () => { for (const name of ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID']) delete process.env[name]; };

test('um release sem credenciais falha alto, em vez de sair sem notarizar', async () => {
  semCredenciais();
  delete process.env.HIBI_LOCAL_INSTALL;

  await assert.rejects(() => notarize(contexto), /Notarization credentials are required/);
});

// Instalar a própria versão neste Mac não distribui nada a ninguém: exigir notarização ali só
// impediria a pessoa de rodar o que ela mesma acabou de compilar.
test('a instalação local passa sem notarizar', async () => {
  semCredenciais();
  process.env.HIBI_LOCAL_INSTALL = '1';
  try {
    await notarize(contexto);
  } finally {
    delete process.env.HIBI_LOCAL_INSTALL;
  }
});

test('fora do macOS não há o que notarizar', async () => {
  semCredenciais();
  await notarize({ ...contexto, electronPlatformName: 'win32' });
});
