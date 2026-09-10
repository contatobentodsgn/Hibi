const { notchBounds, actionBounds, resolveNotchDisplay } = require('./notch-geometry.cjs');

const validPresentation = (value) => value && typeof value === 'object'
  && typeof value.requestId === 'string' && value.requestId.length <= 128
  && typeof value.kind === 'string' && value.kind.length <= 64
  && (value.text === null || typeof value.text === 'string')
  && Array.isArray(value.actions) && value.actions.length <= 4;

function createNotchWindowManager({ BrowserWindowClass, screen, preloadPath, load, nativeBridge, onAction, platform = process.platform, preferredDisplayId: initialPreferredDisplayId = null }) {
  let window = null;
  let activeRequestId = null;
  let activeActions = new Set();
  let activeHost = null;
  let activePresentation = null;
  let preferredDisplayId = Number.isInteger(initialPreferredDisplayId) ? initialPreferredDisplayId : null;
  const getWindow = () => window && !window.isDestroyed() ? window : null;
  const makePassive = (target) => { target.setIgnoreMouseEvents?.(true, { forward: true }); target.setFocusable?.(false); };
  // Lido a cada posicionamento, e não só ao iniciar: um app aberto com a tampa fechada precisa
  // passar para a tela com câmera quando ela aparece.
  const cameraHousingIds = () => {
    try {
      const screens = nativeBridge?.screenGeometry?.();
      return Array.isArray(screens) ? screens.filter((entry) => entry?.hasCameraHousing && Number.isInteger(entry.displayId)).map((entry) => entry.displayId) : [];
    } catch { return []; }
  };
  const resolution = ({ displays = screen.getAllDisplays(), primary = screen.getPrimaryDisplay(), housing = cameraHousingIds() } = {}) => resolveNotchDisplay(displays, primary, { preferredDisplayId, cameraHousingIds: housing });
  const selectedDisplay = () => resolution().display;
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
    window.on?.('closed', () => { window = null; activeRequestId = null; activeActions = new Set(); activePresentation = null; });
    load(window);
    return window;
  };
  const resolveAction = (requestId, actionId) => {
    if (requestId !== activeRequestId || !activeActions.has(actionId)) return false;
    if (activeHost === 'native') nativeBridge?.hideHost?.();
    else { const target = getWindow(); if (!target) return false; makePassive(target); target.hide(); }
    activeRequestId = null; activeActions = new Set(); activeHost = null; activePresentation = null;
    onAction?.({ requestId, actionId });
    return true;
  };
  return {
    show(presentation) {
      if (!validPresentation(presentation)) throw new Error('Invalid companion presentation.');
      activeRequestId = presentation.requestId; activeActions = new Set(presentation.actions.map((action) => action.id));
      if (useNativeHost() && showNativeHost(presentation)) {
        activeHost = 'native'; activePresentation = null;
        return { degraded: false, requestId: activeRequestId, host: activeHost };
      }
      try {
        const target = ensure(); activeHost = 'electron'; activePresentation = presentation; position();
        const capturesInput = presentation.interaction === 'capture';
        target.setIgnoreMouseEvents?.(capturesInput ? false : true, capturesInput ? undefined : { forward: true });
        target.setFocusable?.(capturesInput);
        // Numa janela recém-criada este envio chega antes de a overlay assinar o canal e se perde;
        // por isso a overlay também busca `activePresentation` ao montar.
        target.webContents.send('hibi:companion:presentation', presentation);
        target.showInactive?.();
        if (capturesInput) target.focus?.();
        return { degraded: true, requestId: activeRequestId, host: activeHost };
      } catch (error) {
        // Sem janela, não pode ficar uma confirmação fantasma travando `activeInteractive`.
        activeRequestId = null; activeActions = new Set(); activeHost = null; activePresentation = null;
        throw error;
      }
    },
    hide(requestId) {
      if (requestId !== activeRequestId) return false;
      if (activeHost === 'native') nativeBridge?.hideHost?.();
      else { const target = getWindow(); if (!target) return false; makePassive(target); target.hide(); }
      activeRequestId = null; activeActions = new Set(); activeHost = null; activePresentation = null; return true;
    },
    resolveAction,
    setPreferredDisplay(displayId) { preferredDisplayId = Number.isInteger(displayId) ? displayId : null; if (activeHost === 'native') nativeBridge?.repositionHost?.(selectedDisplayId()); else position(); },
    reposition() { if (activeHost === 'native') return nativeBridge?.repositionHost?.(selectedDisplayId()) === true; position(); return Boolean(getWindow()); },
    describeDisplays() {
      const displays = screen.getAllDisplays();
      const primary = screen.getPrimaryDisplay();
      const housing = cameraHousingIds();
      const { display, reason } = resolution({ displays, primary, housing });
      return {
        resolvedDisplayId: display.id,
        reason,
        displays: displays.map((entry, index) => ({
          id: entry.id,
          label: typeof entry.label === 'string' && entry.label.trim() ? entry.label.trim() : `Monitor ${index + 1}`,
          primary: entry.id === primary.id,
          internal: entry.internal === true,
          hasCameraHousing: housing.includes(entry.id),
          width: entry.bounds.width,
          height: entry.bounds.height,
        })),
      };
    },
    destroy() { const target = getWindow(); nativeBridge?.destroyHost?.(); nativeBridge?.teardown?.(); if (target) target.destroy(); window = null; activeRequestId = null; activeActions = new Set(); activeHost = null; activePresentation = null; },
    get activeRequestId() { return activeRequestId; },
    get activeHost() { return activeHost; },
    get activePresentation() { return activeHost === 'electron' ? activePresentation : null; },
    get activeInteractive() { return activeRequestId !== null && activeActions.size > 0; },
    get diagnostics() {
      if (nativeBridge?.nativeHostAvailable?.() === true) return { ...nativeBridge.hostDiagnostics?.(), host: activeHost ?? 'native' };
      return { available: false, host: 'electron' };
    },
  };
}

module.exports = { createNotchWindowManager, validPresentation };
