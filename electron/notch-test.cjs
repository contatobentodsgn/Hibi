// O processo principal não conhece o idioma da interface; o renderer informa `pt` ou `en`.
const TEXTS = {
  pt: { passive: 'Teste do notch', question: 'Este cartão apareceu no monitor escolhido?', confirm: 'Apareceu', cancel: 'Não apareceu' },
  en: { passive: 'Notch test', question: 'Did this card appear on the chosen display?', confirm: 'It appeared', cancel: 'It did not appear' },
};
const PREFIX = 'notch-test-';
const empty = (outcome) => ({ outcome, displayId: null, displayLabel: '' });

function createNotchTest({ manager, setTimer = setTimeout, clearTimer = clearTimeout, passiveMs = 2_500, answerMs = 20_000 }) {
  let running = false;
  let sequence = 0;
  let pending = null;
  const wait = (ms) => new Promise((resolve) => { setTimer(resolve, ms); });
  const awaitAnswer = (requestId) => new Promise((resolve) => {
    const timer = setTimer(() => {
      if (pending?.requestId !== requestId) return;
      pending = null;
      // `hide` recusa um id que já não é o ativo: outra apresentação tomou o lugar.
      resolve(manager.hide(requestId) ? 'timeout' : 'interrupted');
    }, answerMs);
    pending = { requestId, resolve, timer };
  });

  function handleAction(action) {
    if (typeof action?.requestId !== 'string' || !action.requestId.startsWith(PREFIX)) return false;
    if (pending?.requestId === action.requestId) {
      const current = pending;
      pending = null;
      clearTimer(current.timer);
      current.resolve(action.actionId === 'confirm' ? 'confirmed' : 'declined');
    }
    return true;
  }

  async function run(locale) {
    // Nunca tampa uma confirmação real que ainda espera resposta.
    if (running || manager.activeInteractive) return empty('busy');
    running = true;
    try {
      const texts = TEXTS[locale] ?? TEXTS.pt;
      const described = manager.describeDisplays();
      const target = described.displays.find((display) => display.id === described.resolvedDisplayId);
      const result = (outcome) => ({ outcome, displayId: target?.id ?? null, displayLabel: target?.label ?? '' });
      sequence += 1;
      const passiveId = `${PREFIX}passive-${sequence}`;
      manager.show({ requestId: passiveId, kind: 'result', text: texts.passive, actions: [], interaction: 'passthrough' });
      await wait(passiveMs);
      if (!manager.hide(passiveId)) return result('interrupted');
      const confirmId = `${PREFIX}confirm-${sequence}`;
      const answer = awaitAnswer(confirmId);
      manager.show({ requestId: confirmId, kind: 'confirmation', text: texts.question, actions: [{ id: 'confirm', label: texts.confirm }, { id: 'cancel', label: texts.cancel }], interaction: 'capture' });
      return result(await answer);
    } catch {
      // Se `show` falhar depois do `awaitAnswer` já ter registrado o timer, ele precisa ser cancelado aqui,
      // senão dispara mais tarde e tenta resolver uma promessa que ninguém mais aguarda.
      if (pending) clearTimer(pending.timer);
      pending = null;
      return empty('failed');
    } finally {
      running = false;
    }
  }

  return { run, handleAction };
}

module.exports = { createNotchTest };
