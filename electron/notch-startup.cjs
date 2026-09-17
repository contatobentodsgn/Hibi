const STARTUP_PRESENTATION = Object.freeze({
  requestId: 'startup-notch',
  kind: 'idle',
  text: null,
  actions: Object.freeze([]),
  interaction: 'passthrough',
  host: 'native',
});

/** A apresentação ociosa é a mesma da abertura: o mascote volta a ela quando nada mais está no ar. */
function idleCompanionPresentation(animationPath = null) {
  return typeof animationPath === 'string' && animationPath.length > 0
    ? { ...STARTUP_PRESENTATION, animationPath }
    : STARTUP_PRESENTATION;
}

function showStartupNotch(manager, animationPath = null) {
  return manager?.show?.(idleCompanionPresentation(animationPath));
}

module.exports = { showStartupNotch, idleCompanionPresentation, STARTUP_PRESENTATION };
