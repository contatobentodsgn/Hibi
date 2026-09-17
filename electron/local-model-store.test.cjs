const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createLocalModelStore } = require('./local-model-store.cjs');

const conteudo = Buffer.from('modelo minúsculo, mas suficiente para conferir o resumo');
const sha256 = crypto.createHash('sha256').update(conteudo).digest('hex');
const manifesto = { schema: 'hibi.local-model', version: 1, id: 'tiny-q4', modelVersion: '1', sizeBytes: conteudo.length, sha256 };

const montar = ({ comArquivo = true, bytes = conteudo, comManifesto = true } = {}) => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hibi-modelo-'));
  const raiz = path.join(dataRoot, '.hibi-local-models');
  fs.mkdirSync(raiz, { recursive: true });
  if (comManifesto) fs.writeFileSync(path.join(raiz, 'manifest.json'), JSON.stringify(manifesto));
  if (comArquivo) fs.writeFileSync(path.join(raiz, 'tiny-q4.bin'), bytes);
  return { dataRoot, raiz, store: createLocalModelStore({ dataRoot }) };
};

test('sem o arquivo, o estado diz que falta baixar, e não que está pronto', () => {
  const { store } = montar({ comArquivo: false });

  assert.deepEqual(store.describe(), { status: 'missing', modelId: 'tiny-q4', sizeBytes: conteudo.length, error: null });
});

test('um arquivo do tamanho errado é recusado sem ler o conteúdo', () => {
  const { store } = montar({ bytes: Buffer.concat([conteudo, Buffer.from('a mais')]) });

  const estado = store.describe();

  assert.equal(estado.status, 'unverified');
  assert.match(estado.error, /size the manifest declares/);
});

test('a verificação completa deixa um recibo, e a abertura seguinte não refaz a conta', async () => {
  const { store, raiz } = montar();

  assert.equal(store.describe().status, 'unverified');
  assert.deepEqual(await store.verify(), { verified: true, modelId: 'tiny-q4', error: null });

  const recibo = JSON.parse(fs.readFileSync(path.join(raiz, 'tiny-q4.verified.json'), 'utf8'));
  assert.equal(recibo.sha256, sha256);
  assert.equal(recibo.sizeBytes, conteudo.length);
  // Com o recibo batendo, o estado é "pronto" sem tocar no arquivo de quase dois gigabytes.
  assert.equal(store.describe().status, 'ready');
});

test('um arquivo trocado por baixo invalida o recibo', async () => {
  const { store, raiz } = montar();
  await store.verify();
  assert.equal(store.describe().status, 'ready');

  // Mesmo tamanho, conteúdo outro: é exatamente o caso que a data de modificação pega.
  const trocado = Buffer.from(conteudo);
  trocado[0] = trocado[0] ^ 0xff;
  fs.writeFileSync(path.join(raiz, 'tiny-q4.bin'), trocado);

  assert.equal(store.describe().status, 'unverified');
  assert.deepEqual(await store.verify(), { verified: false, modelId: 'tiny-q4', error: 'The local model does not match the checksum the manifest declares.' });
});

test('o caminho só é entregue depois de o conteúdo bater com o manifesto', async () => {
  const { store, raiz } = montar();

  const caminho = await store.resolveVerifiedPath();
  assert.equal(caminho, path.join(raiz, 'tiny-q4.bin'));

  const outro = Buffer.from(conteudo);
  outro[1] = outro[1] ^ 0xff;
  fs.writeFileSync(path.join(raiz, 'tiny-q4.bin'), outro);
  fs.rmSync(path.join(raiz, 'tiny-q4.verified.json'));

  // Conteúdo diferente do declarado: nada é entregue ao motor, mesmo com o arquivo lá.
  assert.equal(await store.resolveVerifiedPath(), null);
});

test('um manifesto ilegível não vira modelo pronto', () => {
  const { store, raiz } = montar({ comManifesto: false });
  fs.writeFileSync(path.join(raiz, 'manifest.json'), '{ isto não é json');

  const estado = store.describe();

  assert.equal(estado.status, 'unavailable');
  assert.equal(estado.modelId, null);
});

test('trocar o manifesto invalida o recibo do arquivo antigo', async () => {
  const { store, raiz, dataRoot } = montar();
  await store.verify();
  assert.equal(store.describe().status, 'ready');

  // Mesmo arquivo, manifesto novo: é o caso de trocar a versão do modelo mantendo o nome.
  fs.writeFileSync(path.join(raiz, 'manifest.json'), JSON.stringify({ ...manifesto, sha256: 'c'.repeat(64) }));

  const outro = createLocalModelStore({ dataRoot });
  assert.equal(outro.describe().status, 'unverified');
});
