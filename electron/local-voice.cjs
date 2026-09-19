const SUPPORTED_LOCALES = new Set(['pt-BR', 'en-US']);
// Uma pausa de 1,3 s depois de falar encerra a frase; 8 s sem nenhuma palavra encerram a escuta.
const SILENCE_MS = 1_300;
const NO_SPEECH_MS = 8_000;
// Depois da primeira palavra, a escuta dura no máximo isto, mesmo com ruído de fundo.
const MAX_SPEECH_MS = 20_000;
// Com o nível do microfone: 0,9 s depois de a voz parar (o helper já espera 0,3 s de silêncio antes de
// avisar, 1,2 s no total) encerra a frase. Menos que isso cortava quem pensa no meio da frase.
const VOICE_HANGOVER_MS = 900;
// O reconhecedor da Apple aceita até 100 termos a favorecer; cada um é um nome ou um título curto.
const VOCABULARY_LIMIT = 100;
const VOCABULARY_TERM_LENGTH = 40;

/**
 * Os termos que a tela pede para o reconhecedor favorecer ("Kabrito", "Cristiane"), limpos aqui: a tela não
 * decide o tamanho do que chega ao helper. O que não for texto curto e legível fica de fora.
 */
function normalizeVocabulary(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const terms = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const term = item.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    const key = term.toLowerCase();
    if (term.length < 2 || term.length > VOCABULARY_TERM_LENGTH || seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
    if (terms.length === VOCABULARY_LIMIT) break;
  }
  return terms;
}

function createLocalVoiceService({ adapter } = {}) {
  let state = { status: adapter ? 'ready' : 'unavailable', locale: 'pt-BR', error: adapter ? null : 'Local voice adapter is unavailable.' };
  let active = null;
  const publish = (patch) => { state = { ...state, ...patch }; return { ...state }; };
  const locale = (value) => SUPPORTED_LOCALES.has(value) ? value : 'pt-BR';
  return {
    state: () => ({ ...state }),
    setLocale(value) { return publish({ locale: locale(value) }); },
    async listen(request = {}) {
      if (!adapter?.listen) return publish({ status: 'unavailable', error: 'Local voice adapter is unavailable.' });
      if (active) return publish({ status: 'listening', error: null });
      // `autoStop` encerra a escuta quando a fala para (e quando ninguém fala), e a tela envia sozinha.
      const timing = request.autoStop ? { silenceMs: SILENCE_MS, noSpeechMs: NO_SPEECH_MS, maxSpeechMs: MAX_SPEECH_MS, voiceHangoverMs: VOICE_HANGOVER_MS } : {};
      active = adapter.listen({ locale: locale(request.locale || state.locale), onText: request.onText, vocabulary: normalizeVocabulary(request.vocabulary), ...timing });
      publish({ status: 'listening', error: null, reason: null, ended: null });
      try { const result = await active; return publish({ status: 'ready', reason: null, ended: result?.ended ?? 'done' }); } catch (error) { return publish({ status: 'error', error: error?.message || 'Local voice failed.', reason: error?.reason ?? 'failed' }); } finally { active = null; }
    },
    stop() { if (active && adapter?.stop) adapter.stop(); active = null; return publish({ status: adapter ? 'ready' : 'unavailable' }); },
    async speak(text, request = {}) {
      if (!adapter?.speak) return publish({ status: 'unavailable', error: 'Local voice adapter is unavailable.' });
      if (typeof text !== 'string' || text.trim().length === 0 || text.length > 8_000) throw new Error('Local speech text is invalid.');
      publish({ status: 'speaking', error: null });
      try { await adapter.speak(text, { locale: locale(request.locale || state.locale) }); return publish({ status: 'ready' }); } catch (error) { return publish({ status: 'error', error: error?.message || 'Local speech failed.' }); }
    },
  };
}

module.exports = { SUPPORTED_LOCALES, VOCABULARY_LIMIT, normalizeVocabulary, createLocalVoiceService };
