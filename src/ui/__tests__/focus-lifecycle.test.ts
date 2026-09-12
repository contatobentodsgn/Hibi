import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { abandonFocus, completeFocus, discountAwayTime, IDLE_FOCUS_LIFECYCLE, ignoresDurationChoice, pauseFocus, pauseFocusForAway, remainingSeconds, runningEndsAtMs, startFocus, stepFocusLifecycle, type FocusLifecycleAction, type FocusLifecycleState } from '../focus-lifecycle';
import { createActivityRecord } from '../../domain/activity';
import { focusActivity } from '../../domain/activity-events';
import { calculateStats, resolveStatsPeriod } from '../../domain/stats';

const minute = 60_000;
const limit = 25 * minute;

// O tempo em que ninguém estava na frente do Mac não pode virar minuto de foco no /stats.
describe('pausa por ausência', () => {
  it('pausa com motivo "away" e desconta o período ocioso já detectado', () => {
    const running = startFocus(IDLE_FOCUS_LIFECYCLE, 0, limit).state;
    // Detectada aos 12 minutos, com 5 minutos de teclado parado: a pessoa saiu aos 7.
    const paused = pauseFocusForAway(running, 12 * minute, { sinceMs: 7 * minute });
    expect(paused.event).toEqual({ type: 'paused', pauseReason: 'away' });
    expect(paused.state).toEqual({ phase: 'paused', accumulatedMs: 7 * minute, limitMs: limit, pauseReason: 'away' });
    // A tela devolve os minutos ausentes: faltam 18, não 13.
    expect(remainingSeconds(paused.state)).toBe(18 * 60);
  });

  it('com a volta já percebida, só o trecho ausente sai — o tempo depois da volta conta', () => {
    const running = startFocus(IDLE_FOCUS_LIFECYCLE, 0, limit).state;
    const paused = pauseFocusForAway(running, 15 * minute, { sinceMs: 5 * minute, untilMs: 11 * minute });
    expect(paused.state.accumulatedMs).toBe(9 * minute);
  });

  it('nunca desconta tempo de antes da retomada, que já estava fora da contagem', () => {
    let state = startFocus(IDLE_FOCUS_LIFECYCLE, 0, limit).state;
    state = pauseFocus(state, 4 * minute).state;
    state = startFocus(state, 20 * minute, limit).state;
    const paused = pauseFocusForAway(state, 23 * minute, { sinceMs: 10 * minute });
    expect(paused.state.accumulatedMs).toBe(4 * minute);
    expect(pauseFocusForAway(state, 23 * minute, { sinceMs: 30 * minute }).state.accumulatedMs).toBe(7 * minute);
  });

  it('só pausa uma sessão rodando, e passa pela máquina de estados só no modo foco', () => {
    const paused: FocusLifecycleState = { phase: 'paused', accumulatedMs: minute, limitMs: limit };
    expect(pauseFocusForAway(paused, 5 * minute, { sinceMs: 0 })).toEqual({ state: paused });
    expect(pauseFocusForAway(IDLE_FOCUS_LIFECYCLE, 5, { sinceMs: 0 })).toEqual({ state: IDLE_FOCUS_LIFECYCLE });

    const running = startFocus(IDLE_FOCUS_LIFECYCLE, 0, limit).state;
    const action: FocusLifecycleAction = { type: 'pause-away', absence: { sinceMs: 2 * minute } };
    expect(stepFocusLifecycle('focus', action, running, 6 * minute, limit)).toEqual(pauseFocusForAway(running, 6 * minute, { sinceMs: 2 * minute }));
    expect(stepFocusLifecycle('break', action, running, 6 * minute, limit)).toEqual({ state: IDLE_FOCUS_LIFECYCLE });
  });

  it('retomar limpa o motivo e continua do tempo presente', () => {
    const away = pauseFocusForAway(startFocus(IDLE_FOCUS_LIFECYCLE, 0, limit).state, 12 * minute, { sinceMs: 7 * minute }).state;
    const resumed = startFocus(away, 30 * minute, limit);
    expect(resumed.state).toEqual({ phase: 'running', accumulatedMs: 7 * minute, runningSince: 30 * minute, limitMs: limit });
    expect(resumed.event).toEqual({ type: 'resumed', endsAtMs: 30 * minute + 18 * minute });
  });

  it('o /stats soma só os minutos presentes', () => {
    const sessionLimit = 50 * minute;
    const reference = new Date(2026, 8, 10, 12, 0);
    const at = reference.toISOString();
    const period = resolveStatsPeriod('today', reference);
    const focusMinutesOf = (focusedMinutes: number | undefined) => calculateStats([createActivityRecord(focusActivity('completed', focusedMinutes, at))], period).focusMinutes;

    // Começa às 0, sai aos 10, a ausência é percebida aos 15, retoma aos 40 e conclui aos 60.
    const started = startFocus(IDLE_FOCUS_LIFECYCLE, 0, sessionLimit).state;
    const withDiscount = completeFocus(startFocus(pauseFocusForAway(started, 15 * minute, { sinceMs: 10 * minute }).state, 40 * minute, sessionLimit).state, 60 * minute);
    const withoutDiscount = completeFocus(startFocus(pauseFocus(started, 15 * minute).state, 40 * minute, sessionLimit).state, 60 * minute);

    expect(withDiscount.event).toEqual({ type: 'completed', focusedMinutes: 30 });
    expect(focusMinutesOf(withDiscount.event?.focusedMinutes)).toBe(30);
    // Pausar "agora", sem descontar, teria somado os 5 minutos em que ninguém estava ali.
    expect(focusMinutesOf(withoutDiscount.event?.focusedMinutes)).toBe(35);
  });
});

