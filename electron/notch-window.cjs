const { notchBounds, actionBounds, selectDisplay } = require('./notch-geometry.cjs');

const validPresentation = (value) => value && typeof value === 'object'
  && typeof value.requestId === 'string' && value.requestId.length <= 128
  && typeof value.kind === 'string' && value.kind.length <= 64
  && (value.text === null || typeof value.text === 'string')
  && Array.isArray(value.actions) && value.actions.length <= 4;

function createNotchWindowManager({ BrowserWindowClass, screen, preloadPath, load, nativeBridge, onAction, platform = process.platform }) {
  let window = null;
  let activeRequestId = null;
  let activeActions = new Set();
  let activeHost = null;
  // When an external monitor is primary, keep the companion on the physical
  // Mac display that exposes a camera housing (the real notch).
  const nativeNotchDisplay = nativeBridge?.screenGeometry?.().find((display) => display?.hasCameraHousing && Number.isInteger(display.displayId));
  let preferredDisplayId = nativeNotchDisplay?.displayId ?? null;
  const getWindow = () => window && !window.isDestroyed() ? window : null;
  const makePassive = (target) => { target.setIgnoreMouseEvents?.(true, { forward: true }); target.setFocusable?.(false); };
  const selectedDisplay = () => selectDisplay(screen, preferredDisplayId);
  const position = () => {
    const target = getWindow(); if (!target) return;
    const bounds = activeActions.size > 0 ? actionBounds(selectedDisplay()) : notchBounds(selectedDisplay());
    target.setBounds(bounds);
    // O addon recebe o handle e os quatro números separados, não o objeto. A colocação nativa
    // só eleva o nível e junta a janela aos Spaces: se falhar, a janela Electron já está
    // posicionada e a confirmação precisa aparecer mesmo assim.
    try { nativeBridge?.place?.(target.getNativeWindowHandle?.(), bounds.x, bounds.y, bounds.width, bounds.height); } catch { /* colocação nativa indisponível */ }
  };
  const selectedDisplayId = () => selectedDisplay().id;
  const useNativeHost = () => {
    try {
      return platform === 'darwin'
        && activeActions.size === 0
        && nativeBridge?.nativeHostAvailable?.() === true
        && nativeBridge?.createHost?.((action) => resolveAction(action?.requestId, action?.actionId)) === true;
    } catch { return false; }
  };
  const showNativeHost = (presentation) => {
    try { return nativeBridge?.showHost?.(presentation, selectedDisplayId()) === true; } catch { return false; }
  };
  const ensure = () => {
    if (getWindow()) return window;
    window = new BrowserWindowClass({
      ...notchBounds(selectedDisplay()), show: false, frame: false, transparent: true, hasShadow: false,
      resizable: false, movable: false, skipTaskbar: true, focusable: false, alwaysOnTop: true,
      ...(platform === 'darwin' ? { type: 'panel' } : {}),
      webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    window.setAlwaysOnTop?.(true, 'pop-up-menu');
    window.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true });
    makePassive(window);
    window.on?.('closed', () => { window = null; activeRequestId = null; activeActions = new Set(); });
    load(window);
    return window;
  };
  const resolveAction = (requestId, actionId) => {
    if (requestId !== activeRequestId || !activeActions.has(actionId)) return false;
    if (activeHost === 'native') nativeBridge?.hideHost?.();
    else { const target = getWindow(); if (!target) return false; makePassive(target); target.hide(); }
    activeRequestId = null; activeActions = new Set(); activeHost = null;
    onAction?.({ requestId, actionId });
    return true;
  };
  return {
    show(presentation) {
      if (!validPresentation(presentation)) throw new Error('Invalid companion presentation.');
      activeRequestId = presentation.requestId; activeActions = new Set(presentation.actions.map((action) => action.id));
      if (useNativeHost() && showNativeHost(presentation)) {
        activeHost = 'native';
        return { degraded: false, requestId: activeRequestId, host: activeHost };
      }
      const target = ensure(); activeHost = 'electron'; position();
      const capturesInput = presentation.interaction === 'capture';
      target.setIgnoreMouseEvents?.(capturesInput ? false : true, capturesInput ? undefined : { forward: true });
      target.setFocusable?.(capturesInput);
      target.webContents.send('hibi:companion:presentation', presentation);
      target.showInactive?.();
      if (capturesInput) target.focus?.();
      return { degraded: true, requestId: activeRequestId, host: activeHost };
    },
    hide(requestId) {
      if (requestId !== activeRequestId) return false;
      if (activeHost === 'native') nativeBridge?.hideHost?.();
      else { const target = getWindow(); if (!target) return false; makePassive(target); target.hide(); }
      activeRequestId = null; activeActions = new Set(); activeHost = null; return true;
    },
    resolveAction,
    setPreferredDisplay(displayId) { preferredDisplayId = Number.isInteger(displayId) ? displayId : null; if (activeHost === 'native') nativeBridge?.repositionHost?.(selectedDisplayId()); else position(); },
    reposition() { if (activeHost === 'native') return nativeBridge?.repositionHost?.(selectedDisplayId()) === true; position(); return Boolean(getWindow()); },
    destroy() { const target = getWindow(); nativeBridge?.destroyHost?.(); nativeBridge?.teardown?.(); if (target) target.destroy(); window = null; activeRequestId = null; activeActions = new Set(); activeHost = null; },
    get activeRequestId() { return activeRequestId; },
    get activeHost() { return activeHost; },
    get diagnostics() {
      if (nativeBridge?.nativeHostAvailable?.() === true) return { ...nativeBridge.hostDiagnostics?.(), host: activeHost ?? 'native' };
      return { available: false, host: 'electron' };
    },
  };
}

module.exports = { createNotchWindowManager, validPresentation };
