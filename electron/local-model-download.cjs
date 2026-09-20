const fs = require('node:fs');
const path = require('node:path');
const { modelPath, validateModelManifest, MAX_MODEL_BYTES } = require('./local-model-contract.cjs');

const PART_SUFFIX = '.part';

/**
 * Traz o modelo local do endereço que o manifesto fixa.
 *
 * Três regras, cada uma por um motivo concreto:
 *
 * 1. **Só HTTPS, e só dos hosts da lista.** Um manifesto é um arquivo no disco; sem a lista, trocar
 *    uma linha dele faria o app baixar qualquer coisa de qualquer lugar e chamar de cérebro.
 * 2. **Nada vira modelo antes de bater com o resumo.** O download grava num `.part`; só depois de o
 *    sha256 conferir é que o arquivo recebe o nome definitivo. Um download interrompido ou adulterado
 *    fica onde está, sem nunca ser carregado.
 * 3. **O tamanho tem teto.** Nem o cabeçalho nem o corpo podem passar do que o manifesto declara, para
 *    um endereço trocado não encher o disco.
 */
function createLocalModelDownload({ store, fetchImpl = globalThis.fetch, fsImpl = fs, onProgress = () => {} } = {}) {
  let running = null;

  const publish = (state) => { onProgress(state); return state; };

  return {
    isRunning: () => Boolean(running),
    cancel() { if (!running) return false; running.controller.abort(); return true; },
    async start() {
      if (running) return { status: 'downloading', receivedBytes: running.received, totalBytes: running.total, error: null };
      const manifest = store.manifest();
      if (!manifest) return publish({ status: 'error', receivedBytes: 0, totalBytes: 0, error: 'The local model manifest is unreadable.' });
      let safe;
      try { safe = validateModelManifest(manifest, store.dataRoot); }
      catch (error) { return publish({ status: 'error', receivedBytes: 0, totalBytes: 0, error: error instanceof Error ? error.message : 'Invalid local model manifest.' }); }
      if (!safe.downloadUrl) {
        return publish({ status: 'error', receivedBytes: 0, totalBytes: safe.sizeBytes, error: 'This model has no allowed download address.' });
      }
      const target = modelPath(manifest, store.dataRoot);
      const part = `${target}${PART_SUFFIX}`;
      const controller = new AbortController();
      running = { controller, received: 0, total: safe.sizeBytes };
      publish({ status: 'downloading', receivedBytes: 0, totalBytes: safe.sizeBytes, error: null });
      let handle;
      try {
        const response = await fetchImpl(safe.downloadUrl, { signal: controller.signal, redirect: 'follow' });
        if (!response?.ok || !response.body) throw new Error(`The download was refused with status ${response?.status ?? 'unknown'}.`);
        const declared = Number(response.headers?.get?.('content-length'));
        if (Number.isFinite(declared) && declared > 0 && declared > Math.min(safe.sizeBytes, MAX_MODEL_BYTES)) {
          throw new Error('The download is larger than the model the manifest declares.');
        }
        fsImpl.mkdirSync(path.dirname(part), { recursive: true, mode: 0o700 });
        handle = fsImpl.createWriteStream(part, { mode: 0o600 });
        for await (const chunk of response.body) {
          running.received += chunk.length;
          if (running.received > safe.sizeBytes) throw new Error('The download is larger than the model the manifest declares.');
          if (!handle.write(Buffer.from(chunk))) await new Promise((resolve) => handle.once('drain', resolve));
          publish({ status: 'downloading', receivedBytes: running.received, totalBytes: safe.sizeBytes, error: null });
        }
        await new Promise((resolve, reject) => { handle.end((error) => (error ? reject(error) : resolve())); });
        handle = null;
        if (running.received !== safe.sizeBytes) throw new Error('The download ended before the model was complete.');
        fsImpl.renameSync(part, target);
        const verified = await store.verify();
        if (!verified.verified) {
          // Baixado inteiro e ainda assim diferente do declarado: o arquivo não fica para trás fingindo
          // ser o modelo.
          try { fsImpl.rmSync(target, { force: true }); } catch { /* já não está lá */ }
          throw new Error(verified.error ?? 'The downloaded model does not match the manifest.');
        }
        return publish({ status: 'ready', receivedBytes: running.received, totalBytes: safe.sizeBytes, error: null });
      } catch (error) {
        try { handle?.destroy?.(); } catch { /* fluxo já fechado */ }
        try { fsImpl.rmSync(part, { force: true }); } catch { /* nada a limpar */ }
        const cancelled = controller.signal.aborted;
        return publish({
          status: cancelled ? 'cancelled' : 'error',
          receivedBytes: running?.received ?? 0,
          totalBytes: safe.sizeBytes,
          error: cancelled ? null : (error instanceof Error ? error.message : 'The download failed.'),
        });
      } finally {
        running = null;
      }
    },
  };
}

module.exports = { PART_SUFFIX, createLocalModelDownload };
