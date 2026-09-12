const boundedText = (value, maximum = 240) => typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;

function appleSource(eventKit) {
  if (!eventKit?.available?.()) return { id: 'apple', provider: 'apple', label: 'Calendário do Mac', state: 'needs-permission', error: 'configuration-incomplete' };
  const status = eventKit.authorizationStatus();
  if (status === 'full-access') return { id: 'apple', provider: 'apple', label: 'Calendário do Mac', state: 'connected' };
  if (status === 'denied' || status === 'restricted') return { id: 'apple', provider: 'apple', label: 'Calendário do Mac', state: 'needs-permission', error: 'permission-denied' };
  return { id: 'apple', provider: 'apple', label: 'Calendário do Mac', state: 'needs-permission' };
}

function googleSource(status) {
  if (status?.state === 'connected') return { id: 'google', provider: 'google', label: 'Google Calendar', state: 'connected' };
  return { id: 'google', provider: 'google', label: 'Google Calendar', state: 'disconnected' };
}

function createCalendarSyncService({ eventKit, integrations, settings, now = () => new Date().toISOString() } = {}) {
  if (!eventKit || typeof eventKit.available !== 'function' || typeof eventKit.authorizationStatus !== 'function') throw new Error('An EventKit bridge is required.');
  if (!integrations || typeof integrations.listStatus !== 'function') throw new Error('An integration manager is required.');
  if (!settings || typeof settings.get !== 'function') throw new Error('Calendar settings are required.');

  const selectedGoogle = () => {
    const entry = settings.get('google-calendar');
    return Array.isArray(entry?.targets) ? entry.targets.filter((target) => boundedText(target?.id)) : [];
  };
  const appleCalendars = () => {
    if (appleSource(eventKit).state !== 'connected') return [];
    return (eventKit.listCalendars() ?? []).flatMap((calendar) => {
      if (!boundedText(calendar?.id) || !boundedText(calendar?.label)) return [];
      const suffix = boundedText(calendar?.sourceLabel) ? ` · ${calendar.sourceLabel}` : '';
      return [{ id: `apple:${calendar.id}`, sourceId: 'apple', label: `${calendar.label}${suffix}`.slice(0, 240), mode: 'read-only' }];
    });
  };

  return {
    async getState() {
      const statuses = await integrations.listStatus();
      const google = googleSource(Array.isArray(statuses) ? statuses.find((entry) => entry?.id === 'google-calendar') : null);
      return {
        sources: [appleSource(eventKit), google],
        calendars: [...appleCalendars(), ...selectedGoogle().map((calendar) => ({ id: `google:${calendar.id}`, sourceId: 'google', label: boundedText(calendar.label) ? calendar.label : calendar.id, mode: 'read-only' }))],
        conflicts: [],
      };
    },
    async requestAppleAccess() {
      if (!eventKit.available()) throw new Error('The macOS Calendar bridge is unavailable.');
      if (eventKit.authorizationStatus() !== 'full-access') await eventKit.requestFullAccess();
      if (eventKit.authorizationStatus() !== 'full-access') throw new Error('Calendar full access was not granted.');
      return { state: 'connected', syncedAt: now() };
    },
    async discoverGoogleCalendars() {
      if (typeof integrations.listImportTargets !== 'function') throw new Error('Google Calendar discovery is unavailable.');
      const targets = await integrations.listImportTargets('google-calendar');
      return (Array.isArray(targets) ? targets : []).flatMap((target) => boundedText(target?.id) ? [{ id: target.id, label: boundedText(target?.label) ? target.label : target.id }] : []);
    },
  };
}

module.exports = { createCalendarSyncService };
