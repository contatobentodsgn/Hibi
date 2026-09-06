import { describe, expect, it } from 'vitest';
import { LOCAL_CAPABILITIES } from '../capabilities';

describe('local capability registry', () => {
  it('lists the supported local surfaces and unavailable integrations explicitly', () => {
    expect(LOCAL_CAPABILITIES).toEqual([
      expect.objectContaining({ id: 'tasks', status: 'available', scope: 'local' }),
      expect.objectContaining({ id: 'reminders', status: 'available', scope: 'local' }),
      expect.objectContaining({ id: 'calendar', status: 'available', scope: 'local' }),
      expect.objectContaining({ id: 'focus', status: 'available', scope: 'local' }),
      expect.objectContaining({ id: 'notes', status: 'available', scope: 'local' }),
      expect.objectContaining({ id: 'external-ai', status: 'unavailable', scope: 'external' }),
      expect.objectContaining({ id: 'hardware', status: 'unavailable', scope: 'hardware' }),
    ]);
  });

  it('makes the local-only boundary clear', () => {
    const unavailable = LOCAL_CAPABILITIES.filter((capability) => capability.status === 'unavailable');

    expect(unavailable.every((capability) => capability.description.length > 0)).toBe(true);
    expect(unavailable.some((capability) => capability.description.toLowerCase().includes('não'))).toBe(true);
  });
});
