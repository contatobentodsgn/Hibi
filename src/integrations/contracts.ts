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

export type NotionSyncSummary = Readonly<{ imported: number; pushed: number; updated: number; skipped: number; failed: number; conflicts: number }>
export type NotionSyncCheckpoint = Readonly<{ localId: string; remoteId: string; localHash: string; remoteRevision: string }>
export type NotionConnectorState = Readonly<{
  workspaceLabel: string
  parentPageId: string
  databaseId: string
  dataSourceId: string
  lastSyncAt: string
  lastSummary: NotionSyncSummary
  checkpoints: readonly NotionSyncCheckpoint[]
}>

export type ConnectorSettings = Readonly<{
  endpoint: string
  clientId: string
  targets: readonly IntegrationImportTarget[]
  notion?: NotionConnectorState
}>

export type IntegrationAuthorization = Readonly<{
  connectorId: string
  connected: boolean
  hasRefreshToken: boolean
  expiresAt?: string
}>

export type IntegrationConnectionTest = Readonly<{ ok: boolean; detail: string }>
