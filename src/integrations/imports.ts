export type RemoteReference = Readonly<{ connectorId: string; remoteId: string; revision?: string }>
export type LocalImportRecord = Readonly<{ id: string; title: string; remoteRef?: RemoteReference }>
export type ImportCandidate = Readonly<{ remoteId: string; revision?: string; title: string; kind: 'task' | 'email'; source?: string }>
export type ImportPreviewItem = ImportCandidate & Readonly<{ state: 'new' | 'duplicate' | 'conflict'; localId?: string }>
export type ImportDecision = 'keep-local' | 'keep-remote' | 'duplicate' | 'skip'
export type ImportMutation = Readonly<{ type: 'none' }> | Readonly<{ type: 'update'; localId: string; title: string; remoteRef: RemoteReference }> | Readonly<{ type: 'create'; title: string; remoteRef: RemoteReference }>

const copyCandidate = (candidate: ImportCandidate): ImportCandidate => ({ ...candidate })
const MAX_IMPORT_BYTES = 1024 * 1024
const candidateFrom = (value: unknown, index: number): ImportCandidate | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const item = value as Record<string, unknown>
  const remoteId = typeof item.id === 'string' && item.id.trim() ? item.id.trim().slice(0, 240) : `row-${index + 1}`
  const title = typeof item.title === 'string' && item.title.trim() ? item.title.trim().slice(0, 240) : undefined
  return title ? { remoteId, title, kind: 'task' } : undefined
}

export function parseImportCandidates(filename: string, content: string): readonly ImportCandidate[] {
  if (typeof content !== 'string' || content.length > MAX_IMPORT_BYTES) throw new Error('Import file exceeds the size limit.')
  const extension = filename.split('.').pop()?.toLowerCase()
  if (extension === 'json') {
    let parsed: unknown
    try { parsed = JSON.parse(content) } catch { throw new Error('Import JSON is invalid.') }
    return Array.isArray(parsed) ? parsed.map(candidateFrom).filter((value): value is ImportCandidate => Boolean(value)).slice(0, 1_000) : []
  }
  if (extension === 'ics') return [...content.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g)].flatMap((match, index) => {
    const block = match[1]
    const remoteId = block.match(/^UID:(.+)$/m)?.[1]?.trim() || `ics-${index + 1}`
    const title = block.match(/^SUMMARY:(.+)$/m)?.[1]?.trim()
    return title ? [{ remoteId: remoteId.slice(0, 240), title: title.replace(/\\n/g, '\n').slice(0, 240), kind: 'task' as const }] : []
  }).slice(0, 1_000)
  if (extension === 'csv') {
    const [header = '', ...rows] = content.split(/\r?\n/)
    const columns = header.split(',').map((value) => value.trim().toLowerCase())
    const idIndex = columns.indexOf('id')
    const titleIndex = columns.indexOf('title')
    if (titleIndex < 0) throw new Error('CSV import requires a title column.')
    return rows.flatMap((row, index) => {
      const values = row.split(',').map((value) => value.trim())
      const title = values[titleIndex]
      return title ? [{ remoteId: values[idIndex] || `csv-${index + 1}`, title: title.slice(0, 240), kind: 'task' as const }] : []
    }).slice(0, 1_000)
  }
  throw new Error('Unsupported import file type.')
}

export function buildImportPreview(local: readonly LocalImportRecord[], remote: readonly ImportCandidate[], connectorId: string): readonly ImportPreviewItem[] {
  const linked = new Map(local.filter((entry) => entry.remoteRef?.connectorId === connectorId).map((entry) => [entry.remoteRef!.remoteId, entry]))
  const seen = new Set<string>()
  return remote.reduce<ImportPreviewItem[]>((preview, candidate) => {
    if (seen.has(candidate.remoteId)) return preview
    seen.add(candidate.remoteId)
    const existing = linked.get(candidate.remoteId)
    if (!existing) preview.push({ ...copyCandidate(candidate), state: 'new' })
    else if (existing.remoteRef?.revision === candidate.revision) preview.push({ ...copyCandidate(candidate), state: 'duplicate', localId: existing.id })
    else preview.push({ ...copyCandidate(candidate), state: 'conflict', localId: existing.id })
    return preview
  }, [])
}

export function resolveImportDecision(candidate: ImportCandidate, operation: ImportDecision): Readonly<{ operation: ImportDecision; candidate: ImportCandidate }> {
  return { operation, candidate: copyCandidate(candidate) }
}

export function applyImportDecision(local: LocalImportRecord | undefined, candidate: ImportCandidate, operation: ImportDecision, connectorId: string): ImportMutation {
  if (!/^[a-z0-9-]{1,80}$/.test(connectorId)) throw new Error('Import connector is invalid.')
  if (operation === 'keep-local' || operation === 'skip') return { type: 'none' }
  const remoteRef: RemoteReference = { connectorId, remoteId: candidate.remoteId, ...(candidate.revision ? { revision: candidate.revision } : {}) }
  if (operation === 'keep-remote' && local) return { type: 'update', localId: local.id, title: candidate.title, remoteRef }
  return { type: 'create', title: candidate.title, remoteRef }
}
