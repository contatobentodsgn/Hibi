const test = require('node:test');
const assert = require('node:assert/strict');
const { showStartupNotch } = require('./notch-startup.cjs');

test('shows a passive startup presentation in the notch', () => {
  const shown = [];
  showStartupNotch({ show: (presentation) => shown.push(presentation) });

  assert.deepEqual(shown, [{
    requestId: 'startup-notch',
    kind: 'idle',
    text: null,
    actions: [],
    interaction: 'passthrough',
    host: 'native',
  }]);
});

test('passes the native idle animation only when a local asset path is available', () => {
  const shown = [];
  showStartupNotch({ show: (presentation) => shown.push(presentation) }, '/tmp/idle_01_loop.mp4');

  assert.deepEqual(shown, [{
    requestId: 'startup-notch',
    kind: 'idle',
    text: null,
    actions: [],
    interaction: 'passthrough',
    host: 'native',
    animationPath: '/tmp/idle_01_loop.mp4',
  }]);
});
