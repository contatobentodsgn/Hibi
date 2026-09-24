import React, { useEffect, useRef, useState } from 'react'
import { FOLDER_NAME_MAX, listFolders, type FolderRenamePlan } from '../../domain/folders'
import type { StudyData } from '../../domain/models'
import { useT } from '../../i18n/LocaleProvider'
import type { NavKey } from '../shell/routes'
import type { AssistantTurnControls } from '../useAssistantTurn'
import type { ConversationsController } from '../useConversations'
import { filterCommands } from './commands'
import { afterRename, filterFolders, folderIntent, previousView, renameOutcome, type PaletteView } from './folder-view'
import { paletteModeFor } from './mode'
import { PaletteFolders } from './PaletteFolders'
import { PaletteTurn } from './PaletteTurn'
import './palette.css'

type Props = Readonly<{
  data: StudyData
  onClose: () => void
  onNavigate: (key: NavKey, options?: { folder?: string }) => void
  onEvent: (action: string, detail: string) => void
  onRenameFolder: (from: string, to: string, expectMerge: boolean) => FolderRenamePlan
  turn: AssistantTurnControls
  conversations: ConversationsController
}>

// Um campo, várias vistas: "/" filtra comandos; uma frase vai para o Assistant e confirma aqui mesmo;
// `/folder` troca para a vista de pastas, onde o mesmo campo filtra e renomeia pastas.
export function CommandPalette({ data, onClose, onNavigate, onEvent, onRenameFolder, turn, conversations }: Props) {
  const t = useT()
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [view, setView] = useState<PaletteView>({ kind: 'commands' })
  const [notice, setNotice] = useState<string | null>(null)
  const paletteRef = useRef<HTMLElement>(null)
  const turnRef = useRef(turn)
  turnRef.current = turn
  // O turno é compartilhado com a página Assistant (ver App.tsx); "submitted !== null" é o que distingue
  // um turno que ESTA instância da paleta pediu de um turno levantado alhures (ex.: confirmação na
  // página Assistant enquanto a paleta está com o campo vazio). Precisa de ref porque o cleanup de
  // unmount roda com deps `[]` e, sem isso, veria sempre o valor da montagem.
  const startedByThisRef = useRef(submitted !== null)
  startedByThisRef.current = submitted !== null
  // Pelo mesmo motivo a vista vive numa ref: o listener de `esc` é registrado uma vez só.
  const viewRef = useRef(view)
  viewRef.current = view
  const { state } = turn
  // Um turno "ativo" cobre qualquer status além de idle enquanto submitted !== null: streaming,
  // resposta, confirmação pendente, falha, executado ou cancelado ainda contam — a paleta só
  // volta a comandos quando o usuário digita "/" de novo (ver onChange) ou fecha o diálogo.
  const turnActive = submitted !== null && state.status !== 'idle'
  const mode = paletteModeFor(query, turnActive)
  const matches = filterCommands(query, t)
  const folders = view.kind === 'folders' ? filterFolders(listFolders(data), query, t) : []
  const settled = state.status === 'replied' || state.status === 'executed' || state.status === 'cancelled' || state.status === 'failure'

  useEffect(() => { setSelectedIndex(0) }, [query, view.kind])
  // Fechar nunca executa nada: uma confirmação pendente é cancelada e um stream é parado — mas só
  // quando o turno em voo foi pedido por ESTA instância. Um turno levantado pela página Assistant (ou por
  // uma montagem anterior da paleta) não é nosso para descartar: unmount aqui deve deixá-lo intacto.
  useEffect(() => () => { if (startedByThisRef.current) turnRef.current.dismiss() }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Confirmar uma composição de IME com Esc não deve também voltar um passo e descartar o nome digitado.
      if (event.isComposing || event.keyCode === 229) return
      if (event.key === 'Escape') {
        event.preventDefault()
        // Nas vistas de pastas, `esc` volta um passo; da renomeação de uma junção, volta com o nome digitado.
        const current = viewRef.current
        const previous = previousView(current)
        if (previous) { setView(previous); setQuery(current.kind === 'merge' ? current.to : ''); setNotice(null); return }
        if (!startedByThisRef.current) { onClose(); return }
        if (turnRef.current.dismiss() === 'close') onClose()
        return
      }
      if (event.key !== 'Tab') return
      const root = paletteRef.current
      if (!root) return
      // As linhas viram opções da listbox (role="option"), não paradas do Tab: setas as navegam,
      // então ficam fora da armadilha de foco — só o campo e os botões continuam alcançáveis por Tab.
      const focusable = Array.from(root.querySelectorAll<HTMLElement>('input,button:not([role="option"])')).filter((item) => !(item as HTMLButtonElement).disabled)
      if (!focusable.length) return
      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const openCommand = (index: number) => {
    const item = matches[index]
    if (!item) return
    onEvent('command', item.key)
    if ('action' in item) { setView({ kind: 'folders' }); setQuery(''); setNotice(null); return }
    onNavigate(item.route)
  }
  const openFolder = (index: number, route: 'tasks' | 'notes' = 'tasks') => {
    const folder = folders[index]
    if (!folder) return
    onEvent('folder', `${route} · ${folder.name || 'none'}`)
    onNavigate(route, { folder: folder.name })
  }
  const applyRename = (from: string, to: string, expectMerge: boolean) => {
    const result = onRenameFolder(from, to, expectMerge)
    const outcome = afterRename(result, from, to, expectMerge)
    setView(outcome.view)
    setQuery(outcome.query)
    setNotice(outcome.applied ? t('folders.renamed') : null)
  }
  // A pergunta entra na mesma thread da tela Assistant: o dono do histórico está acima das duas superfícies.
  const send = () => { const message = query.trim(); if (!message) return; conversations.record({ role: 'user', text: message, at: new Date().toISOString() }); setSubmitted(message); setQuery(''); void turn.ask(message) }

  // Digitar "/" com um turno na tela é o usuário pedindo comandos de volta explicitamente.
  // dismiss() primeiro: é o único jeito seguro de sair de uma confirmação pendente (cancela via
  // policy) ou de um stream (para). Só depois reset() zera o estado do turno e limpamos submitted.
  // Importante: isso NÃO dispara quando a query fica vazia — esse era o bug original.
  const handleQueryChange = (value: string) => {
    if (view.kind === 'merge') setView({ kind: 'rename', from: view.from, error: null })
    else if (view.kind === 'rename' && view.error) setView({ ...view, error: null })
    else if (view.kind === 'commands' && turnActive && value.trimStart().startsWith('/')) { turn.dismiss(); turn.reset(); setSubmitted(null) }
    // Um aviso de sucesso ("Pasta renomeada.") não deve sobreviver a uma nova digitação numa vista de
    // pastas — senão parece se referir à ação que o usuário está prestes a fazer agora.
    if (view.kind !== 'commands') setNotice(null)
    setQuery(value)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // O Enter que confirma uma composição de IME não deve aplicar uma renomeação pela metade nem
    // enviar uma frase pela metade.
    if (event.nativeEvent.isComposing) return
    if (view.kind === 'folders') {
      if (folders.length && event.key === 'ArrowDown') { event.preventDefault(); setSelectedIndex((index) => (index + 1) % folders.length); return }
      if (folders.length && event.key === 'ArrowUp') { event.preventDefault(); setSelectedIndex((index) => (index - 1 + folders.length) % folders.length); return }
      if (event.key === 'Enter') event.preventDefault()
      const intent = folderIntent(event, folders[selectedIndex])
      if (intent.type === 'open') openFolder(selectedIndex, intent.route)
      if (intent.type === 'rename') { setView({ kind: 'rename', from: intent.from, error: null }); setQuery(intent.from); setNotice(null) }
      return
    }
    if (view.kind === 'rename') {
      if (event.key !== 'Enter') return
      event.preventDefault()
      const outcome = renameOutcome(data, view.from, query)
      if (outcome.type === 'refuse') setView({ ...view, error: outcome.reason })
      else if (outcome.type === 'confirm-merge') setView(outcome.view)
      else applyRename(outcome.from, outcome.to, false)
      return
    }
    if (view.kind === 'merge') {
      if (event.key !== 'Enter') return
      event.preventDefault()
      applyRename(view.from, view.to, true)
      return
    }
    if (mode === 'command') {
      if (!matches.length) return
      if (event.key === 'ArrowDown') { event.preventDefault(); setSelectedIndex((index) => (index + 1) % matches.length) }
      if (event.key === 'ArrowUp') { event.preventDefault(); setSelectedIndex((index) => (index - 1 + matches.length) % matches.length) }
      if (event.key === 'Enter') { event.preventDefault(); if (query.trim() === '' && settled) onClose(); else openCommand(selectedIndex) }
      return
    }
    if (event.key === 'Enter') { event.preventDefault(); if (state.status === 'confirmation') void turn.confirm(); else if (state.status !== 'streaming') send() }
  }

  const footer = view.kind === 'folders' ? [t('palette.footer.select'), t('folders.footer.tasks'), t('folders.footer.notes'), t('folders.footer.rename'), t('folders.footer.back')]
    : view.kind === 'rename' ? [t('folders.footer.apply'), t('folders.footer.back')]
      : view.kind === 'merge' ? [t('folders.footer.merge'), t('folders.footer.back')]
        : state.status === 'confirmation' ? [t('palette.footer.confirm'), t('palette.footer.cancel')] : state.status === 'streaming' ? [t('palette.footer.cancel')] : mode === 'assistant' ? [t('palette.footer.ask'), t('palette.footer.close')] : [t('palette.footer.select'), t('palette.footer.open'), t('palette.footer.close')]
  const placeholder = view.kind === 'rename' || view.kind === 'merge' ? t('folders.renamePlaceholder') : view.kind === 'folders' ? t('folders.placeholder') : t('palette.placeholder')
  const activeDescendant = view.kind === 'folders' ? (folders[selectedIndex] ? `folder-row-${selectedIndex}` : undefined) : view.kind === 'commands' && mode === 'command' && matches[selectedIndex] ? `command-${matches[selectedIndex].key.slice(1)}` : undefined
  // Padrão combobox do WAI-ARIA: `aria-expanded`/`aria-controls` só apontam para uma listbox que
  // de fato tem opções — 0 comandos ou pastas filtrados não conta, mesmo que a vista seja a certa.
  const showCommandList = view.kind === 'commands' && mode === 'command' && matches.length > 0
  const showFolderList = view.kind === 'folders' && folders.length > 0
  const listboxId = showCommandList ? 'palette-commands' : showFolderList ? 'palette-folders' : undefined

  return <div className="overlay" onMouseDown={onClose}><section ref={paletteRef} className="palette palette--redesign" data-palette-surface="redesign" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={t('palette.title')}>
    <div className="palette-search"><span>{view.kind !== 'commands' ? '▤' : mode === 'command' ? '/' : '✦'}</span><input autoFocus role="combobox" aria-autocomplete="list" aria-expanded={listboxId !== undefined} aria-controls={listboxId} value={query} onChange={(event) => handleQueryChange(event.target.value)} onKeyDown={handleKeyDown} placeholder={placeholder} aria-label={placeholder} aria-activedescendant={activeDescendant} maxLength={view.kind === 'rename' || view.kind === 'merge' ? FOLDER_NAME_MAX : undefined} /></div>
    <div className="palette-body">
      {view.kind !== 'commands' && <p className="palette-folder-notice" role="status">{notice ?? ''}</p>}
      {view.kind !== 'commands'
        ? <PaletteFolders view={view} folders={folders} selectedIndex={selectedIndex} onHover={setSelectedIndex} onOpen={(index) => openFolder(index)} />
        : <>
          {showCommandList && <div role="listbox" id="palette-commands" aria-label={t('palette.commandsList')}>
            {matches.map((item, index) => <button type="button" className="command-row" role="option" aria-selected={index === selectedIndex} tabIndex={-1} id={`command-${item.key.slice(1)}`} data-selected={index === selectedIndex} key={item.key} onMouseEnter={() => setSelectedIndex(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => openCommand(index)}><kbd>{item.key}</kbd><span>{t(item.label)}</span><small>{t(item.group)}</small></button>)}
          </div>}
          {mode === 'command' && !matches.length && <p className="empty">{t('palette.empty')}</p>}
          {submitted !== null && <PaletteTurn submitted={submitted} state={state} turn={turn} />}
        </>}
    </div>
    <div className="palette-footer">{footer.map((hint) => <span key={hint}>{hint}</span>)}</div>
  </section></div>
}
