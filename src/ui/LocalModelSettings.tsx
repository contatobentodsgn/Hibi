import React, { useEffect, useState } from 'react';
import { useT } from '../i18n/LocaleProvider';
import { downloadPercent, formatModelSize, type LocalModelDownload, type LocalModelStatus } from './local-model-format';
import { modelStatusKey } from './local-model-format';

type ModelState = { status: LocalModelStatus; modelId: string | null; sizeBytes?: number; error: string | null };

/**
 * O cérebro offline em Configurações › Dados.
 *
 * O download é sempre pedido: são quase dois gigabytes, e isso é decisão de quem usa o app, não do
 * app. Enquanto ele corre, a tela mostra o quanto já veio e permite cancelar; ao fim, o modelo só é
 * dado como pronto se o conteúdo bater com o manifesto — a verificação acontece no processo principal.
 */
export function LocalModelSettings({ onEvent }: { onEvent: (action: string, detail: string, result?: string) => void }) {
  const t = useT();
  const bridge = typeof window === 'undefined' ? undefined : window.hibiDesktop;
  const [state, setState] = useState<ModelState | null>(null);
  const [download, setDownload] = useState<LocalModelDownload | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!bridge?.getLocalModelState) return () => undefined;
    let active = true;
    void bridge.getLocalModelState().then((value) => { if (active) setState(value as ModelState); }).catch(() => undefined);
    const off = bridge.onLocalModelDownloadProgress?.((progress) => {
      if (!active) return;
      setDownload(progress);
      if (progress.status !== 'downloading') void bridge.getLocalModelState?.().then((value) => setState(value as ModelState)).catch(() => undefined);
    });
    return () => { active = false; off?.(); };
  }, [bridge]);

  if (!bridge?.getLocalModelState) {
    return <div className="setting-row"><div><strong>{t('data.model.title')}</strong><span>{t('data.model.desktopOnly')}</span></div></div>;
  }

  const percent = downloadPercent(download);
  const baixando = percent !== null;

  const baixar = async () => {
    setBusy(true);
    setNotice('');
    const resultado = await bridge.downloadLocalModel?.().catch(() => null);
    setBusy(false);
    if (!resultado) return;
    if (resultado.status === 'error') { setNotice(resultado.error ?? t('data.model.failed')); onEvent('download', t('data.model.title'), 'fail'); return; }
    if (resultado.status === 'ready') onEvent('download', t('data.model.title'), 'pass');
  };

  const conferir = async () => {
    setBusy(true);
    const resultado = await bridge.verifyLocalModel?.().catch(() => null);
    setBusy(false);
    setNotice(resultado?.verified ? t('data.model.verified') : (resultado?.error ?? t('data.model.failed')));
    void bridge.getLocalModelState?.().then((value) => setState(value as ModelState)).catch(() => undefined);
    onEvent('verify', t('data.model.title'), resultado?.verified ? 'pass' : 'fail');
  };

  return <>
    <div className="setting-row">
      <div>
        <strong>{t('data.model.title')}</strong>
        <span>{state ? t(modelStatusKey(state.status)) : t('data.model.status.unavailable')} · {formatModelSize(state?.sizeBytes)}</span>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {baixando
          ? <button className="outline" onClick={() => void bridge.cancelLocalModelDownload?.()}>{t('data.model.cancel')}</button>
          : <>
            {state?.status === 'missing' && <button className="primary" disabled={busy} onClick={() => void baixar()}>{t('data.model.download')}</button>}
            {state?.status === 'unverified' && <button className="outline" disabled={busy} onClick={() => void conferir()}>{t('data.model.verify')}</button>}
          </>}
      </div>
    </div>
    {baixando && <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${percent}%`} style={{ margin: '0 0 12px' }}><span style={{ width: `${percent}%` }} /></div>}
    {notice && <p className="muted" role="status" aria-live="polite" style={{ margin: '0 0 16px' }}>{notice}</p>}
  </>;
}
