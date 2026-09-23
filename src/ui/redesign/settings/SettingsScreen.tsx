import { useState } from 'react'
import { SettingsWorkspace, type SettingsViewProps } from '../../SettingsView'
import { SettingsNavigation } from './SettingsNavigation'
import { type SettingsSectionId } from './settings-sections'
import './settings-screen.css'

export function SettingsScreen(props: SettingsViewProps) {
  const [active, setActive] = useState<SettingsSectionId>('General')
  const [query, setQuery] = useState('')
  return <div className="hibi-ui settings-screen" data-screen="settings">
    <div className="settings-screen__intro"><p className="eyebrow">PIXANO</p><h1>Ajustes</h1><p>Personalize o espaço sem esconder o que importa.</p></div>
    <div className="settings-screen__layout"><SettingsNavigation active={active} query={query} onQueryChange={setQuery} onSelect={setActive} /><section className="settings-screen__content" data-settings-section={active}><SettingsWorkspace key={active} {...props} initialTab={active} /></section></div>
  </div>
}
