import React, { useEffect, useRef, useState } from 'react'
import { useT } from '../../i18n/LocaleProvider'
import type { NavKey } from '../shell/routes'
import type { AssistantTurnControls } from '../useAssistantTurn'
import { filterCommands } from './commands'
import { paletteModeFor } from './mode'
import { PaletteTurn } from './PaletteTurn'
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
  const { state } = turn
  // Um turno "ativo" cobre qualquer status além de idle enquanto submitted !== null: streaming,
  // resposta, confirmação pendente, falha, executado ou cancelado ainda contam — a paleta só
  // volta a comandos quando o usuário digita "/" de novo (ver onChange) ou fecha o diálogo.
  const turnActive = submitted !== null && state.status !== 'idle'
  const mode = paletteModeFor(query, turnActive)
  const matches = filterCommands(query, t)
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

  // Digitar "/" com um turno na tela é o usuário pedindo comandos de volta explicitamente.
  // dismiss() primeiro: é o único jeito seguro de sair de uma confirmação pendente (cancela via
  // policy) ou de um stream (para). Só depois reset() zera o estado do turno e limpamos submitted.
  // Importante: isso NÃO dispara quando a query fica vazia — esse era o bug original.
  const handleQueryChange = (value: string) => {
    if (turnActive && value.trimStart().startsWith('/')) { turn.dismiss(); turn.reset(); setSubmitted(null) }
    setQuery(value)
  }

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

  return <div className="overlay" onMouseDown={onClose}><section ref={paletteRef} className="palette" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={t('palette.title')}>
    <div className="palette-search"><span>{mode === 'command' ? '/' : '✦'}</span><input autoFocus value={query} onChange={(event) => handleQueryChange(event.target.value)} onKeyDown={handleKeyDown} placeholder={t('palette.placeholder')} aria-label={t('palette.placeholder')} aria-activedescendant={mode === 'command' && matches[selectedIndex] ? `command-${matches[selectedIndex].key.slice(1)}` : undefined} /></div>
    <div className="palette-body">
      {mode === 'command' && matches.map((item, index) => <button type="button" className="command-row" id={`command-${item.key.slice(1)}`} data-selected={index === selectedIndex} key={item.key} onMouseEnter={() => setSelectedIndex(index)} onClick={() => openCommand(index)}><kbd>{item.key}</kbd><span>{t(item.label)}</span><small>{t(item.group)}</small></button>)}
      {mode === 'command' && !matches.length && <p className="empty">{t('palette.empty')}</p>}
      {submitted !== null && <PaletteTurn submitted={submitted} state={state} turn={turn} />}
    </div>
    <div className="palette-footer">{footer.map((hint) => <span key={hint}>{hint}</span>)}</div>
  </section></div>
}
