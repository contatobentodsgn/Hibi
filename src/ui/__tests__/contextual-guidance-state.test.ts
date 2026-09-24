import { describe, expect, it } from 'vitest';
import { dismissContextualGuidance, isContextualGuidanceDismissed } from '../redesign/components/contextual-guidance-state';

function memoryStorage(initial?: string) {
  let value = initial ?? null;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => { value = next; },
    value: () => value,
  };
}

describe('contextual guidance dismissal', () => {
  it('persists one dismissal without suppressing guidance on another screen', () => {
    const storage = memoryStorage();

    dismissContextualGuidance('tasks.overdue', storage);

    expect(isContextualGuidanceDismissed('tasks.overdue', storage)).toBe(true);
    expect(isContextualGuidanceDismissed('agenda.plan-break', storage)).toBe(false);
    expect(storage.value()).toContain('tasks.overdue');
  });

  it('ignores malformed or non-list stored values instead of hiding guidance', () => {
    expect(isContextualGuidanceDismissed('notes.resume', memoryStorage('{bad json'))).toBe(false);
    expect(isContextualGuidanceDismissed('notes.resume', memoryStorage('{"notes.resume":true}'))).toBe(false);
  });

  it('does not duplicate dismissed ids when dismissal is repeated', () => {
    const storage = memoryStorage();

    dismissContextualGuidance('tasks.overdue', storage);
    dismissContextualGuidance('tasks.overdue', storage);

    expect(JSON.parse(storage.value() ?? '[]')).toEqual(['tasks.overdue']);
  });
});