// Quem se afastou de verdade não responde "Você ainda está aí?". Na volta a pergunta vira "Esse tempo foi
// foco?": "Descontar" tira o período ausente sem pausar, e uma pergunta sem resposta não conta como foco.
describe('desconto da ausência sem pausar', () => {
  const sessionLimit = 50 * minute;
  const reference = new Date(2026, 8, 10, 12, 0);
  const statsOf = (event: { type: string; focusedMinutes?: number } | undefined) =>
    calculateStats(event ? [createActivityRecord(focusActivity(event.type === 'completed' ? 'completed' : 'cancelled', event.focusedMinutes, reference.toISOString()))] : [], resolveStatsPeriod('today', reference));

  it('"Descontar" depois da volta desconta exatamente o período ausente e mantém a fase running', () => {
    // Começa às 0, sai aos 1, a ausência é percebida aos 6 e a volta aos 26.
    const running = startFocus(IDLE_FOCUS_LIFECYCLE, 0, sessionLimit).state;
    const discounted = discountAwayTime(running, 26 * minute, { sinceMs: 1 * minute, untilMs: 26 * minute });
    expect(discounted.event).toBeUndefined();
    expect(discounted.state).toEqual({ phase: 'running', accumulatedMs: 1 * minute, runningSince: 26 * minute, limitMs: sessionLimit });
    // O mostrador reflete o tempo devolvido: faltam 49 minutos, não 24.
    expect(remainingSeconds(discounted.state)).toBe(49 * 60);
    expect(runningEndsAtMs(discounted.state)).toBe(26 * minute + 49 * minute);

    // A sessão segue contando dali: mais 1 minuto e sair da tela registra 2, não os 27 do relógio de parede.
    const abandoned = abandonFocus(discounted.state, 27 * minute);
    expect(abandoned.event).toEqual({ type: 'cancelled', focusedMinutes: 2 });
    expect(statsOf(abandoned.event).focusMinutes).toBe(2);
    expect(stepFocusLifecycle('focus', { type: 'discount-away', absence: { sinceMs: 1 * minute, untilMs: 26 * minute } }, running, 26 * minute, sessionLimit)).toEqual(discounted);
  });

  it('com a volta depois de agora, desconta só até agora; o tempo depois da volta conta', () => {
    const running = startFocus(IDLE_FOCUS_LIFECYCLE, 0, sessionLimit).state;
    expect(discountAwayTime(running, 10 * minute, { sinceMs: 4 * minute, untilMs: 30 * minute }).state.accumulatedMs).toBe(4 * minute);
    expect(discountAwayTime(running, 30 * minute, { sinceMs: 4 * minute, untilMs: 10 * minute }).state.accumulatedMs).toBe(24 * minute);
  });

  it('o trecho fora da corrida atual não é descontado', () => {
    // 4 minutos medidos, pausa, retoma aos 20. Uma ausência dos 10 aos 22 só tira os 2 minutos dos 20 aos 22.
    let state = startFocus(IDLE_FOCUS_LIFECYCLE, 0, sessionLimit).state;
    state = pauseFocus(state, 4 * minute).state;
    state = startFocus(state, 20 * minute, sessionLimit).state;
    expect(discountAwayTime(state, 25 * minute, { sinceMs: 10 * minute, untilMs: 22 * minute }).state).toEqual({ phase: 'running', accumulatedMs: 7 * minute, runningSince: 25 * minute, limitMs: sessionLimit });
    // Uma ausência inteira antes da retomada não muda nada, e o estado volta intacto.
    expect(discountAwayTime(state, 25 * minute, { sinceMs: 5 * minute, untilMs: 19 * minute })).toEqual({ state });
  });

  it('o acumulado nunca fica negativo e respeita a duração da sessão', () => {
    const running = startFocus(IDLE_FOCUS_LIFECYCLE, 0, limit).state;
    expect(discountAwayTime(running, 10 * minute, { sinceMs: -60 * minute }).state.accumulatedMs).toBe(0);
    // Oito horas com o notebook dormindo e 10 minutos ausentes: o medido para na duração.
    expect(discountAwayTime(running, 480 * minute, { sinceMs: 470 * minute }).state.accumulatedMs).toBe(limit);
    // Relógio que volta no tempo não desconta nada.
    expect(discountAwayTime(startFocus(IDLE_FOCUS_LIFECYCLE, 10 * minute, limit).state, 0, { sinceMs: 0 })).toEqual({ state: startFocus(IDLE_FOCUS_LIFECYCLE, 10 * minute, limit).state });
  });

  it('só uma sessão rodando é descontada, e nunca no modo pausa', () => {
    const paused: FocusLifecycleState = { phase: 'paused', accumulatedMs: minute, limitMs: limit };
    expect(discountAwayTime(paused, 5 * minute, { sinceMs: 0 })).toEqual({ state: paused });
    expect(discountAwayTime(IDLE_FOCUS_LIFECYCLE, 5 * minute, { sinceMs: 0 })).toEqual({ state: IDLE_FOCUS_LIFECYCLE });
    const running = startFocus(IDLE_FOCUS_LIFECYCLE, 0, limit).state;
    expect(stepFocusLifecycle('break', { type: 'discount-away', absence: { sinceMs: 0 } }, running, 5 * minute, limit)).toEqual({ state: IDLE_FOCUS_LIFECYCLE });
  });

  it('a conclusão com a pergunta aberta desconta, e o /stats soma os minutos certos', () => {
    // Sessão de 25: começa às 0, sai aos 1, a pergunta abre aos 6 e ninguém responde até o contador zerar aos 25.
    const running = startFocus(IDLE_FOCUS_LIFECYCLE, 0, limit).state;
    const unanswered = stepFocusLifecycle('focus', 'complete', running, 25 * minute, limit, { sinceMs: 1 * minute });
    expect(unanswered).toEqual({ state: IDLE_FOCUS_LIFECYCLE, event: { type: 'completed', focusedMinutes: 1 } });
    expect(statsOf(unanswered.event)).toMatchObject({ focusSessions: 1, focusMinutes: 1 });
    // Sem a pergunta aberta, os mesmos 25 minutos contariam inteiros.
    expect(statsOf(stepFocusLifecycle('focus', 'complete', running, 25 * minute, limit).event).focusMinutes).toBe(25);

    // A volta aos 26 sem resposta até o fim, numa sessão de 50: só os 25 minutos ausentes saem.
    const long = startFocus(IDLE_FOCUS_LIFECYCLE, 0, sessionLimit).state;
    const returnedUnanswered = completeFocus(long, 50 * minute, { sinceMs: 1 * minute, untilMs: 26 * minute });
    expect(returnedUnanswered.event).toEqual({ type: 'completed', focusedMinutes: 25 });
    expect(statsOf(returnedUnanswered.event).focusMinutes).toBe(25);
  });

  it('abandonar ou pausar com a pergunta aberta também desconta antes do evento', () => {
    const running = startFocus(IDLE_FOCUS_LIFECYCLE, 0, sessionLimit).state;
    expect(stepFocusLifecycle('focus', 'abandon', running, 30 * minute, sessionLimit, { sinceMs: 5 * minute, untilMs: 25 * minute }).event).toEqual({ type: 'cancelled', focusedMinutes: 10 });
    const paused = stepFocusLifecycle('focus', 'pause', running, 30 * minute, sessionLimit, { sinceMs: 5 * minute, untilMs: 25 * minute });
    expect(paused).toEqual({ state: { phase: 'paused', accumulatedMs: 10 * minute, limitMs: sessionLimit }, event: { type: 'paused' } });
    // A pausa manual continua sem motivo: não vira "pausada porque você se afastou".
    expect(paused.state.pauseReason).toBeUndefined();
    // "Começar" nunca desconta: não há corrida para descontar.
    expect(stepFocusLifecycle('focus', 'start', IDLE_FOCUS_LIFECYCLE, 0, sessionLimit, { sinceMs: 0 })).toEqual(startFocus(IDLE_FOCUS_LIFECYCLE, 0, sessionLimit));
  });
});

