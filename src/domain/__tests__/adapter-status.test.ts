import { describe, expect, it } from 'vitest';
import { getCurrentAdapterStatuses } from '../adapter-status';

describe('adapter status snapshot', () => {
  it('reports the offline-safe status of every adapter', () => {
    expect(getCurrentAdapterStatuses()).toEqual([
      { id: 'local-persistence', label: 'Local persistence', status: 'available', scope: 'local' },
      { id: 'native-notifications', label: 'Native notifications', status: 'available', scope: 'local' },
      { id: 'launch-at-login', label: 'Launch at login', status: 'unavailable', scope: 'local' },
      { id: 'external-ai', label: 'External AI', status: 'unavailable', scope: 'external' },
      { id: 'hardware', label: 'Hardware', status: 'unavailable', scope: 'hardware' },
    ]);
  });

  it('is pure and returns a fresh snapshot', () => {
    const first = getCurrentAdapterStatuses();
    first[0].status = 'unavailable';

    expect(getCurrentAdapterStatuses()[0].status).toBe('available');
    expect(getCurrentAdapterStatuses()).not.toBe(first);
  });
});
