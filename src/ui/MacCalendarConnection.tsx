import React, { useEffect, useState } from 'react'
import type { CalendarSyncSource } from './calendar-sync'
import { CalendarSyncPanel } from './CalendarSyncPanel'
import type { CalendarSyncState } from './calendar-sync'

type Props = Readonly<{ onEvent: (action: string, detail: string, result?: string) => void }>

const fallback: CalendarSyncSource = { id: 'apple', provider: 'apple', label: 'Calendário do Mac', state: 'needs-permission' }

export function MacCalendarConnection({ onEvent }: Props) {
  const [source, setSource] = useState<CalendarSyncSource>(fallback)
  const [busy, setBusy] = useState(false)
  const [syncState, setSyncState] = useState<CalendarSyncState>({ sources: [], calendars: [], conflicts: [] })
  const [notice, setNotice] = useState('O acesso ao Calendário nunca é solicitado silenciosamente.')
  const refresh = async () => {
    const state = await window.hibiDesktop?.getCalendarSyncState?.()
    const next = state?.sources.find((entry) => entry.provider === 'apple')
    if (next) setSource(next)
    if (state) setSyncState(state)
  }
  useEffect(() => { void refresh().catch(() => undefined) }, [])
  const requestAccess = async () => {
    if (!window.hibiDesktop?.requestAppleCalendarAccess) { setNotice('Disponível no app Hibi para macOS.'); return }
    setBusy(true)
    try {
      await window.hibiDesktop.requestAppleCalendarAccess()
      await refresh()
      setNotice('Acesso ao Calendário concedido. Seus calendários podem ser selecionados abaixo.')
      onEvent('calendar-permission', 'Apple Calendar', 'pass')
    } catch {
      setNotice('O acesso completo ao Calendário não foi concedido. Você pode permitir em Ajustes do Sistema.')
      onEvent('calendar-permission', 'Apple Calendar', 'fail')
    } finally { setBusy(false) }
  }
  const connected = source.state === 'connected'
  const connectSource = async (source: CalendarSyncSource) => {
    if (source.provider === 'apple') { await requestAccess(); return }
    if (!window.hibiDesktop?.authorizeIntegration) { setNotice('A conexão Google está disponível no app desktop.'); return }
    try { await window.hibiDesktop.authorizeIntegration('google-calendar'); await refresh(); setNotice('Google Calendar conectado.'); }
    catch { setNotice('Não foi possível conectar o Google Calendar.'); }
  }
  return <div className="connector-block" aria-label="Calendário do Mac">
    <div className="setting-row"><div><strong>Calendário do Mac</strong><span>{connected ? 'Conectado · eventos e calendários disponíveis para leitura' : 'Permissão completa necessária para ler reuniões do Apple Calendar e iCloud.'}</span></div>{connected ? <span className="muted">Conectado</span> : <button className="primary" disabled={busy} onClick={() => void requestAccess()}>{busy ? 'Aguardando permissão…' : 'Permitir Calendário'}</button>}</div>
    <p className="muted" role="status">{notice}</p>
    <CalendarSyncPanel state={syncState} onConnect={(entry) => { void connectSource(entry) }} onChangeMode={(calendar, mode) => { void window.hibiDesktop?.saveCalendarSyncMode?.({ id: calendar.id, mode }).then(setSyncState).catch(() => setNotice('Não foi possível salvar o modo do calendário.')) }} onSync={() => { void refresh().catch(() => setNotice('Não foi possível atualizar os calendários.')) }} onResolveConflict={() => setNotice('A revisão de conflito estará disponível após a próxima sincronização.')} />
  </div>
}
