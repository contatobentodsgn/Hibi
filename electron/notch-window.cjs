const { notchBounds, selectDisplay } = require('./notch-geometry.cjs');

const validPresentation = (value) => value && typeof value === 'object'
  && typeof value.requestId === 'string' && value.requestId.length <= 128
  && typeof value.kind === 'string' && value.kind.length <= 64
  && (value.text === null || typeof value.text === 'string')
  && Array.isArray(value.actions) && value.actions.length <= 4;

function createNotchWindowManager({ BrowserWindowClass, screen, preloadPath, load, nativeBridge, platform = process.platform }) {
  let window = null;
  let activeRequestId = null;
  let preferredDisplayId = null;
  const getWindow = () => window && !window.isDestroyed() ? window : null;
  const selectedDisplay = () => selectDisplay(screen, preferredDisplayId);
  const position = () => {
    const target = getWindow(); if (!target) return;
    const bounds = notchBounds(selectedDisplay());
    target.setBounds(bounds);
    nativeBridge?.place?.(target.getNativeWindowHandle?.(), bounds);
  };
  const ensure = () => {
    if (getWindow()) return window;
    window = new BrowserWindowClass({
      ...notchBounds(selectedDisplay()), show: false, frame: false, transparent: true, hasShadow: false,
      resizable: false, movable: false, skipTaskbar: true, focusable: false, alwaysOnTop: true,
      webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    window.setAlwaysOnTop?.(true, 'pop-up-menu');
    window.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true });
    window.setIgnoreMouseEvents?.(true, { forward: true });
    window.on?.('closed', () => { window = null; activeRequestId = null; });
    load(window);
    return window;
  };
  return {
    show(presentation) {
      if (!validPresentation(presentation)) throw new Error('Invalid companion presentation.');
      const target = ensure(); activeRequestId = presentation.requestId; position();
      target.setIgnoreMouseEvents?.(presentation.interaction === 'capture' ? false : true, presentation.interaction === 'capture' ? undefined : { forward: true });
      target.webContents.send('hibi:companion:presentation', presentation);
      target.showInactive?.();
      return { degraded: !(nativeBridge?.available?.() && platform === 'darwin'), requestId: activeRequestId };
    },
    hide(requestId) { const target = getWindow(); if (!target || requestId !== activeRequestId) return false; target.hide(); activeRequestId = null; return true; },
    setPreferredDisplay(displayId) { preferredDisplayId = Number.isInteger(displayId) ? displayId : null; position(); },
    reposition: position,
    destroy() { const target = getWindow(); nativeBridge?.teardown?.(); if (target) target.destroy(); window = null; activeRequestId = null; },
    get activeRequestId() { return activeRequestId; },
  };
}

module.exports = { createNotchWindowManager, validPresentation };
