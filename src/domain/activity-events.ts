import { MAX_ACTIVITY_ENTITY_ID_LENGTH, MAX_ACTIVITY_FOLDER_LENGTH, MAX_ACTIVITY_TITLE_LENGTH, type ActivityEntityType, type ActivityInput } from './activity';
import type { Category, EntityStatus, Goal, Habit, ScheduleBlock, Task } from './models';

export type FocusActivityType = 'started' | 'paused' | 'resumed' | 'completed' | 'cancelled';

const isMinutes = (value: number | undefined): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

// O ledger recusa textos longos demais; o snapshot corta em vez de perder o registro inteiro.
// Um id não pode ser cortado (deixaria de apontar para a entidade), então o longo demais fica de fora.
function snapshot(entityType: ActivityEntityType, entity: { id: string; title: string }): Pick<ActivityInput, 'entityType' | 'entityId' | 'title'> {
  const title = entity.title.slice(0, MAX_ACTIVITY_TITLE_LENGTH);
  return {
    entityType,
    ...(entity.id.length > 0 && entity.id.length <= MAX_ACTIVITY_ENTITY_ID_LENGTH ? { entityId: entity.id } : {}),
    ...(title ? { title } : {}),
  };
}

function plannedDetails(durationMinutes: number | undefined, category: Category | undefined, folder?: string): Pick<ActivityInput, 'durationMinutes' | 'category' | 'folder'> {
  const trimmedFolder = folder?.slice(0, MAX_ACTIVITY_FOLDER_LENGTH);
  return {
    ...(isMinutes(durationMinutes) ? { durationMinutes } : {}),
    ...(category ? { category } : {}),
    ...(trimmedFolder ? { folder: trimmedFolder } : {}),
  };
}

export function taskStatusActivity(before: Task, nextStatus: EntityStatus, at: string): ActivityInput | null {
  const wasCompleted = before.status === 'completed';
  const isCompleted = nextStatus === 'completed';
  if (wasCompleted === isCompleted) return null;
  return { type: isCompleted ? 'task.completed' : 'task.reopened', at, ...snapshot('task', before), ...plannedDetails(before.durationMinutes, before.category, before.folder) };
}

export function habitCompletionActivity(before: Habit, date: string, completed: boolean, at: string): ActivityInput | null {
  if (before.completedDates.includes(date) === completed) return null;
  return { type: completed ? 'habit.completed' : 'habit.reopened', at, ...snapshot('habit', before) };
}

export function goalProgressActivities(before: Goal, after: Goal, at: string): ActivityInput[] {
  const inputs: ActivityInput[] = [];
  if (after.current !== before.current && isMinutes(after.current)) inputs.push({ type: 'goal.progressed', at, ...snapshot('goal', after), value: after.current });
  if (before.status !== 'completed' && after.status === 'completed') inputs.push({ type: 'goal.completed', at, ...snapshot('goal', after) });
  // Sem a reversão, baixar a meta abaixo do alvo e subir de novo contaria a mesma meta duas vezes.
  if (before.status === 'completed' && after.status !== 'completed') inputs.push({ type: 'goal.reopened', at, ...snapshot('goal', after) });
  return inputs;
}

export function blockActivity(kind: 'created' | 'deleted', block: ScheduleBlock, at: string): ActivityInput {
  const elapsedMs = Date.parse(block.end) - Date.parse(block.start);
  const durationMinutes = Number.isFinite(elapsedMs) ? Math.max(0, Math.floor(elapsedMs / 60_000)) : 0;
  return { type: kind === 'created' ? 'block.created' : 'block.deleted', at, ...snapshot('block', block), ...plannedDetails(durationMinutes, block.category) };
}

// Só o fim da sessão carrega minutos: pausas e retomadas somariam o mesmo tempo duas vezes.
export function focusActivity(type: FocusActivityType, focusedMinutes: number | undefined, at: string): ActivityInput {
  const measured = (type === 'completed' || type === 'cancelled') && isMinutes(focusedMinutes);
  return { type: `focus.${type}`, at, entityType: 'focus', ...(measured ? { durationMinutes: focusedMinutes } : {}) };
}
