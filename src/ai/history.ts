export type AiAuditType = 'turn.received' | 'tool.requested' | 'confirmation.requested' | 'confirmation.confirmed' | 'confirmation.cancelled' | 'tool.completed' | 'failed'

export type AiAuditEvent = Readonly<{
  type: AiAuditType
  requestId: string
  at: string
  provider?: string
  model?: string
  tools?: readonly string[]
  summary: string
}>

const MAX_ENTRIES = 200
const safe = (value: string, maximum = 400) => value.replace(/(?:Bearer\s+|sk-)[^\s,;]+/gi, '[redacted]').replace(/(?:api[_-]?key|token)\s*[:=]\s*[^\s,;]+/gi, '[redacted]').slice(0, maximum)

export class AiHistory {
  private values: AiAuditEvent[] = []
  constructor(private readonly maximum = MAX_ENTRIES) {}

  record(event: AiAuditEvent): void {
    const entry: AiAuditEvent = { ...event, at: event.at, summary: safe(event.summary), ...(event.provider ? { provider: safe(event.provider, 240) } : {}), ...(event.model ? { model: safe(event.model, 240) } : {}), ...(event.tools ? { tools: event.tools.slice(0, 2).map((tool) => safe(tool, 120)) } : {}) }
    this.values = [entry, ...this.values].slice(0, this.maximum)
  }
  entries(): readonly AiAuditEvent[] { return this.values.map((entry) => ({ ...entry, ...(entry.tools ? { tools: [...entry.tools] } : {}) })) }
}
