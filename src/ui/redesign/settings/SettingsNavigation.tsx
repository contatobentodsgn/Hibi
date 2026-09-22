import { SETTINGS_SECTIONS, settingsSectionMatches, type SettingsSectionId } from './settings-sections'

export function SettingsNavigation({ active, query, onQueryChange, onSelect }: { active: SettingsSectionId; query: string; onQueryChange: (value: string) => void; onSelect: (section: SettingsSectionId) => void }) {
  const visible = SETTINGS_SECTIONS.filter((section) => settingsSectionMatches(section, query))
  return <aside className="settings-navigation" aria-label="Seções de ajustes">
    <label htmlFor="settings-search">Pesquisar ajustes</label>
    <input id="settings-search" value={query} placeholder="Pesquisar ajustes" onChange={(event) => onQueryChange(event.target.value)} />
    <nav aria-label="Navegação interna de ajustes">{visible.map((section) => <button type="button" key={section.id} className={section.id === active ? 'is-active' : ''} aria-current={section.id === active ? 'page' : undefined} onClick={() => onSelect(section.id)}><strong>{section.label}</strong><span>{section.description}</span></button>)}</nav>
    {!visible.length && <p role="status">Nenhum ajuste encontrado.</p>}
  </aside>
}
