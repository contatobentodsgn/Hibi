const { existsSync } = require('node:fs');
const path = require('node:path');

const ICON = 'companion-assets/tray/hibi-trayTemplate.png';

/**
 * O ícone mora no `public/` em desenvolvimento e no `dist/` do app empacotado. A escolha é pelo que
 * existe, e não por adivinhação: foi adivinhando que o helper de voz passou a apontar para dentro do
 * Electron baixado e morreu em silêncio.
 */
function resolveTrayIcon({ root = path.join(__dirname, '..'), exists = existsSync } = {}) {
  const candidates = [path.join(root, 'dist', ICON), path.join(root, 'public', ICON)];
  return candidates.find((candidate) => exists(candidate)) ?? candidates[candidates.length - 1];
}

/**
 * O Pixano na barra de menus.
 *
 * O notch fica sempre à vista, e a janela é só mais uma superfície: fechá-la esconde, não encerra.
 * Sem um lugar fixo para reabrir, quem fechasse a janela ficaria sem caminho de volta — por isso o
 * ícone existe, e por isso "Sair" é explícito, em vez de deixar o app pendurado sem nada na tela.
 */
function createAppTray({ Tray, Menu, nativeImage, iconPath = resolveTrayIcon(), labels = {}, onOpen, onHide, onAssistant, onQuit } = {}) {
  if (!Tray || !Menu || typeof onOpen !== 'function' || typeof onQuit !== 'function') throw new Error('The menu bar icon needs Electron, an open handler and a quit handler.');
  const image = nativeImage?.createFromPath?.(iconPath);
  // Um ícone de template acompanha o tema do sistema; sem isto ele vira um borrão preto no modo escuro.
  image?.setTemplateImage?.(true);
  const tray = new Tray(image ?? iconPath);
  const items = [
    { label: labels.open ?? 'Abrir Pixano', click: () => onOpen() },
    { label: labels.assistant ?? 'Abrir assistente', click: () => (onAssistant ?? onOpen)() },
    { label: labels.hide ?? 'Ocultar janela', click: () => onHide?.() },
    { type: 'separator' },
    { label: labels.quit ?? 'Sair do Pixano', click: () => onQuit() },
  ];
  tray.setToolTip(labels.tooltip ?? 'Pixano');
  tray.setContextMenu(Menu.buildFromTemplate(items));
  // Clicar no ícone abre a janela; o menu continua no clique com o botão direito.
  tray.on?.('click', () => onOpen());
  return {
    tray,
    items,
    destroy() { tray.destroy?.(); },
  };
}

module.exports = { createAppTray, resolveTrayIcon };
