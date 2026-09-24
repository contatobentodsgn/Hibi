const fs = require('node:fs');
const path = require('node:path');

/** Chamar o Assistant de qualquer lugar é o ponto do atalho, então ele nasce ligado. */
const DEFAULT_ACCELERATOR = 'Command+Shift+Space';
const MODIFIERS = new Set(['Command', 'Control', 'Option', 'Shift']);
const KEYS = /^([A-Z0-9]|Space|Tab|Return|Escape|F[1-9]|F1[0-2])$/;

/**
 * Um atalho global sequestra a tecla do sistema inteiro, então só passa o que dá para registrar e
 * para digitar: pelo menos um modificador (sem ele, a tecla some para todos os outros apps) e uma
 * tecla que o Electron conhece. `null` é o atalho desligado, que é uma escolha legítima.
 */
function normalizeAccelerator(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new Error('Invalid shortcut.');
  const parts = value.split('+').map((part) => part.trim());
  const key = parts.pop();
  if (!KEYS.test(key)) throw new Error('Invalid shortcut.');
  if (!parts.length || !parts.every((part) => MODIFIERS.has(part))) throw new Error('Invalid shortcut.');
  if (new Set(parts).size !== parts.length) throw new Error('Invalid shortcut.');
  return [...parts, key].join('+');
}

function normalizeShortcutSettings(value) {
  if (!value || typeof value !== 'object') throw new Error('Invalid shortcut settings.');
  return { accelerator: normalizeAccelerator(value.accelerator) };
}

function createShortcutSettings({ filePath } = {}) {
  if (typeof filePath !== 'string' || !filePath.trim()) throw new Error('A shortcut settings file path is required.');
  return {
    filePath,
    get() {
      try {
        const stored = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        // Um arquivo sem a chave é diferente de um arquivo com `null`: o segundo é quem desligou.
        return 'accelerator' in stored ? normalizeShortcutSettings(stored) : { accelerator: DEFAULT_ACCELERATOR };
      } catch {
        return { accelerator: DEFAULT_ACCELERATOR };
      }
    },
    save(value) {
      const next = normalizeShortcutSettings(value);
      fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
      fs.writeFileSync(filePath, JSON.stringify(next), { encoding: 'utf8', mode: 0o600 });
      fs.chmodSync(filePath, 0o600);
      return next;
    },
  };
}

module.exports = { createShortcutSettings, normalizeAccelerator, DEFAULT_ACCELERATOR };
