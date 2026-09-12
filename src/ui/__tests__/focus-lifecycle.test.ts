import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { abandonFocus, completeFocus, IDLE_FOCUS_LIFECYCLE, ignoresDurationChoice, pauseFocus, startFocus, stepFocusLifecycle, type FocusLifecycleAction, type FocusLifecycleState } from '../focus-lifecycle';

const minute = 60_000;
const limit = 25 * minute;

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
    expect(source).toMatch(/const step = stepFocusLifecycle\(mode, action, lifecycle\.current, Date\.now\(\), duration \* 60_000\);/);
  });

  // Updaters precisam ser puros: o StrictMode os chama duas vezes e a sessão viraria dois eventos.
  it('never emits lifecycle events from inside a state updater', () => {
    expect(functionalUpdaters("setSeconds((value) => { emitLifecycle('complete'); return Math.max(0, value - 1); })")[0]).toContain('emitLifecycle');
    const updaters = functionalUpdaters(source);
    expect(updaters).toContain('setSeconds((value) => Math.max(0, value - 1))');
    for (const updater of updaters) expect(updater).not.toMatch(/emitLifecycle|onFocusLifecycle/);
    expect(source.indexOf("emitLifecycle('complete')")).toBeGreaterThan(source.indexOf('if (!running || seconds > 0) return;'));
  });

  it('checks the duration choice before abandoning the paused session', () => {
    const choose = source.slice(source.indexOf('const chooseDuration = '), source.indexOf('\n', source.indexOf('const chooseDuration = ')));
    const guard = 'if (ignoresDurationChoice({ mode, running, paused: lifecycle.current.phase === \'paused\' || seconds < duration * 60, selectedMinutes: duration, nextMinutes: minutes })) return;';
    expect(choose).toContain(guard);
    expect(choose.indexOf(guard)).toBeLessThan(choose.indexOf("emitLifecycle('abandon')"));
  });
});
