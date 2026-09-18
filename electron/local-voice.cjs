const SUPPORTED_LOCALES = new Set(['pt-BR', 'en-US']);
// Uma pausa de 1,6 s depois de falar encerra a frase; 8 s sem nenhuma palavra encerram a escuta.
const SILENCE_MS = 1_600;
const NO_SPEECH_MS = 8_000;

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
      const timing = request.autoStop ? { silenceMs: SILENCE_MS, noSpeechMs: NO_SPEECH_MS } : {};
      active = adapter.listen({ locale: locale(request.locale || state.locale), onText: request.onText, ...timing });
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

module.exports = { SUPPORTED_LOCALES, createLocalVoiceService };
