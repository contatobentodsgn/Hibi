let addon;
try { addon = require('./build/Release/hibi_calendar.node'); } catch { addon = null; }
const unavailable = {
  available: () => false,
  authorizationStatus: () => 'unavailable',
  requestFullAccess: () => Promise.reject(new Error('macOS EventKit bridge is unavailable.')),
  listCalendars: () => { throw new Error('macOS EventKit bridge is unavailable.'); },
  listEvents: () => { throw new Error('macOS EventKit bridge is unavailable.'); },
  saveEvent: () => { throw new Error('macOS EventKit bridge is unavailable.'); },
  removeEvent: () => { throw new Error('macOS EventKit bridge is unavailable.'); },
};
module.exports = addon ?? unavailable;
