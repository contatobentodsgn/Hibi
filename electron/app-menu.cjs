/**
 * O menu do app, que existe mesmo sem aparecer.
 *
 * Um app só de barra de menus não mostra menu nenhum no topo, e é o menu que carrega os atalhos de
 * edição: sem ele, ⌘C, ⌘V, ⌘Z e ⌘A param de funcionar dentro dos campos — inclusive no assistente, que é
 * onde a pessoa mais digita. Por isso o menu é montado de qualquer forma.
 */
function buildAppMenuTemplate({ appName = 'Pixano' } = {}) {
  return [
    { label: appName, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'close' }] },
  ];
}

/**
 * Tira o Pixano do Dock e do ⌘Tab: ele vive na barra de menus, com o notch à vista. `dock` só existe
 * no macOS, e uma falha aqui não pode impedir o app de abrir.
 */
function hideFromDock({ app } = {}) {
  try {
    app?.dock?.hide?.();
    return app?.dock?.isVisible?.() === false || typeof app?.dock?.hide === 'function';
  } catch {
    return false;
  }
}

module.exports = { buildAppMenuTemplate, hideFromDock };
