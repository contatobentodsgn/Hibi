function createPublicNotchAdapter(bridge, reason = null) {
  return Object.freeze({
    id: 'public',
    experimental: false,
    reason,
    available: () => bridge.available?.() === true,
    promotionAvailable: () => bridge.promotionAvailable?.() === true,
    screenGeometry: () => bridge.screenGeometry?.() ?? [],
    place: (...args) => bridge.place?.(...args) === true,
    teardown: () => bridge.teardown?.(),
  });
}

module.exports = { createPublicNotchAdapter };
