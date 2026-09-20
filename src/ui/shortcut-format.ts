import type { DictionaryKey } from '../i18n/dictionary';

export type ShortcutStatus = 'active' | 'taken' | 'disabled';

/** Os atalhos oferecidos. Teclas soltas ficam de fora: um atalho global some do resto do sistema. */
export const SHORTCUT_CHOICES = ['Command+Shift+Space', 'Option+Space', 'Command+Shift+T', 'Control+Shift+Space'] as const;

const SYMBOLS: Record<string, string> = { Command: '⌘', Control: '⌃', Option: '⌥', Shift: '⇧' };

/** O que a tela diz de cada estado: `taken` é outro app com a tecla, e pede uma escolha nova. */
export function shortcutStatusKey(status: ShortcutStatus): DictionaryKey {
  if (status === 'active') return 'shortcut.status.active';
  if (status === 'taken') return 'shortcut.status.taken';
  return 'shortcut.status.disabled';
}

/**
 * `Command+Shift+Space` é como o Electron registra a tecla, não como um teclado de Mac a mostra.
 * A tela mostra os símbolos, na ordem em que aparecem nos menus do sistema.
 */
export function shortcutLabel(accelerator: string | null, spaceLabel = 'Espaço'): string {
  if (!accelerator) return '—';
  const parts = accelerator.split('+');
  const key = parts.pop() ?? '';
  const order = ['Control', 'Option', 'Shift', 'Command'];
  const modifiers = order.filter((name) => parts.includes(name)).map((name) => SYMBOLS[name]).join('');
  return `${modifiers}${key === 'Space' ? spaceLabel : key}`;
}
