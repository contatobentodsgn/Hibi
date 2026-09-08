import { describe, expect, it } from 'vitest';
import { createActivityRecord, isActivityRecord } from '../activity';

describe('activity records', () => {
  it('creates a versioned, valid activity record', () => {
    const record = createActivityRecord({
      type: 'task.completed',
      at: '2026-09-08T12:00:00.000Z',
      entityType: 'task',
      entityId: 'task-1',
      title: 'Post',
      durationMinutes: 60,
    });

    expect(record).toMatchObject({
      schemaVersion: 1,
      type: 'task.completed',
      at: '2026-09-08T12:00:00.000Z',
      entityType: 'task',
      entityId: 'task-1',
      title: 'Post',
      durationMinutes: 60,
    });
    expect(record.id).toMatch(/^activity-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(isActivityRecord(record)).toBe(true);
  });

  it.each(['title', 'folder'] as const)('accepts a 240-character %s', (field) => {
    expect(() => createActivityRecord({
      type: 'task.completed',
      at: '2026-09-08T12:00:00.000Z',
      [field]: 'a'.repeat(240),
    })).not.toThrow();
  });

  it.each(['title', 'folder'] as const)('rejects a 241-character %s', (field) => {
    expect(() => createActivityRecord({
      type: 'task.completed',
      at: '2026-09-08T12:00:00.000Z',
      [field]: 'a'.repeat(241),
    })).toThrow();
  });

  it('rejects invalid timestamps', () => {
    expect(() => createActivityRecord({ type: 'task.completed', at: 'not-a-date' })).toThrow();
  });

  it('accepts an ISO timestamp with an offset and normalizes it to UTC', () => {
    const record = createActivityRecord({
      type: 'task.completed',
      at: '2026-09-08T09:00:00.000-03:00',
    });

    expect(record.at).toBe('2026-09-08T12:00:00.000Z');
    expect(isActivityRecord({ ...record, at: '2026-09-08T09:00:00.000-03:00' })).toBe(true);
  });

  it('accepts year 0000 leap day and normalizes it to UTC', () => {
    const record = createActivityRecord({
      type: 'task.completed',
      at: '0000-02-29T00:00:00Z',
    });

    expect(record.at).toBe('0000-02-29T00:00:00.000Z');
  });

  it.each([
    '2026-09-08',
    'September 8, 2026 09:00:00 GMT-0300',
    '2026-09-08T09:00:00',
    '2026-09-08T09:00:00.000-03',
  ])('rejects non-ISO or zoneless persisted timestamp %s', (at) => {
    expect(isActivityRecord({
      id: 'activity-1',
      schemaVersion: 1,
      type: 'task.completed',
      at,
    })).toBe(false);
  });

  it('rejects negative durations', () => {
    expect(() => createActivityRecord({
      type: 'focus.completed',
      at: '2026-09-08T12:00:00.000Z',
      durationMinutes: -1,
    })).toThrow();
  });

  it('accepts structurally valid future namespaced event types', () => {
    expect(isActivityRecord({
      id: 'activity-1',
      schemaVersion: 1,
      type: 'future.valid',
      at: '2026-09-08T12:00:00.000Z',
    })).toBe(true);
  });

  it('rejects malformed event types', () => {
    expect(isActivityRecord({
      id: 'activity-1',
      schemaVersion: 1,
      type: '../bad',
      at: '2026-09-08T12:00:00.000Z',
    })).toBe(false);
  });

  it('rejects persisted records with unknown properties', () => {
    expect(isActivityRecord({
      id: 'activity-1',
      schemaVersion: 1,
      type: 'task.completed',
      at: '2026-09-08T12:00:00.000Z',
      apiKey: 'secret',
    })).toBe(false);
  });

  it('constructs records using only declared properties', () => {
    const record = createActivityRecord({
      type: 'task.completed',
      at: '2026-09-08T12:00:00.000Z',
      apiKey: 'secret',
    } as Parameters<typeof createActivityRecord>[0] & { apiKey: string });

    expect(record).not.toHaveProperty('apiKey');
  });
});
