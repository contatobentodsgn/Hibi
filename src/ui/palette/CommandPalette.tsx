import React, { useEffect, useRef, useState } from 'react'
import { provenanceLabel } from '../../ai/assistant-turn'
import { useT } from '../../i18n/LocaleProvider'
import { failurePresentationFor } from '../assistant-presentation'
import type { NavKey } from '../shell/routes'
import type { AssistantTurnControls } from '../useAssistantTurn'
import { filterCommands } from './commands'
import { paletteModeFor } from './mode'
import './palette.css'

type Props = Readonly<{ onClose: () => void; onNavigate: (key: NavKey) => void; onEvent: (action: string, detail: string) => void; turn: AssistantTurnControls }>

// Um campo, dois modos: "/" filtra comandos; qualquer outra coisa vai para o Taby e confirma aqui mesmo.
export function CommandPalette({ onClose, onNavigate, onEvent, turn }: Props) {
  const t = useT()
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const paletteRef = useRef<HTMLElement>(null)
  const turnRef = useRef(turn)
  turnRef.current = turn
  const mode = paletteModeFor(query)
  const matches = filterCommands(query, t)
  const { state } = turn
  const settled = state.status === 'replied' || state.status === 'executed' || state.status === 'cancelled' || state.status === 'failure'

  useEffect(() => { setSelectedIndex(0) }, [query])
  // Fechar nunca executa nada: uma confirmação pendente é cancelada e um stream é parado.
  useEffect(() => () => { turnRef.current.dismiss() }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); if (turnRef.current.dismiss() === 'close') onClose(); return }
      if (event.key !== 'Tab') return
      const root = paletteRef.current
      if (!root) return
      const focusable = Array.from(root.querySelectorAll<HTMLElement>('input,button')).filter((item) => !(item as HTMLButtonElement).disabled)
      if (!focusable.length) return
      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const openCommand = (index: number) => { const item = matches[index]; if (!item) return; onEvent('command', item.key); onNavigate(item.route) }
  const send = () => { const message = query.trim(); if (!message) return; setSubmitted(message); setQuery(''); void turn.ask(message) }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (mode === 'command') {
      if (!matches.length) return
      if (event.key === 'ArrowDown') { event.preventDefault(); setSelectedIndex((index) => (index + 1) % matches.length) }
      if (event.key === 'ArrowUp') { event.preventDefault(); setSelectedIndex((index) => (index - 1 + matches.length) % matches.length) }
      if (event.key === 'Enter') { event.preventDefault(); if (query.trim() === '' && settled) onClose(); else openCommand(selectedIndex) }
      return
    }
    if (event.key === 'Enter') { event.preventDefault(); if (state.status === 'confirmation') void turn.confirm(); else if (state.status !== 'streaming') send() }
  }

  const footer = state.status === 'confirmation' ? [t('palette.footer.confirm'), t('palette.footer.cancel')] : state.status === 'streaming' ? [t('palette.footer.cancel')] : mode === 'assistant' ? [t('palette.footer.ask'), t('palette.footer.close')] : [t('palette.footer.select'), t('palette.footer.open'), t('palette.footer.close')]
  const failure = state.status === 'failure' ? failurePresentationFor(state.failure) : null
  const provenance = state.status === 'streaming' || state.status === 'replied' || state.status === 'confirmation' ? provenanceLabel(state.provenance) : ''

  return <div className="overlay" onMouseDown={onClose}><section ref={paletteRef} className="palette" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={t('palette.title')}>
    <div className="palette-search"><span>{mode === 'command' ? '/' : '✦'}</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={handleKeyDown} placeholder={t('palette.placeholder')} aria-label={t('palette.placeholder')} aria-activedescendant={mode === 'command' && matches[selectedIndex] ? `command-${matches[selectedIndex].key.slice(1)}` : undefined} /></div>
    {mode === 'command' && matches.map((item, index) => <button type="button" className="command-row" id={`command-${item.key.slice(1)}`} data-selected={index === selectedIndex} key={item.key} onMouseEnter={() => setSelectedIndex(index)} onClick={() => openCommand(index)}><kbd>{item.key}</kbd><span>{t(item.label)}</span><small>{t(item.group)}</small></button>)}
    {mode === 'command' && !matches.length && <p className="empty">{t('palette.empty')}</p>}
    {submitted !== null && <div className="palette-turn" aria-live="polite">
      <div className="palette-line"><span className="tag orange">{t('palette.you')}</span><span>{submitted}</span></div>
      {state.status === 'streaming' && <div className="palette-line" role="status"><span className="tag orange">{t('palette.taby')}</span><div><strong>{state.text || (state.cancelRequested ? t('palette.cancelling') : t('palette.thinking'))}</strong>{provenance && <small className="palette-provenance">{provenance}</small>}<div className="palette-actions"><button type="button" className="outline" onClick={turn.stop}>{t('palette.stop')}</button></div></div></div>}
      {state.status === 'replied' && <div className="palette-line"><span className="tag orange">{t('palette.taby')}</span><div><span className="palette-reply">{state.text}</span>{provenance && <small className="palette-provenance">{provenance}</small>}</div></div>}
      {state.status === 'confirmation' && <div className="palette-line" role="alert"><span className="tag amber">{t('palette.confirmation')}</span><div><strong className="palette-reply">{state.text}</strong>{provenance && <small className="palette-provenance">{provenance}</small>}<div className="palette-actions"><button type="button" className="primary" onClick={() => void turn.confirm()}>{t('palette.confirm')}</button><button type="button" className="outline" onClick={() => void turn.cancelConfirmation()}>{t('palette.cancel')}</button></div></div></div>}
      {state.status === 'executed' && <div className="palette-line"><span className={`tag ${state.partialFailure ? 'amber' : 'green'}`}>{t('palette.taby')}</span><span className="palette-reply">{state.summary}</span></div>}
      {state.status === 'cancelled' && <div className="palette-line"><span className="tag amber">{t('palette.taby')}</span><span>{state.text}</span></div>}
      {failure && <div className="palette-line" role="alert"><span className="tag amber">{t('palette.taby')}</span><div><strong>{failure.title}</strong><p className="muted">{failure.detail}</p><div className="palette-actions">{failure.canRetry && <button type="button" className="outline" onClick={() => void turn.retry()}>{t('palette.retry')}</button>}{failure.canUseLocalFallback && <button type="button" className="primary" onClick={() => void turn.useLocalFallback()}>{t('palette.useLocal')}</button>}</div></div></div>}
    </div>}
    <div className="palette-footer">{footer.map((hint) => <span key={hint}>{hint}</span>)}</div>
  </section></div>
}
