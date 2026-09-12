export type CalendarSyncProvider = 'apple' | 'google'
export type CalendarSyncMode = 'disabled' | 'read-only' | 'bidirectional'
export type CalendarSyncSourceState = 'connected' | 'disconnected' | 'needs-permission' | 'error'
export type CalendarSyncConflictKind = 'concurrent-update' | 'remote-deleted'

export type CalendarSyncSource = Readonly<{
  id: string
  provider: CalendarSyncProvider
  label: string
  state: CalendarSyncSourceState
  lastSyncedAt?: string
  error?: 'invalid-credential' | 'permission-denied' | 'temporarily-unavailable' | 'configuration-incomplete'
}>

export type CalendarSyncCalendar = Readonly<{
  id: string
  sourceId: string
  label: string
  mode: CalendarSyncMode
  lastSyncedAt?: string
}>

export type CalendarSyncConflict = Readonly<{
  id: string
  calendarId: string
  kind: CalendarSyncConflictKind
  summary: string
}>

export type CalendarSyncState = Readonly<{
  sources: readonly CalendarSyncSource[]
  calendars: readonly CalendarSyncCalendar[]
  conflicts: readonly CalendarSyncConflict[]
}>

export const isCalendarSyncProvider = (value: unknown): value is CalendarSyncProvider => value === 'apple' || value === 'google'
export const isCalendarSyncMode = (value: unknown): value is CalendarSyncMode => value === 'disabled' || value === 'read-only' || value === 'bidirectional'
