export type IntegrationCapability = 'import' | 'write' | 'sync' | 'notify'
export type IntegrationState = 'connected' | 'disconnected' | 'error'

export type IntegrationDescriptor = Readonly<{
  id: string
  label: string
  capabilities: readonly IntegrationCapability[]
}>

export type IntegrationStatus = IntegrationDescriptor & Readonly<{
  state: IntegrationState
  hasCredential: boolean
  lastSyncAt?: string
  error?: string
}>

export type PreparedIntegrationAction = Readonly<{
  id: string
  connectorId: string
  kind: string
  confirmationId: string
  requiresConfirmation: true
}>

export type IntegrationAuditEvent = Readonly<{
  at: string
  action: string
  connectorId: string
  detail: string
}>
