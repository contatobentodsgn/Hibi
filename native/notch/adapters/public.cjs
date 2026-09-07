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
    nativeHostAvailable: () => bridge.nativeHostAvailable?.() === true,
    createHost: (onAction) => typeof onAction === 'function' && bridge.createHost?.(onAction) === true,
    showHost: (presentation, displayId) => bridge.showHost?.(presentation, displayId) === true,
    hideHost: () => bridge.hideHost?.() === true,
    repositionHost: (displayId) => bridge.repositionHost?.(displayId) === true,
    destroyHost: () => bridge.destroyHost?.() === true,
    hostDiagnostics: () => bridge.hostDiagnostics?.() ?? { available: false },
  });
}

module.exports = { createPublicNotchAdapter };
