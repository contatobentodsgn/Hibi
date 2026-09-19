import React from 'react'
import { CalendarDays, CheckCheck, Feather, House, Sparkles } from 'lucide-react'
import { useT } from '../../i18n/LocaleProvider'
import { AdaptiveNotchNavigation, type NotchPosition } from './AdaptiveNotchNavigation'
import { NotchActions } from './NotchActions'
import { useNavigationPreferences } from './NavigationPreferencesProvider'
import { ShellTopbar } from './ShellTopbar'
import { DESTINATIONS, destinationFor, sectionLabelKey, type DestinationKey, type NavKey } from './routes'
import './notch.css'
import './shell.css'

export type { NavKey } from './routes'

// `position` fixa a posição (a prévia de desenvolvimento usa); sem ela, vale a preferência (U04).
type Props = Readonly<{ active: NavKey; onNavigate: (key: NavKey) => void; onOpenCommands: () => void; position?: NotchPosition; children: React.ReactNode }>

// Os ícones dos destinos no preview aprovado.
const ICONS: Readonly<Record<DestinationKey, typeof House>> = { home: House, agenda: CalendarDays, tasks: CheckCheck, notes: Feather, taby: Sparkles }

export function AppShell({ active, onNavigate, onOpenCommands, position, children }: Props) {
  const t = useT()
  const { position: preferredPosition } = useNavigationPreferences()
  const place = destinationFor(active)
  const items = DESTINATIONS.map((item) => ({ id: item.key, label: t(item.label), icon: ICONS[item.key] }))
  // `.shell` é lida por `body:has(.shell)` em shell.css e refined-ui.css para manter o fundo da janela
  // transparente atrás do overlay de notch nativo — renomear esta classe quebra esse contrato em silêncio,
  // sem nenhum teste falhando.
  return <div className="shell">
    <AdaptiveNotchNavigation
      items={items}
      activeId={place === null || place === 'settings' ? null : place}
      position={position ?? preferredPosition}
      label={t('shell.navigation')}
      currentLabel={t(sectionLabelKey(active))}
      switchLabel={t('redesign.nav.switch')}
      showLogo={false}
      rightContent={<NotchActions active={active} onNavigate={onNavigate} onOpenCommands={onOpenCommands} />}
      onActiveChange={(id) => onNavigate(id as NavKey)}
    >
      <div className="shell-page">
        <ShellTopbar active={active} />
        <main className="shell-content">{children}</main>
      </div>
    </AdaptiveNotchNavigation>
  </div>
}
