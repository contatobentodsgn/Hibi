import React from 'react'
import { useT } from '../../i18n/LocaleProvider'
import { Dock } from './Dock'
import { sectionLabelKey, type NavKey } from './routes'
import './shell.css'

export type { NavKey } from './routes'

type Props = Readonly<{ active: NavKey; onNavigate: (key: NavKey) => void; onOpenCommands: () => void; children: React.ReactNode }>

export function AppShell({ active, onNavigate, onOpenCommands, children }: Props) {
  const t = useT()
  // `.shell` é lida por `body:has(.shell)` em shell.css para manter o fundo da janela transparente
  // atrás do overlay de notch nativo — renomear esta classe quebra esse contrato em silêncio,
  // sem nenhum teste falhando.
  return <div className="shell">
    <header className="shell-topbar">
      <button type="button" className="shell-brand" onClick={() => onNavigate('home')}>{t('shell.brand')}</button>
      <span className="shell-crumb" aria-hidden="true">›</span>
      <span className="shell-section">{t(sectionLabelKey(active))}</span>
    </header>
    <main className="shell-content">{children}</main>
    <Dock active={active} onNavigate={onNavigate} onOpenCommands={onOpenCommands} />
  </div>
}
