const fs = require('node:fs');
const path = require('node:path');

/**
 * Como o Assistant usa a voz além do botão Falar.
 *
 * - `shortcutVoice`: o que o atalho global faz com a voz. `off` só abre o Assistant, como sempre; `window`
 *   abre e já começa a ouvir; `notch` ouve sem abrir a janela, com o que foi ouvido e a resposta no notch.
 * - `spokenReplies`: ler em voz alta a resposta de um pedido feito por voz. Nasce desligado: falar sem ser
 *   chamado surpreende quem está numa sala com outras pessoas.
 *
 * O atalho decide no processo principal se a janela aparece, por isso a escolha mora aqui, e não no
 * armazenamento da janela.
 */
const SHORTCUT_VOICE_MODES = new Set(['off', 'window', 'notch']);
const SEND_MODES = new Set(['pause', 'manual']);
const DEFAULTS = Object.freeze({ shortcutVoice: 'off', spokenReplies: false, voiceSendMode: 'pause' });

function normalizeVoiceSettings(value, base = DEFAULTS) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const shortcutVoice = 'shortcutVoice' in input ? input.shortcutVoice : base.shortcutVoice;
  const spokenReplies = 'spokenReplies' in input ? input.spokenReplies : base.spokenReplies;
  const voiceSendMode = 'voiceSendMode' in input ? input.voiceSendMode : base.voiceSendMode;
  if (!SHORTCUT_VOICE_MODES.has(shortcutVoice)) throw new Error('Invalid voice settings.');
  if (typeof spokenReplies !== 'boolean') throw new Error('Invalid voice settings.');
  if (!SEND_MODES.has(voiceSendMode)) throw new Error('Invalid voice settings.');
  return { shortcutVoice, spokenReplies, voiceSendMode };
}

function createVoiceSettings({ filePath } = {}) {
  if (typeof filePath !== 'string' || !filePath.trim()) throw new Error('A voice settings file path is required.');
  const get = () => {
    try { return normalizeVoiceSettings(JSON.parse(fs.readFileSync(filePath, 'utf8'))); } catch { return { ...DEFAULTS }; }
  };
  return {
    get,
    /** Grava só o que veio; o resto continua como estava. */
    save(patch) {
      const next = normalizeVoiceSettings(patch, get());
      fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
      fs.writeFileSync(filePath, JSON.stringify(next), { encoding: 'utf8', mode: 0o600 });
      fs.chmodSync(filePath, 0o600);
      return next;
    },
  };
}

module.exports = { createVoiceSettings, normalizeVoiceSettings, SHORTCUT_VOICE_MODES, SEND_MODES };
