const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { MAX_MODEL_BYTES, modelPath, validateModelManifest, verifyModelBuffer } = require('./local-model-contract.cjs');

const root = path.join(path.sep, 'tmp', 'hibi-data');
const bytes = Buffer.from('tiny model');
const manifest = { schema: 'hibi.local-model', version: 1, id: 'tiny-q4', modelVersion: '1', sizeBytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };

test('validates a bounded manifest and keeps the model below the project data root', () => {
  const safe = validateModelManifest(manifest, root);
  assert.equal(safe.id, 'tiny-q4');
  assert.equal(modelPath(manifest, root), path.join(root, '.hibi-local-models', 'tiny-q4.bin'));
});

test('rejects oversized, malformed and unsafe model metadata', () => {
  assert.throws(() => validateModelManifest({ ...manifest, sizeBytes: MAX_MODEL_BYTES + 1 }, root), /exceeds/);
  assert.throws(() => validateModelManifest({ ...manifest, id: '../escape' }, root), /Invalid local model id/);
  assert.throws(() => validateModelManifest({ ...manifest, sha256: 'x' }, root), /checksum/);
  assert.throws(() => validateModelManifest(manifest, 'relative-data-root'), /data root/);
});

test('verifies exact size and checksum before accepting a model', () => {
  assert.equal(verifyModelBuffer(bytes, manifest, root), true);
  assert.equal(verifyModelBuffer(Buffer.from('tampered'), manifest, root), false);
  assert.equal(verifyModelBuffer(Buffer.concat([bytes, Buffer.from('x')]), manifest, root), false);
});

test('um arquivo do tamanho errado é recusado sem abrir o arquivo', async () => {
  const { verifyModelFile } = require('./local-model-contract.cjs');
  let aberturas = 0;

  const resultado = await verifyModelFile('/tmp/inexistente.bin', manifest, root, {
    stat: async () => ({ size: manifest.sizeBytes + 1 }),
    // Ler quase dois gigabytes para descobrir o que o tamanho já dizia é desperdício puro.
    open: async () => { aberturas += 1; throw new Error('não deveria abrir'); },
  });

  assert.equal(resultado, false);
  assert.equal(aberturas, 0);
});
