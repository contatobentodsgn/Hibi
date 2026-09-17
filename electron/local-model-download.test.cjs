const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createLocalModelStore } = require('./local-model-store.cjs');
const { createLocalModelDownload } = require('./local-model-download.cjs');

const conteudo = Buffer.from('modelo pequeno o bastante para um teste honesto');
const sha256 = crypto.createHash('sha256').update(conteudo).digest('hex');
const manifesto = {
  schema: 'hibi.local-model', version: 1, id: 'tiny-q4', modelVersion: '1',
  sizeBytes: conteudo.length, sha256,
  downloadUrl: 'https://huggingface.co/Qwen/Qwen3-1.7B-GGUF/resolve/main/tiny.gguf',
};

const montar = (patch = {}) => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hibi-download-'));
  const raiz = path.join(dataRoot, '.hibi-local-models');
  fs.mkdirSync(raiz, { recursive: true });
  fs.writeFileSync(path.join(raiz, 'manifest.json'), JSON.stringify({ ...manifesto, ...patch }));
  return { dataRoot, raiz, store: createLocalModelStore({ dataRoot }) };
};

const resposta = (bytes, { ok = true, status = 200, contentLength } = {}) => ({
  ok, status,
  headers: { get: (nome) => (nome === 'content-length' ? String(contentLength ?? bytes.length) : null) },
  body: (async function* () { yield bytes; })(),
});

test('baixa, confere e só então o modelo passa a existir', async () => {
  const { store, raiz } = montar();
  const progresso = [];
  const download = createLocalModelDownload({ store, fetchImpl: async () => resposta(conteudo), onProgress: (estado) => progresso.push(estado.status) });

  const resultado = await download.start();

  assert.equal(resultado.status, 'ready');
  assert.equal(fs.readFileSync(path.join(raiz, 'tiny-q4.bin')).toString(), conteudo.toString());
  // O recibo já fica gravado: abrir o app depois não refaz a conta.
  assert.equal(store.describe().status, 'ready');
  assert.deepEqual(progresso, ['downloading', 'downloading', 'ready']);
  assert.equal(fs.existsSync(path.join(raiz, 'tiny-q4.bin.part')), false);
});

test('um download que não bate com o resumo não vira modelo', async () => {
  const { store, raiz } = montar();
  const adulterado = Buffer.from(conteudo);
  adulterado[0] = adulterado[0] ^ 0xff;
  const download = createLocalModelDownload({ store, fetchImpl: async () => resposta(adulterado) });

  const resultado = await download.start();

  assert.equal(resultado.status, 'error');
  assert.match(resultado.error, /checksum the manifest declares/);
  // Nem o arquivo final nem o parcial sobram fingindo ser o cérebro.
  assert.equal(fs.existsSync(path.join(raiz, 'tiny-q4.bin')), false);
  assert.equal(fs.existsSync(path.join(raiz, 'tiny-q4.bin.part')), false);
  assert.equal(store.describe().status, 'missing');
});

test('um endereço fora da lista é recusado antes de qualquer rede', async () => {
  const { store } = montar({ downloadUrl: 'https://exemplo.invalido/modelo.gguf' });
  let buscas = 0;
  const download = createLocalModelDownload({ store, fetchImpl: async () => { buscas += 1; return resposta(conteudo); } });

  const resultado = await download.start();

  assert.equal(resultado.status, 'error');
  // O endereço fora da lista invalida o manifesto inteiro: nada é baixado, e a mensagem diz o motivo.
  assert.match(resultado.error, /Invalid local model download URL|no allowed download address/);
  assert.equal(buscas, 0);
});

test('um corpo maior que o declarado é interrompido em vez de encher o disco', async () => {
  const { store, raiz } = montar();
  const gigante = Buffer.alloc(conteudo.length * 4, 7);
  const download = createLocalModelDownload({ store, fetchImpl: async () => resposta(gigante, { contentLength: conteudo.length }) });

  const resultado = await download.start();

  assert.equal(resultado.status, 'error');
  assert.match(resultado.error, /larger than the model/);
  assert.equal(fs.existsSync(path.join(raiz, 'tiny-q4.bin.part')), false);
});

test('um cabeçalho maior que o declarado nem começa a escrever', async () => {
  const { store } = montar();
  const download = createLocalModelDownload({ store, fetchImpl: async () => resposta(conteudo, { contentLength: 5 * 1024 * 1024 * 1024 }) });

  const resultado = await download.start();

  assert.equal(resultado.status, 'error');
  assert.match(resultado.error, /larger than the model/);
});

test('uma resposta recusada vira erro legível, sem arquivo parcial', async () => {
  const { store, raiz } = montar();
  const download = createLocalModelDownload({ store, fetchImpl: async () => ({ ok: false, status: 404, headers: { get: () => null }, body: null }) });

  const resultado = await download.start();

  assert.equal(resultado.status, 'error');
  assert.match(resultado.error, /refused with status 404/);
  assert.equal(fs.existsSync(path.join(raiz, 'tiny-q4.bin.part')), false);
});

test('cancelar interrompe e não deixa rastro', async () => {
  const { store, raiz } = montar();
  let liberar;
  const travado = new Promise((resolve) => { liberar = resolve; });
  const download = createLocalModelDownload({
    store,
    fetchImpl: async (_url, { signal }) => ({
      ok: true, status: 200, headers: { get: () => String(conteudo.length) },
      body: (async function* () {
        yield conteudo.subarray(0, 4);
        await travado;
        if (signal.aborted) throw Object.assign(new Error('abortado'), { name: 'AbortError' });
        yield conteudo.subarray(4);
      })(),
    }),
  });

  const emCurso = download.start();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(download.cancel(), true);
  liberar();
  const resultado = await emCurso;

  assert.equal(resultado.status, 'cancelled');
  assert.equal(resultado.error, null);
  assert.equal(fs.existsSync(path.join(raiz, 'tiny-q4.bin.part')), false);
  assert.equal(fs.existsSync(path.join(raiz, 'tiny-q4.bin')), false);
});

test('um manifesto sem endereço de download não tenta baixar nada', async () => {
  const { dataRoot, raiz } = montar();
  const semEndereco = { ...manifesto };
  delete semEndereco.downloadUrl;
  fs.writeFileSync(path.join(raiz, 'manifest.json'), JSON.stringify(semEndereco));
  let buscas = 0;
  const download = createLocalModelDownload({ store: createLocalModelStore({ dataRoot }), fetchImpl: async () => { buscas += 1; return resposta(conteudo); } });

  const resultado = await download.start();

  assert.equal(resultado.status, 'error');
  assert.match(resultado.error, /no allowed download address/);
  assert.equal(buscas, 0);
});

test('um download que termina curto não vira modelo', async () => {
  const { store, raiz } = montar();
  const download = createLocalModelDownload({
    store,
    // O servidor fecha a conexão no meio: o arquivo parcial não pode passar por modelo completo.
    fetchImpl: async () => resposta(conteudo.subarray(0, 10), { contentLength: conteudo.length }),
  });

  const resultado = await download.start();

  assert.equal(resultado.status, 'error');
  assert.match(resultado.error, /ended before the model was complete/);
  assert.equal(fs.existsSync(path.join(raiz, 'tiny-q4.bin')), false);
  assert.equal(fs.existsSync(path.join(raiz, 'tiny-q4.bin.part')), false);
});
