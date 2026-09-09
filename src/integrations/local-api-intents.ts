import type { Category } from '../domain/models'

export type LocalApiIntent = Readonly<{ confirmationId: string; kind: string; payload: Record<string, unknown> }>

export function localApiTaskMutation(intent: Pick<LocalApiIntent, 'kind' | 'payload'>): Readonly<{ title: string; durationMinutes: number; category: Category; folder: string; status: 'open' }> | null {
  const title = typeof intent.payload?.title === 'string' ? intent.payload.title.trim() : ''
  if (intent.kind !== 'task.create' || !title || title.length > 240) return null
  return { title, durationMinutes: 60, category: 'work', folder: 'Bento', status: 'open' }
}
