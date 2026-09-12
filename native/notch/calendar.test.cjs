const test = require('node:test');
const assert = require('node:assert/strict');
const bridge = require('./calendar.cjs');

test('exposes a bounded EventKit calendar bridge contract', () => {
  for (const method of ['available', 'authorizationStatus', 'requestFullAccess', 'listCalendars', 'listEvents', 'saveEvent', 'removeEvent']) {
    assert.equal(typeof bridge[method], 'function');
  }
});
