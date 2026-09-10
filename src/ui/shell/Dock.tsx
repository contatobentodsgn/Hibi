import React, { useEffect, useRef, useState } from 'react'
import { useT } from '../../i18n/LocaleProvider'
import { dockKeyFor, DOCK_ITEMS, MORE_ITEMS, nextFocusIndex, type NavKey } from './routes'

type DockProps = Readonly<{ active: NavKey; onNavigate: (key: NavKey) => void; onOpenCommands: () => void }>

type DockMoreMenuProps = Readonly<{
  active: NavKey
  onSelect: (key: NavKey) => void
  onClose?: (options?: Readonly<{ restoreFocus?: boolean }>) => void
  menuRef?: React.Ref<HTMLDivElement>
}>

export function DockMoreMenu({ active, onSelect, onClose, menuRef }: DockMoreMenuProps) {
  const t = useT()

  // Setas cima/baixo movem o foco entre os itens do menu (com wrap), Home/End vão para as pontas,
  // Escape fecha e devolve o foco ao gatilho "···". stopPropagation evita que o handler de setas
  // do dock (esquerda/direita) trate essas teclas também.
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose?.({ restoreFocus: true }); return }
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    event.stopPropagation()
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
    const index = items.indexOf(document.activeElement as HTMLButtonElement)
    const next = nextFocusIndex(index, items.length, event.key as 'ArrowUp' | 'ArrowDown' | 'Home' | 'End')
    items[next]?.focus()
  }

  return <div ref={menuRef} role="menu" className="dock-menu" aria-label={t('shell.more')} onKeyDown={onKeyDown}>
    {MORE_ITEMS.map((item) => <button type="button" role="menuitem" key={item.key} aria-current={active === item.key ? 'page' : undefined} onClick={() => onSelect(item.key)}>{t(item.label)}</button>)}
  </div>
}

export function Dock({ active, onNavigate, onOpenCommands }: DockProps) {
  const t = useT()
  const [moreOpen, setMoreOpen] = useState(false)
  const navRef = useRef<HTMLElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const activeKey = dockKeyFor(active)

  const closeMenu = (options?: Readonly<{ restoreFocus?: boolean }>) => {
    setMoreOpen(false)
    if (options?.restoreFocus) triggerRef.current?.focus()
  }

  // Ao abrir, foca o primeiro item do menu (renderToStaticMarkup não roda efeitos, então isso não
  // é coberto pelos testes de markup — só pela verificação manual no navegador).
  useEffect(() => {
    if (!moreOpen) return
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
  }, [moreOpen])

  useEffect(() => {
    if (!moreOpen) return
    const close = (event: MouseEvent) => {
      if (navRef.current?.contains(event.target as Node)) return
      // Só devolve o foco ao gatilho se o foco já estava dentro do menu — clicar fora não deve
      // roubar o foco de onde o usuário clicou.
      const focusWasInMenu = !!menuRef.current?.contains(document.activeElement)
      setMoreOpen(false)
      if (focusWasInMenu) triggerRef.current?.focus()
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [moreOpen])

  // Setas movem o foco entre os botões do dock; Escape fecha o menu.
  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') { setMoreOpen(false); return }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    const buttons = Array.from(navRef.current?.querySelectorAll<HTMLButtonElement>('.dock-item') ?? [])
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (index < 0) return
    event.preventDefault()
    const next = nextFocusIndex(index, buttons.length, event.key as 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End')
    buttons[next]?.focus()
  }

  return <nav ref={navRef} className="dock" aria-label={t('shell.navigation')} onKeyDown={onKeyDown}>
    {DOCK_ITEMS.map((item) => <button type="button" className="dock-item" key={item.key} aria-current={activeKey === item.key ? 'page' : undefined} onClick={() => { closeMenu(); onNavigate(item.key) }}>{t(item.label)}</button>)}
    <div className="dock-more">
      <button type="button" ref={triggerRef} className="dock-item" aria-haspopup="menu" aria-expanded={moreOpen} aria-label={t('shell.more')} data-active={!DOCK_ITEMS.some((item) => item.key === activeKey)} onClick={() => setMoreOpen((open) => !open)}>···</button>
      {moreOpen && <DockMoreMenu active={active} onSelect={(key) => { closeMenu(); onNavigate(key) }} onClose={closeMenu} menuRef={menuRef} />}
    </div>
    <button type="button" className="dock-item dock-commands" aria-label={t('shell.commands')} onClick={() => { closeMenu(); onOpenCommands() }}><kbd>{t('shell.commandsHint')}</kbd></button>
  </nav>
}