describe('focus lifecycle', () => {
  it('starts an idle session and resumes a paused one', () => {
    const started = startFocus(IDLE_FOCUS_LIFECYCLE, 1_000, limit);
    expect(started.event).toEqual({ type: 'started', endsAtMs: 1_000 + limit });
    expect(started.state).toEqual({ phase: 'running', accumulatedMs: 0, runningSince: 1_000, limitMs: limit });

    const paused = pauseFocus(started.state, 1_000 + 4 * minute);
    expect(paused.event).toEqual({ type: 'paused' });
    expect(paused.state).toEqual({ phase: 'paused', accumulatedMs: 4 * minute, limitMs: limit });

    const resumed = startFocus(paused.state, 10 * minute, limit);
    // A retomada desconta os 4 minutos já medidos: o lembrete retido não espera a sessão inteira de novo.
    expect(resumed.event).toEqual({ type: 'resumed', endsAtMs: 10 * minute + (limit - 4 * minute) });
    expect(resumed.state).toEqual({ phase: 'running', accumulatedMs: 4 * minute, runningSince: 10 * minute, limitMs: limit });
  });

  it('ignores a start while running and a pause while not running', () => {
    const running: FocusLifecycleState = { phase: 'running', accumulatedMs: 0, runningSince: 0, limitMs: limit };
    expect(startFocus(running, 5, limit)).toEqual({ state: running });
    expect(pauseFocus(IDLE_FOCUS_LIFECYCLE, 5)).toEqual({ state: IDLE_FOCUS_LIFECYCLE });
    const paused: FocusLifecycleState = { phase: 'paused', accumulatedMs: minute, limitMs: limit };
    expect(pauseFocus(paused, 5)).toEqual({ state: paused });
  });

  it('completes with the measured minutes across pauses, excluding paused time', () => {
    let state = startFocus(IDLE_FOCUS_LIFECYCLE, 0, limit).state;
    state = pauseFocus(state, 10 * minute).state;
    state = startFocus(state, 30 * minute, limit).state;
    const done = completeFocus(state, 45 * minute);
    expect(done).toEqual({ state: IDLE_FOCUS_LIFECYCLE, event: { type: 'completed', focusedMinutes: 25 } });
  });

  it('rounds to the nearest minute', () => {
    const running = startFocus(IDLE_FOCUS_LIFECYCLE, 0, limit).state;
    expect(completeFocus(running, 29_999).event).toEqual({ type: 'completed', focusedMinutes: 0 });
    expect(completeFocus(running, 30_000).event).toEqual({ type: 'completed', focusedMinutes: 1 });
    expect(completeFocus(running, 24 * minute + 40_000).event).toEqual({ type: 'completed', focusedMinutes: 25 });
  });

  it('never measures negative time when the clock goes backwards', () => {
    const running = startFocus(IDLE_FOCUS_LIFECYCLE, 10 * minute, limit).state;
    expect(pauseFocus(running, 0).state.accumulatedMs).toBe(0);
    expect(completeFocus(running, 0).event).toEqual({ type: 'completed', focusedMinutes: 0 });
    expect(abandonFocus(running, 0).event).toEqual({ type: 'cancelled', focusedMinutes: 0 });
  });

  // Com o notebook dormindo ou a janela estrangulada, Date.now() avança e a contagem regressiva não.
  it('caps the measured time at the session length after a long gap while running', () => {
    const running = startFocus(IDLE_FOCUS_LIFECYCLE, 0, limit).state;
    expect(completeFocus(running, 480 * minute).event).toEqual({ type: 'completed', focusedMinutes: 25 });
    expect(abandonFocus(running, 480 * minute).event).toEqual({ type: 'cancelled', focusedMinutes: 25 });
    expect(pauseFocus(running, 480 * minute).state.accumulatedMs).toBe(limit);
  });

  it('keeps the cap across a pause and a resume after a gap', () => {
    let state = startFocus(IDLE_FOCUS_LIFECYCLE, 0, limit).state;
    state = pauseFocus(state, 10 * minute).state;
    state = startFocus(state, 600 * minute, limit).state;
    expect(completeFocus(state, 900 * minute).event).toEqual({ type: 'completed', focusedMinutes: 25 });

    const gapBeforePause = pauseFocus(startFocus(IDLE_FOCUS_LIFECYCLE, 0, limit).state, 300 * minute).state;
    const resumed = startFocus(gapBeforePause, 301 * minute, limit).state;
    expect(abandonFocus(resumed, 310 * minute).event).toEqual({ type: 'cancelled', focusedMinutes: 25 });
  });

  it('keeps the limit chosen when the session started when it is resumed', () => {
    const paused = pauseFocus(startFocus(IDLE_FOCUS_LIFECYCLE, 0, limit).state, 5 * minute).state;
    const resumed = startFocus(paused, 6 * minute, 60 * minute).state;
    expect(resumed.limitMs).toBe(limit);
    expect(completeFocus(resumed, 120 * minute).event).toEqual({ type: 'completed', focusedMinutes: 25 });
  });

  it('cancels only a started, unfinished session', () => {
    const running = startFocus(IDLE_FOCUS_LIFECYCLE, 0, limit).state;
    expect(abandonFocus(running, 7 * minute)).toEqual({ state: IDLE_FOCUS_LIFECYCLE, event: { type: 'cancelled', focusedMinutes: 7 } });
    const paused = pauseFocus(running, 3 * minute).state;
    expect(abandonFocus(paused, 60 * minute)).toEqual({ state: IDLE_FOCUS_LIFECYCLE, event: { type: 'cancelled', focusedMinutes: 3 } });
    expect(abandonFocus(IDLE_FOCUS_LIFECYCLE, 60 * minute)).toEqual({ state: IDLE_FOCUS_LIFECYCLE });
  });

  it('does not complete an idle session', () => {
    expect(completeFocus(IDLE_FOCUS_LIFECYCLE, minute)).toEqual({ state: IDLE_FOCUS_LIFECYCLE });
  });

  // A janela que o agendador usa para segurar os lembretes de bem-estar sai daqui, e só daqui: um
  // segundo relógio em outro lugar poderia discordar deste.
  it('announces when the running session ends, and announces nothing once it stops', () => {
    expect(startFocus(IDLE_FOCUS_LIFECYCLE, 0, limit).event?.endsAtMs).toBe(limit);
    expect(startFocus(IDLE_FOCUS_LIFECYCLE, 5 * minute, 50 * minute).event?.endsAtMs).toBe(55 * minute);

    const running = startFocus(IDLE_FOCUS_LIFECYCLE, 0, limit).state;
    expect(pauseFocus(running, 4 * minute).event?.endsAtMs).toBeUndefined();
    expect(completeFocus(running, limit).event?.endsAtMs).toBeUndefined();
    expect(abandonFocus(running, 4 * minute).event?.endsAtMs).toBeUndefined();
  });

  it('emits nothing after a completion is replayed', () => {
    const done = completeFocus(startFocus(IDLE_FOCUS_LIFECYCLE, 0, limit).state, 25 * minute);
    expect(completeFocus(done.state, 25 * minute).event).toBeUndefined();
    expect(abandonFocus(done.state, 25 * minute).event).toBeUndefined();
  });
});

