import type { Category, ScheduleBlock } from '../domain/models';

export type LocalAction =
  | { kind: 'create-task'; title: string; durationMinutes: number }
  | { kind: 'create-reminder'; title: string; at: string }
  | { kind: 'create-block'; title: string; start: string; end: string; category: Category }
  | { kind: 'create-note'; title: string; content: string }
  | { kind: 'start-focus' };

export function parseLocalAction(message: string, now = new Date()): LocalAction | null {
  const text = message.trim();
  const lower = text.toLocaleLowerCase('pt-BR');
  if (/^(iniciar|começar|comecar|start).*(foco|focus)/i.test(text)) return { kind: 'start-focus' };
  const task = text.match(/^(?:crie|criar|adicione|adicionar)\s+(?:uma?\s+)?tarefa\s*:?[\s-]*(.+)$/i);
  if (task) return { kind: 'create-task', title: task[1].trim(), durationMinutes: 60 };
  const note = text.match(/^(?:crie|criar|adicione|adicionar)\s+(?:uma?\s+)?nota\s*:?[\s-]*(.+)$/i);
  if (note) return { kind: 'create-note', title: note[1].trim(), content: note[1].trim() };
  const reminder = text.match(/^(?:crie|criar|adicione|adicionar)\s+(?:um\s+)?lembrete\s*:?[\s-]*(.+?)(?:\s+às?\s+(\d{1,2}:\d{2}))?$/i);
  if (reminder) { const time = reminder[2] ?? now.toTimeString().slice(0, 5); const date = now.toISOString().slice(0, 10); return { kind: 'create-reminder', title: reminder[1].trim(), at: `${date}T${time}:00-03:00` }; }
  if (lower.includes('bloco') || lower.includes('agenda')) return null;
  return null;
}

export function describeLocalAction(action: LocalAction): string {
  if (action.kind === 'create-task') return `Criar a tarefa “${action.title}” com duração de ${action.durationMinutes} minutos.`;
  if (action.kind === 'create-reminder') return `Criar o lembrete “${action.title}” para ${action.at.slice(0, 10)} às ${action.at.slice(11, 16)}.`;
  if (action.kind === 'create-note') return `Criar a nota “${action.title}”.`;
  if (action.kind === 'start-focus') return 'Iniciar uma sessão de foco.';
  return `Criar o bloco “${(action as Extract<LocalAction, { kind: 'create-block' }>).title}”.`;
}
