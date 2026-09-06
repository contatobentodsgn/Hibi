import type { RecurrenceRule, StudyData } from './models';

export interface NotificationEntry {
  id: string;
  kind: 'deadline' | 'reminder';
  title: string;
  body: string;
  at: string;
  recurrence?: RecurrenceRule;
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
    }));

  return [...deadlines, ...reminders];
}