describe('stepFocusLifecycle', () => {
  const actions: FocusLifecycleAction[] = ['start', 'pause', 'start', 'complete', 'start', 'abandon'];

  it('follows the lifecycle in focus mode', () => {
    let state = IDLE_FOCUS_LIFECYCLE;
    const events = actions.map((action, index) => { const step = stepFocusLifecycle('focus', action, state, index * minute, limit); state = step.state; return step.event?.type; });
    expect(events).toEqual(['started', 'paused', 'resumed', 'completed', 'started', 'cancelled']);
  });

  it('starts the session with the given limit', () => {
    const started = stepFocusLifecycle('focus', 'start', IDLE_FOCUS_LIFECYCLE, 0, limit).state;
    expect(stepFocusLifecycle('focus', 'complete', started, 999 * minute, limit).event).toEqual({ type: 'completed', focusedMinutes: 25 });
  });

  it('never emits lifecycle events in break mode', () => {
    let state = IDLE_FOCUS_LIFECYCLE;
    for (const [index, action] of actions.entries()) {
      const step = stepFocusLifecycle('break', action, state, index * minute, limit);
      expect(step.event).toBeUndefined();
      state = step.state;
    }
    expect(state).toEqual(IDLE_FOCUS_LIFECYCLE);
  });
});

