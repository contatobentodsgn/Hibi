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

export type IntegrationImportTarget = Readonly<{ id: string; label: string }>

export type ConnectorSettings = Readonly<{
  endpoint: string
  clientId: string
  targets: readonly IntegrationImportTarget[]
}>

export type IntegrationAuthorization = Readonly<{
  connectorId: string
  connected: boolean
  hasRefreshToken: boolean
  expiresAt?: string
}>

export type IntegrationConnectionTest = Readonly<{ ok: boolean; detail: string }>
