export const SETTINGS_SECTIONS = [
  { id: 'General', label: 'Geral', description: 'Idioma, aparência, atalhos e janela' },
  { id: 'AI', label: 'Assistente', description: 'Provedor local, modelo e fallback' },
  { id: 'Integrations', label: 'Integrações', description: 'Calendário, Notion e conexões' },
  { id: 'Focus', label: 'Foco', description: 'Sessões, pausas e lembretes' },
  { id: 'Notifications', label: 'Notificações', description: 'Alertas nativos e lembretes' },
  { id: 'Data', label: 'Dados', description: 'Backup, restauração e suporte' },
  { id: 'About', label: 'Sobre', description: 'Estado local e informações do Hibi' },
] as const

export type SettingsSectionId = typeof SETTINGS_SECTIONS[number]['id']

export const settingsSectionMatches = (section: typeof SETTINGS_SECTIONS[number], query: string) =>
  `${section.label} ${section.description} ${section.id}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
