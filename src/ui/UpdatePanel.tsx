import React, { useEffect, useState } from 'react';

type UpdateState = { status: string; version: string | null; error: string | null; percent?: number };

/**
 * O painel de atualizações, ligado ao serviço do processo principal.
 *
 * Nada desce sozinho: a pessoa pede a verificação, depois o download, depois a instalação. Sem feed
 * no empacotamento — que é o caso de qualquer build local — o serviço vem `disabled`, e a tela diz
 * isso em vez de oferecer um botão que não faria nada.
 */
export function UpdatePanel() {
  const [state, setState] = useState<UpdateState>({ status: 'disabled', version: null, error: null });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const bridge = typeof window === 'undefined' ? undefined : window.pixanoDesktop;
    if (!bridge?.getUpdateState) return () => undefined;
    let active = true;
    void bridge.getUpdateState().then((value) => { if (active) setState(value); }).catch(() => undefined);
    const off = bridge.onUpdateState?.((value) => { if (active) setState(value); });
    return () => { active = false; off?.(); };
  }, []);

  const pedir = async (action: 'checkForUpdate' | 'downloadUpdate' | 'installUpdate') => {
    setBusy(true);
    const next = await window.pixanoDesktop?.[action]?.().catch(() => null);
    setBusy(false);
    if (next) setState(next);
  };

  const titulo = state.status === 'disabled' ? 'Nenhuma origem de atualização configurada'
    : state.status === 'available' ? `Pixano ${state.version ?? ''} disponível`
    : state.status === 'downloaded' ? 'Reinicie para aplicar'
    : state.status === 'downloading' ? `Baixando ${state.percent ?? 0}%`
    : state.status === 'current' ? 'Você está na versão mais recente'
    : state.status === 'checking' ? 'Procurando…'
    : state.status === 'error' ? 'A atualização não pôde continuar' : 'Serviço de atualização';
  const detalhe = state.error ?? (state.status === 'disabled'
    ? 'Builds locais nunca falam com servidor de atualização. Um app publicado e assinado traz o endereço do feed dentro dele.'
    : 'Nada é baixado sem você pedir.');

  return <section className="settings-card" aria-label="Atualizações" style={{ marginTop: 15 }}>
    <div className="setting-row">
      <div><strong>{titulo}</strong><span>{detalhe}</span></div>
      <b className={`pill ${state.status === 'current' || state.status === 'downloaded' ? 'green' : 'amber'}`}>{state.status}</b>
    </div>
    {state.status !== 'disabled' && <div className="setting-row"><div><strong>Ações</strong><span>Cada passo é pedido, um de cada vez.</span></div><div style={{ display: 'flex', gap: 8 }}>
      {state.status === 'available' ? <button className="primary" disabled={busy} onClick={() => void pedir('downloadUpdate')}>Baixar</button>
        : state.status === 'downloaded' ? <button className="primary" disabled={busy} onClick={() => void pedir('installUpdate')}>Reiniciar e instalar</button>
        : <button className="outline" disabled={busy || state.status === 'downloading'} onClick={() => void pedir('checkForUpdate')}>Procurar atualizações</button>}
    </div></div>}
  </section>;
}
