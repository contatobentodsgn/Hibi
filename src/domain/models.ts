export type Category = 'work' | 'break' | 'learning' | 'important' | 'wellbeing';
export type EntityStatus = 'open' | 'completed' | 'paused';

export interface RecurrenceRule {
  frequency: 'daily' | 'weekly';
  weekdays?: number[];
  timesByWeekday?: Record<number, string>;
  time?: string;
  startDate: string;
  endDate?: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  durationMinutes: number;
  category: Category;
  status?: EntityStatus;
  folder?: string;
  deadline?: string;
}

export interface Reminder {
  id: string;
  title: string;
  category: 'important' | 'wellbeing';
  schedule: { at: string; recurrence?: RecurrenceRule };
  status?: EntityStatus;
}
export interface Note { id: string; title: string; content: string; folder?: string; createdAt: string; updatedAt: string; }

export interface ScheduleBlock {
  id: string;
  title: string;
  start: string;
  end: string;
  category: Category;
  taskId?: string;
  isHard?: boolean;
}

export interface TelemetryEvent {
  id: string;
  type: string;
  at: string;
  route?: string;
  entityType?: string;
  entityId?: string;
  summary?: string;
}

export interface StudyData {
  notes: Note[];
  tasks: Task[];
  reminders: Reminder[];
  blocks: ScheduleBlock[];
  telemetry: TelemetryEvent[];
}
