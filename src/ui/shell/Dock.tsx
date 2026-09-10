import React, { useEffect, useRef, useState } from 'react'
import { useT } from '../../i18n/LocaleProvider'
import { dockKeyFor, DOCK_ITEMS, MORE_ITEMS, type NavKey } from './routes'

type DockProps = Readonly<{ active: NavKey; onNavigate: (key: NavKey) => void; onOpenCommands: () => void }>

export function DockMoreMenu({ active, onSelect }: Readonly<{ active: NavKey; onSelect: (key: NavKey) => void }>) {
  const t = useT()
  return <div role="menu" className="dock-menu" aria-label={t('shell.more')}>{MORE_ITEMS.map((item) => <button type="button" role="menuitem" key={item.key} aria-current={active === item.key ? 'page' : undefined} onClick={() => onSelect(item.key)}>{t(item.label)}</button>)}</div>
}

export function Dock({ active, onNavigate, onOpenCommands }: DockProps) {
  const t = useT()
  const [moreOpen, setMoreOpen] = useState(false)
  const navRef = useRef<HTMLElement>(null)
  const activeKey = dockKeyFor(active)

  useEffect(() => {
    if (!moreOpen) return
    const close = (event: MouseEvent) => { if (!navRef.current?.contains(event.target as Node)) setMoreOpen(false) }
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
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length
    buttons[next]?.focus()
  }

  return <nav ref={navRef} className="dock" aria-label={t('shell.navigation')} onKeyDown={onKeyDown}>
    {DOCK_ITEMS.map((item) => <button type="button" className="dock-item" key={item.key} aria-current={activeKey === item.key ? 'page' : undefined} onClick={() => onNavigate(item.key)}>{t(item.label)}</button>)}
    <div className="dock-more">
      <button type="button" className="dock-item" aria-haspopup="menu" aria-expanded={moreOpen} aria-label={t('shell.more')} data-active={!DOCK_ITEMS.some((item) => item.key === activeKey)} onClick={() => setMoreOpen((open) => !open)}>···</button>
      {moreOpen && <DockMoreMenu active={active} onSelect={(key) => { setMoreOpen(false); onNavigate(key) }} />}
    </div>
    <button type="button" className="dock-item dock-commands" aria-label={t('shell.commands')} onClick={onOpenCommands}><kbd>{t('shell.commandsHint')}</kbd></button>
  </nav>
}
