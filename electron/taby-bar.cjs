/**
 * A barra do Taby, logo abaixo do notch.
 *
 * Regra do produto: no notch só aparece o mascote e as animações dele. Tudo o que é texto — o pedido
 * digitado, o ditado ao vivo, a resposta, a confirmação, um aviso — e os botões ficam nesta barra, que
 * nasce embaixo do mascote, no mesmo monitor, e troca de modo conforme o pedido anda. Na referência
 * visual é a pílula "Ask me anything" sob o rosto do Taby.
 *
 * É um painel (`type: 'panel'`) que pode receber teclado sem ativar o app: digitar nele não traz a
 * janela do Hibi nem troca o Mac de mesa.
 */
const MAX_TEXT = 4_000;
const MAX_INPUT = 2_000;
// Uns 30% mais estreita que a primeira versão, a pedido: a barra acompanha o notch, não a tela.
const BAR_WIDTH = 390;
const GAP = 10;
// Altura do painel do mascote (painel nativo) em cada tamanho do notch; a barra começa logo abaixo.
const MASCOT_HEIGHT = { normal: 167, compact: 142 };
const HEIGHT_FOR_MODE = { input: 64, listening: 64, thinking: 64, notice: 104, reply: 168, confirmation: 140 };

/** O modo da barra para uma apresentação do companion; `null` quando ela não tem nada para a barra. */
function barModeFor(presentation) {
  const actions = Array.isArray(presentation?.actions) ? presentation.actions : [];
  if (actions.length > 0) return 'confirmation';
  switch (presentation?.kind) {
    case 'listening': return 'listening';
    case 'thinking': case 'acting': return 'thinking';
    case 'result': return presentation.text ? 'reply' : null;
    default: return presentation?.text ? 'notice' : null;
  }
}

function barBounds(display, mode, size = 'normal') {
  const { x, y, width } = display.bounds;
  const barWidth = Math.min(BAR_WIDTH, width - 32);
  const height = HEIGHT_FOR_MODE[mode] ?? HEIGHT_FOR_MODE.input;
  return { x: Math.round(x + (width - barWidth) / 2), y: y + (MASCOT_HEIGHT[size] ?? MASCOT_HEIGHT.normal) + GAP, width: barWidth, height };
}

const cleanText = (value, limit) => (typeof value === 'string' ? value.slice(0, limit) : null);

function createTabyBar({ BrowserWindowClass, preloadPath, load, displayFor, sizeFor = () => 'normal', onAction, platform = process.platform }) {
  if (typeof BrowserWindowClass !== 'function' || typeof load !== 'function' || typeof displayFor !== 'function' || typeof onAction !== 'function') throw new Error('The Taby bar needs a window class, a loader, a display and an action handler.');
  let window = null;
  let content = null;
  const alive = () => (window && !window.isDestroyed?.() ? window : null);
  const ensure = () => {
    if (alive()) return window;
    window = new BrowserWindowClass({
      ...barBounds(displayFor(), 'input', sizeFor()), show: false, frame: false, transparent: true, hasShadow: false,
      resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
      skipTaskbar: true, alwaysOnTop: true, acceptFirstMouse: true,
      ...(platform === 'darwin' ? { type: 'panel' } : {}),
      webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    window.setAlwaysOnTop?.(true, 'screen-saver');
    window.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true });
    window.on?.('closed', () => { window = null; content = null; });
    load(window);
    return window;
  };
  const send = () => { const target = alive(); if (target) target.webContents.send('hibi:bar:content', content); };
  const place = () => { const target = alive(); if (target && content) target.setBounds(barBounds(displayFor(), content.mode, sizeFor())); };

  const bar = {
    /** Mostra o que o companion pediu. `focus` só no modo de digitar, que precisa do teclado. */
    show(next, { focus = false } = {}) {
      const mode = next?.mode ?? barModeFor(next);
      if (!mode || typeof next?.requestId !== 'string' || !next.requestId) return false;
      content = {
        requestId: next.requestId.slice(0, 128),
        mode,
        kind: typeof next.kind === 'string' ? next.kind : mode,
        text: cleanText(next.text, MAX_TEXT),
        actions: (Array.isArray(next.actions) ? next.actions : []).filter((action) => typeof action?.id === 'string' && typeof action?.label === 'string').slice(0, 3).map((action) => ({ id: action.id, label: action.label.slice(0, 40) })),
      };
      const target = ensure();
      place();
      send();
      target.webContents.once?.('did-finish-load', send);
      if (focus) { target.show?.(); target.focus?.(); } else target.showInactive?.();
      return true;
    },
    /** Abre a barra para digitar ou falar, sem pedido em andamento. */
    openInput() { return bar.show({ requestId: 'taby-bar-input', mode: 'input', kind: 'input', text: null, actions: [] }, { focus: true }); },
    /** Esconde a barra; com `requestId`, só se ela ainda mostra aquele pedido. */
    hide(requestId) {
      if (requestId && content?.requestId !== requestId) return false;
      content = null;
      alive()?.hide?.();
      return true;
    },
    current: () => (content ? { ...content, actions: content.actions.map((action) => ({ ...action })) } : null),
    /** Um botão da barra só vale para o pedido que ela mostra e para um botão que ele tem. */
    resolveAction(requestId, actionId) {
      if (!content || content.requestId !== requestId || !content.actions.some((action) => action.id === actionId)) return false;
      onAction({ requestId, actionId });
      return true;
    },
    isSender: (sender) => Boolean(alive() && sender && alive().webContents === sender),
    reposition: place,
    destroy() { const target = alive(); window = null; content = null; target?.destroy?.(); },
  };
  return bar;
}

const cleanInput = (value) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, MAX_INPUT) : null);

module.exports = { barBounds, barModeFor, cleanInput, createTabyBar, MASCOT_HEIGHT };
