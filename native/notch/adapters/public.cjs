function createPublicNotchAdapter(bridge, reason = null) {
  return Object.freeze({
    id: 'public',
    experimental: false,
    reason,
    available: () => bridge.available?.() === true,
    promotionAvailable: () => false,
    screenGeometry: () => bridge.screenGeometry?.() ?? [],
    place: () => false,
    teardown: () => bridge.teardown?.(),
  });
}

module.exports = { createPublicNotchAdapter };
