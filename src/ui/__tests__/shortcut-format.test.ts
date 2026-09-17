import { describe, expect, it } from 'vitest';
import { SHORTCUT_CHOICES, shortcutLabel, shortcutStatusKey } from '../shortcut-format';

describe('shortcutLabel', () => {
  it('mostra a combinação como um teclado de Mac, não como o Electron a registra', () => {
    expect(shortcutLabel('Command+Shift+Space')).toBe('⇧⌘Espaço');
    expect(shortcutLabel('Option+Space')).toBe('⌥Espaço');
    expect(shortcutLabel('Control+Shift+F5')).toBe('⌃⇧F5');
    expect(shortcutLabel('Command+Shift+T')).toBe('⇧⌘T');
  });

  it('segue a ordem dos menus do sistema, mesmo quando o atalho vem em outra', () => {
    expect(shortcutLabel('Shift+Command+Space')).toBe('⇧⌘Espaço');
  });

  it('traduz a tecla de espaço e não inventa nada quando não há atalho', () => {
    expect(shortcutLabel('Option+Space', 'Space')).toBe('⌥Space');
    expect(shortcutLabel(null)).toBe('—');
  });
});

describe('shortcutStatusKey', () => {
  it('separa a tecla valendo, a tecla de outro app e o desligado', () => {
    expect(shortcutStatusKey('active')).toBe('shortcut.status.active');
    expect(shortcutStatusKey('taken')).toBe('shortcut.status.taken');
    expect(shortcutStatusKey('disabled')).toBe('shortcut.status.disabled');
  });
});

describe('SHORTCUT_CHOICES', () => {
  it('só oferece combinações com modificador, porque o atalho é global', () => {
    for (const choice of SHORTCUT_CHOICES) {
      const parts = choice.split('+');
      expect(parts.length).toBeGreaterThan(1);
      expect(parts.slice(0, -1).every((part) => ['Command', 'Control', 'Option', 'Shift'].includes(part))).toBe(true);
    }
  });
});
