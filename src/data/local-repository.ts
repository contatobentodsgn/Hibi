import type { Reminder, ScheduleBlock, StudyData, Task } from '../domain/models';

type NewTask = Omit<Task, 'id'>;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export class LocalRepository {
  private readonly seed: StudyData;
  private data: StudyData;

  constructor(seed: StudyData) {
    this.seed = clone(seed);
    this.data = clone(seed);
  }

  static fromJson(seed: StudyData, json: string): LocalRepository {
    const repository = new LocalRepository(seed);
    const parsed = JSON.parse(json) as StudyData;
    if (!parsed || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.reminders) || !Array.isArray(parsed.blocks) || !Array.isArray(parsed.telemetry)) throw new Error('Invalid study data');
    repository.data = clone(parsed);
    return repository;
  }

  snapshot(): StudyData { return clone(this.data); }
  listTasks(): Task[] { return clone(this.data.tasks); }
  listReminders(): Reminder[] { return clone(this.data.reminders); }
  listBlocks(): ScheduleBlock[] { return clone(this.data.blocks); }
  getTask(id: string): Task | undefined { return this.data.tasks.find((task) => task.id === id); }
  createTask(input: NewTask): Task {
    const task = { ...input, id: `task-${Date.now()}-${this.data.tasks.length}` };
    this.data.tasks.push(task);
    return clone(task);
  }
  updateTask(id: string, changes: Partial<NewTask>): Task {
    const task = this.getTask(id);
    if (!task) throw new Error(`Task not found: ${id}`);
    Object.assign(task, changes);
    return clone(task);
  }
  deleteTask(id: string): void { this.data.tasks = this.data.tasks.filter((task) => task.id !== id); }
  createReminder(input: Omit<Reminder, 'id'>): Reminder {
    const reminder = { ...input, id: `reminder-${Date.now()}-${this.data.reminders.length}` };
    this.data.reminders.push(reminder);
    return clone(reminder);
  }
  updateReminder(id: string, changes: Partial<Omit<Reminder, 'id'>>): Reminder {
    const reminder = this.data.reminders.find((item) => item.id === id);
    if (!reminder) throw new Error(`Reminder not found: ${id}`);
    Object.assign(reminder, changes);
    return clone(reminder);
  }
  deleteReminder(id: string): void { this.data.reminders = this.data.reminders.filter((item) => item.id !== id); }
  createBlock(input: Omit<ScheduleBlock, 'id'>): ScheduleBlock {
    const block = { ...input, id: `block-${Date.now()}-${this.data.blocks.length}` };
    this.data.blocks.push(block);
    return clone(block);
  }
  updateBlock(id: string, changes: Partial<Omit<ScheduleBlock, 'id'>>): ScheduleBlock {
    const block = this.data.blocks.find((item) => item.id === id);
    if (!block) throw new Error(`Block not found: ${id}`);
    Object.assign(block, changes);
    return clone(block);
  }
  deleteBlock(id: string): void { this.data.blocks = this.data.blocks.filter((item) => item.id !== id); }
  reset(): void { this.data = clone(this.seed); }
  exportJson(): string { return JSON.stringify(this.data, null, 2); }
}
