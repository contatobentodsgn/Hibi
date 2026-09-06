// Local laboratory adapter. It intentionally contains no private macOS calls.
// An experimental implementation must remain outside packaged releases.
function createExperimentalNotchAdapter(bridge) {
  return Object.freeze({
    id: 'experimental',
    experimental: true,
    reason: 'Experimental local adapter; not supported for distribution.',
    available: () => bridge.available?.() === true,
    promotionAvailable: () => false,
    screenGeometry: () => bridge.screenGeometry?.() ?? [],
    place: () => false,
    teardown: () => bridge.teardown?.(),
  });
}

module.exports = { createExperimentalNotchAdapter };
