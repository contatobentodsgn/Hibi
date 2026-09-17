const fs = require('node:fs');
const path = require('node:path');
const { modelPath, modelRoot, validateModelManifest, verifyModelFile } = require('./local-model-contract.cjs');

const RECEIPT_SUFFIX = '.verified.json';

/**
 * Onde o modelo local mora, e se o que está lá é mesmo o modelo declarado.
 *
 * O manifesto fixa tamanho e sha256. Conferir o resumo inteiro leva segundos num arquivo de quase dois
 * gigabytes, então a checagem completa acontece uma vez e deixa um recibo ao lado do arquivo: tamanho,
 * data de modificação e o resumo conferido. Nas aberturas seguintes, tamanho e data batendo bastam —
 * e qualquer divergência manda refazer a conta. Assim o app abre rápido sem passar a carregar um
 * arquivo que alguém trocou por baixo.
 */
function createLocalModelStore({ dataRoot, now = () => new Date().toISOString(), fsImpl = fs } = {}) {
  const root = modelRoot(dataRoot);
  const manifestPath = path.join(root, 'manifest.json');
  const receiptPathFor = (safeId) => path.join(root, `${safeId}${RECEIPT_SUFFIX}`);

  const readManifest = () => {
    try {
      const parsed = JSON.parse(fsImpl.readFileSync(manifestPath, 'utf8'));
      return { manifest: parsed, safe: validateModelManifest(parsed, dataRoot) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unreadable local model manifest.' };
    }
  };

  const readReceipt = (safeId) => {
    try { return JSON.parse(fsImpl.readFileSync(receiptPathFor(safeId), 'utf8')); } catch { return null; }
  };

  return {
    root,
    manifestPath,
    /** O estado que a tela mostra, sem nunca ler o modelo inteiro. */
    describe() {
      const { manifest, safe, error } = readManifest();
      if (!safe) return { status: 'unavailable', modelId: null, error };
      const file = modelPath(manifest, dataRoot);
      let info;
      try { info = fsImpl.statSync(file); } catch { return { status: 'missing', modelId: safe.id, sizeBytes: safe.sizeBytes, error: null }; }
      if (info.size !== safe.sizeBytes) return { status: 'unverified', modelId: safe.id, sizeBytes: safe.sizeBytes, error: 'The local model file does not match the size the manifest declares.' };
      const receipt = readReceipt(safe.id);
      const verified = Boolean(receipt) && receipt.sha256 === safe.sha256 && receipt.sizeBytes === info.size && receipt.mtimeMs === info.mtimeMs;
      return { status: verified ? 'ready' : 'unverified', modelId: safe.id, sizeBytes: safe.sizeBytes, error: verified ? null : 'The local model has not been verified since it changed.' };
    },
    /** Confere o arquivo inteiro e, passando, guarda o recibo que dispensa a próxima conferência. */
    async verify() {
      const { manifest, safe, error } = readManifest();
      if (!safe) return { verified: false, modelId: null, error };
      const file = modelPath(manifest, dataRoot);
      const ok = await verifyModelFile(file, manifest, dataRoot);
      if (!ok) return { verified: false, modelId: safe.id, error: 'The local model does not match the checksum the manifest declares.' };
      const info = fsImpl.statSync(file);
      fsImpl.writeFileSync(receiptPathFor(safe.id), JSON.stringify({ sha256: safe.sha256, sizeBytes: info.size, mtimeMs: info.mtimeMs, verifiedAt: now() }), { encoding: 'utf8', mode: 0o600 });
      return { verified: true, modelId: safe.id, error: null };
    },
    /** O caminho que o motor pode carregar, ou `null` enquanto o arquivo não for o declarado. */
    async resolveVerifiedPath() {
      const state = this.describe();
      if (state.status === 'unavailable' || state.status === 'missing') return null;
      if (state.status === 'ready') { const { manifest } = readManifest(); return modelPath(manifest, dataRoot); }
      const result = await this.verify();
      if (!result.verified) return null;
      const { manifest } = readManifest();
      return modelPath(manifest, dataRoot);
    },
  };
}

module.exports = { RECEIPT_SUFFIX, createLocalModelStore };
