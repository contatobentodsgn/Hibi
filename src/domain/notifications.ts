import type { RecurrenceRule, StudyData } from './models';

export interface NotificationEntry {
  id: string;
  kind: 'deadline' | 'reminder';
  title: string;
  body: string;
  at: string;
  recurrence?: RecurrenceRule;
  /**
   * A categoria viaja como campo próprio porque o portão de foco (`electron/focus-gate.cjs`) precisa
   * dela para decidir o que silenciar durante uma sessão. Antes ela só existia derretida na frase de
   * `body` ("Important reminder."), e casar uma decisão de agendamento com texto de interface seria
   * frágil — bastaria traduzir a frase para o portão parar de funcionar.
   */
  category?: 'important' | 'wellbeing';
}

export function buildNotificationEntries(data: StudyData): NotificationEntry[] {
  const deadlines = data.tasks
    .filter((task) => task.status !== 'completed' && task.status !== 'paused' && Boolean(task.deadline))
    .map((task) => ({
      id: `deadline:${task.id}`,
      kind: 'deadline' as const,
      title: `Deadline: ${task.title}`,
      body: 'Task deadline reached.',
      at: task.deadline as string,
    }));

  const reminders = data.reminders
    .filter((reminder) => reminder.status !== 'paused')
    .map((reminder) => ({
      id: `reminder:${reminder.id}`,
      kind: 'reminder' as const,
      title: reminder.title,
      body: `${reminder.category === 'important' ? 'Important' : 'Wellbeing'} reminder.`,
      at: reminder.schedule.at,
      recurrence: reminder.schedule.recurrence,
      category: reminder.category,
    }));

  return [...deadlines, ...reminders];
}
