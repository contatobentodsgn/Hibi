// U04b: com a barra de navegação em cima, o mascote do notch cobre o meio dela quando os dois estão na mesma
// tela. Só o processo principal sabe onde cada um está; a janela recebe a resposta, e só quando ela muda.

/**
 * O mascote está na tela, e na mesma tela da janela principal? A tela da janela é a que contém a maior parte
 * dela (`getDisplayMatching`, a regra do Electron); a do mascote é a que o notch escolheu (preferência,
 * câmera ou principal). Qualquer falha responde "não": a barra fica em cima, como sempre ficou.
 */
function mascotSharesDisplay({ window, screen, notch }) {
  try {
    if (!window || window.isDestroyed?.()) return false;
    if (notch?.activeRequestId == null) return false;
    const windowDisplay = screen.getDisplayMatching(window.getBounds());
    const notchDisplay = notch.currentDisplay();
    return Boolean(windowDisplay && notchDisplay && windowDisplay.id === notchDisplay.id);
  } catch {
    return false;
  }
}

// A janela muda de tela ao ser arrastada ou redimensionada, ao voltar a aparecer e ao entrar e sair da tela
// cheia; as telas mudam ao conectar, desconectar ou reorganizar monitores.
const WINDOW_EVENTS = ['move', 'moved', 'resize', 'show', 'enter-full-screen', 'leave-full-screen'];
const SCREEN_EVENTS = ['display-added', 'display-removed', 'display-metrics-changed'];

function createMascotPlacement({ window, screen, notch, send }) {
  const notchManager = typeof notch === 'function' ? notch : () => notch;
  const read = () => ({ sharesDisplay: mascotSharesDisplay({ window, screen, notch: notchManager() }) });
  // A última resposta que a janela conhece. Antes de ela perguntar (`current`), não há o que atualizar: a
  // janela nem carregou, e a pergunta dela já traz a resposta de agora.
  let last = null;
  // Avisa só quando muda: arrastar a janela dispara `move` a cada quadro.
  const refresh = () => {
    const next = read();
    if (last !== null && last.sharesDisplay !== next.sharesDisplay) {
      last = next;
      try { send?.(next); } catch { /* janela fechando; a próxima leitura corrige */ }
    }
    return next;
  };
  for (const event of WINDOW_EVENTS) window?.on?.(event, refresh);
  for (const event of SCREEN_EVENTS) screen?.on?.(event, refresh);
  return {
    /** A resposta de agora, para a janela que acabou de abrir. Conta como a última enviada. */
    current() { last = read(); return last; },
    refresh,
    dispose() {
      for (const event of WINDOW_EVENTS) window?.removeListener?.(event, refresh);
      for (const event of SCREEN_EVENTS) screen?.removeListener?.(event, refresh);
    },
  };
}

module.exports = { createMascotPlacement, mascotSharesDisplay, WINDOW_EVENTS, SCREEN_EVENTS };
