import type { AiContextEvidence } from './contracts';

export interface AiContextSource {
  readonly tasks?: readonly Readonly<{ id: string; title: string; dueAt?: string }>[];
  readonly reminders?: readonly Readonly<{ id: string; title: string; nextAt?: string }>[];
  readonly schedule?: readonly Readonly<{ id: string; title: string; start: string; end: string }>[];
  readonly notes?: readonly Readonly<{ id: string; title: string }>[],
}

export function selectMinimalContext(message: string, source: AiContextSource): readonly AiContextEvidence[] {
  const query = message.toLocaleLowerCase();
  if (/(agenda|calend|hor.rio|schedule|today|hoje)/u.test(query)) return (source.schedule ?? []).slice(0, 6).map((item) => ({ sourceId: item.id, label: item.title, content: `${item.start}–${item.end}` }));
  if (/(lembrete|remind)/u.test(query)) return (source.reminders ?? []).slice(0, 6).map((item) => ({ sourceId: item.id, label: item.title, content: item.nextAt ?? '' }));
  if (/(taref|task|pend.ncia|todo)/u.test(query)) return (source.tasks ?? []).slice(0, 6).map((item) => ({ sourceId: item.id, label: item.title, content: item.dueAt ?? '' }));
  if (/(nota|note)/u.test(query)) return (source.notes ?? []).slice(0, 6).map((item) => ({ sourceId: item.id, label: item.title, content: '' }));
  return [];
}
