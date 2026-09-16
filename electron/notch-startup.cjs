const STARTUP_PRESENTATION = Object.freeze({
  requestId: 'startup-notch',
  kind: 'idle',
  text: null,
  actions: Object.freeze([]),
  interaction: 'passthrough',
  host: 'native',
});

function showStartupNotch(manager, animationPath = null) {
  const presentation = typeof animationPath === 'string' && animationPath.length > 0
    ? { ...STARTUP_PRESENTATION, animationPath }
    : STARTUP_PRESENTATION;
  return manager?.show?.(presentation);
}

module.exports = { showStartupNotch, STARTUP_PRESENTATION };