describe('ignoresDurationChoice', () => {
  it('ignores any choice while the clock is running', () => {
    expect(ignoresDurationChoice({ mode: 'focus', running: true, paused: false, selectedMinutes: 5, nextMinutes: 10 })).toBe(true);
  });

  it('ignores the already selected duration while paused, so the session is not abandoned', () => {
    expect(ignoresDurationChoice({ mode: 'focus', running: false, paused: true, selectedMinutes: 25, nextMinutes: 25 })).toBe(true);
  });

  it('applies a different duration while paused, and any duration on an untouched clock', () => {
    expect(ignoresDurationChoice({ mode: 'focus', running: false, paused: true, selectedMinutes: 5, nextMinutes: 10 })).toBe(false);
    expect(ignoresDurationChoice({ mode: 'focus', running: false, paused: false, selectedMinutes: 25, nextMinutes: 25 })).toBe(false);
    expect(ignoresDurationChoice({ mode: 'focus', running: false, paused: false, selectedMinutes: 5, nextMinutes: 15 })).toBe(false);
  });

  // Pausas não geram registro de atividade (DURATIONS.break só existe para o relógio de descanso):
  // o guard existe para proteger progresso de foco, então nunca deve se aplicar a uma pausa.
  it('never ignores a break duration choice, not even the already-selected one while stopped mid-countdown', () => {
    expect(ignoresDurationChoice({ mode: 'break', running: false, paused: true, selectedMinutes: 5, nextMinutes: 5 })).toBe(false);
    expect(ignoresDurationChoice({ mode: 'break', running: true, paused: true, selectedMinutes: 5, nextMinutes: 5 })).toBe(false);
  });
});

