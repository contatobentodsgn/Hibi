const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const MAX_MODEL_BYTES = 3 * 1024 * 1024 * 1024;
const MODEL_ROOT_NAME = '.hibi-local-models';
const MANIFEST_VERSION = 1;

function fail(message) { throw new Error(message); }

function validateModelManifest(manifest, dataRoot) {
  if (!manifest || manifest.schema !== 'hibi.local-model' || manifest.version !== MANIFEST_VERSION) fail('Unsupported local model manifest.');
  if (!/^[a-z0-9][a-z0-9._-]{0,80}$/.test(manifest.id || '')) fail('Invalid local model id.');
  if (!Number.isSafeInteger(manifest.sizeBytes) || manifest.sizeBytes <= 0 || manifest.sizeBytes > MAX_MODEL_BYTES) fail('Local model exceeds the allowed size.');
  if (!/^[a-f0-9]{64}$/.test(manifest.sha256 || '')) fail('Invalid local model checksum.');
  if (typeof dataRoot !== 'string' || !path.isAbsolute(dataRoot)) fail('Invalid local model data root.');
  return Object.freeze({ id: manifest.id, version: manifest.modelVersion || '1', sizeBytes: manifest.sizeBytes, sha256: manifest.sha256 });
}

function modelRoot(dataRoot) {
  if (typeof dataRoot !== 'string' || !path.isAbsolute(dataRoot)) fail('Invalid local model data root.');
  return path.join(dataRoot, MODEL_ROOT_NAME);
}

function modelPath(manifest, dataRoot) {
  const safe = validateModelManifest(manifest, dataRoot);
  return path.join(modelRoot(dataRoot), `${safe.id}.bin`);
}

function verifyModelBuffer(buffer, manifest, dataRoot) {
  const safe = validateModelManifest(manifest, dataRoot);
  if (!Buffer.isBuffer(buffer) || buffer.length !== safe.sizeBytes) return false;
  return crypto.createHash('sha256').update(buffer).digest('hex') === safe.sha256;
}

/**
 * O mesmo que `verifyModelBuffer`, lendo do disco em fluxo: o modelo tem quase dois gigabytes, e
 * carregá-lo inteiro na memória só para conferir o resumo é o tipo de coisa que derruba o app numa
 * máquina apertada. O tamanho é conferido antes de abrir o arquivo — um arquivo do tamanho errado já
 * está errado, e ler dois gigabytes para descobrir isso é desperdício.
 */
async function verifyModelFile(filePath, manifest, dataRoot, { open = fs.promises.open, stat = fs.promises.stat } = {}) {
  const safe = validateModelManifest(manifest, dataRoot);
  let handle;
  try {
    const info = await stat(filePath);
    if (info.size !== safe.sizeBytes) return false;
    handle = await open(filePath, 'r');
    const hash = crypto.createHash('sha256');
    for await (const chunk of handle.createReadStream({ highWaterMark: 4 * 1024 * 1024 })) hash.update(chunk);
    return hash.digest('hex') === safe.sha256;
  } catch {
    return false;
  } finally {
    await handle?.close?.().catch(() => {});
  }
}

module.exports = { MAX_MODEL_BYTES, MODEL_ROOT_NAME, MANIFEST_VERSION, validateModelManifest, modelRoot, modelPath, verifyModelBuffer, verifyModelFile };
