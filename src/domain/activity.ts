import type { Category } from './models';

export const ACTIVITY_SCHEMA_VERSION = 1 as const;

export const ACTIVITY_TYPES = [
  'task.completed',
  'task.reopened',
  'focus.started',
  'focus.paused',
  'focus.resumed',
  'focus.completed',
  'focus.cancelled',
  'habit.completed',
  'habit.reopened',
  'goal.progressed',
  'goal.completed',
  'block.created',
  'block.completed',
  'block.moved',
  'block.deleted',
] as const;

export type KnownActivityType = (typeof ACTIVITY_TYPES)[number];
export type ActivityEntityType = 'task' | 'focus' | 'habit' | 'goal' | 'block';

export interface ActivityRecord {
  id: string;
  schemaVersion: typeof ACTIVITY_SCHEMA_VERSION;
  type: string;
  at: string;
  entityType?: ActivityEntityType;
  entityId?: string;
  title?: string;
  durationMinutes?: number;
  category?: Category;
  folder?: string;
  value?: number;
  seeded?: boolean;
}

export interface ActivityInput {
  id?: string;
  type: KnownActivityType;
  at: string;
  entityType?: ActivityEntityType;
  entityId?: string;
  title?: string;
  durationMinutes?: number;
  category?: Category;
  folder?: string;
  value?: number;
  seeded?: boolean;
}

const EVENT_TYPE_PATTERN = /^[a-z][a-z0-9-]{0,31}\.[a-z][a-z0-9-]{0,31}$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ENTITY_TYPES = new Set<ActivityEntityType>(['task', 'focus', 'habit', 'goal', 'block']);
const CATEGORIES = new Set<Category>(['work', 'break', 'learning', 'important', 'wellbeing']);
const MAX_TITLE_LENGTH = 240;
const MAX_FOLDER_LENGTH = 240;
const MAX_ENTITY_ID_LENGTH = 128;

function isBoundedString(value: unknown, maximumLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximumLength;
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function hasValidOptionalFields(value: Record<string, unknown>): boolean {
  return (value.entityType === undefined || ENTITY_TYPES.has(value.entityType as ActivityEntityType))
    && (value.entityId === undefined || isBoundedString(value.entityId, MAX_ENTITY_ID_LENGTH))
    && (value.title === undefined || isBoundedString(value.title, MAX_TITLE_LENGTH))
    && (value.durationMinutes === undefined || isNonNegativeFiniteNumber(value.durationMinutes))
    && (value.category === undefined || CATEGORIES.has(value.category as Category))
    && (value.folder === undefined || isBoundedString(value.folder, MAX_FOLDER_LENGTH))
    && (value.value === undefined || isNonNegativeFiniteNumber(value.value))
    && (value.seeded === undefined || typeof value.seeded === 'boolean');
}

export function isActivityRecord(value: unknown): value is ActivityRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;

  return record.schemaVersion === ACTIVITY_SCHEMA_VERSION
    && typeof record.id === 'string'
    && ID_PATTERN.test(record.id)
    && typeof record.type === 'string'
    && EVENT_TYPE_PATTERN.test(record.type)
    && isIsoTimestamp(record.at)
    && hasValidOptionalFields(record);
}

export function createActivityRecord(input: ActivityInput): ActivityRecord {
  const record: ActivityRecord = {
    ...input,
    id: input.id ?? `activity-${crypto.randomUUID()}`,
    schemaVersion: ACTIVITY_SCHEMA_VERSION,
  };

  if (!isActivityRecord(record) || !ACTIVITY_TYPES.includes(input.type)) {
    throw new TypeError('Invalid activity record');
  }

  return record;
}