// Corpo de cada updater funcional `setAlgo((valor) => …)`, até o parêntese que fecha a chamada.
const functionalUpdaters = (text: string) => [...text.matchAll(/set[A-Z]\w*\(\(/g)].map((match) => {
  const open = match.index + match[0].length - 2;
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === '(') depth += 1;
    if (text[index] === ')' && (depth -= 1) === 0) return text.slice(match.index, index + 1);
  }
  return text.slice(match.index);
});

describe('FocusView lifecycle wiring', () => {
  const source = readFileSync(new URL('../FocusView.tsx', import.meta.url), 'utf8');

  it('emits lifecycle events only through the mode-aware step, limited to the selected duration', () => {
    expect(source.match(/onFocusLifecycleRef\.current\?\.\(/g)).toHaveLength(1);
    expect(source).toMatch(/const step = stepFocusLifecycle\(mode, action, lifecycle\.current, Date\.now\(\), duration \* 60_000, pending\);/);
  });

  // Updaters precisam ser puros: o StrictMode os chama duas vezes e a sessão viraria dois eventos.
  it('never emits lifecycle events from inside a state updater', () => {
    expect(functionalUpdaters("setSeconds((value) => { emitLifecycle('complete'); return Math.max(0, value - 1); })")[0]).toContain('emitLifecycle');
    const updaters = functionalUpdaters(source);
    expect(updaters).toContain('setSeconds((value) => Math.max(0, value - 1))');
    for (const updater of updaters) expect(updater).not.toMatch(/emitLifecycle|onFocusLifecycle/);
    expect(source.indexOf("emitLifecycle('complete'")).toBeGreaterThan(source.indexOf('if (!running || seconds > 0) return;'));
  });

  it('checks the duration choice before abandoning the paused session', () => {
    const choose = source.slice(source.indexOf('const chooseDuration = '), source.indexOf('\n', source.indexOf('const chooseDuration = ')));
    const guard = 'if (ignoresDurationChoice({ mode, running, paused: lifecycle.current.phase === \'paused\' || seconds < duration * 60, selectedMinutes: duration, nextMinutes: minutes })) return;';
    expect(choose).toContain(guard);
    expect(choose.indexOf(guard)).toBeLessThan(choose.indexOf("emitLifecycle('abandon')"));
  });
});
