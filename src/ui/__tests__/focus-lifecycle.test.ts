import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { abandon, complete, IDLE_FOCUS_LIFECYCLE, ignoresDurationChoice, pause, start, stepFocusLifecycle, type FocusLifecycleAction, type FocusLifecycleState } from '../focus-lifecycle';

const minute = 60_000;
const limit = 25 * minute;

describe('focus lifecycle', () => {
  it('starts an idle session and resumes a paused one', () => {
    const started = start(IDLE_FOCUS_LIFECYCLE, 1_000, limit);
    expect(started.event).toEqual({ type: 'started' });
    expect(started.state).toEqual({ phase: 'running', accumulatedMs: 0, runningSince: 1_000, limitMs: limit });

    const paused = pause(started.state, 1_000 + 4 * minute);
    expect(paused.event).toEqual({ type: 'paused' });
    expect(paused.state).toEqual({ phase: 'paused', accumulatedMs: 4 * minute, limitMs: limit });

    const resumed = start(paused.state, 10 * minute, limit);
    expect(resumed.event).toEqual({ type: 'resumed' });
    expect(resumed.state).toEqual({ phase: 'running', accumulatedMs: 4 * minute, runningSince: 10 * minute, limitMs: limit });
  });

  it('ignores a start while running and a pause while not running', () => {
    const running: FocusLifecycleState = { phase: 'running', accumulatedMs: 0, runningSince: 0, limitMs: limit };
    expect(start(running, 5, limit)).toEqual({ state: running });
    expect(pause(IDLE_FOCUS_LIFECYCLE, 5)).toEqual({ state: IDLE_FOCUS_LIFECYCLE });
    const paused: FocusLifecycleState = { phase: 'paused', accumulatedMs: minute, limitMs: limit };
    expect(pause(paused, 5)).toEqual({ state: paused });
  });

  it('completes with the measured minutes across pauses, excluding paused time', () => {
    let state = start(IDLE_FOCUS_LIFECYCLE, 0, limit).state;
    state = pause(state, 10 * minute).state;
    state = start(state, 30 * minute, limit).state;
    const done = complete(state, 45 * minute);
    expect(done).toEqual({ state: IDLE_FOCUS_LIFECYCLE, event: { type: 'completed', focusedMinutes: 25 } });
  });

  it('rounds to the nearest minute', () => {
    const running = start(IDLE_FOCUS_LIFECYCLE, 0, limit).state;
    expect(complete(running, 29_999).event).toEqual({ type: 'completed', focusedMinutes: 0 });
    expect(complete(running, 30_000).event).toEqual({ type: 'completed', focusedMinutes: 1 });
    expect(complete(running, 24 * minute + 40_000).event).toEqual({ type: 'completed', focusedMinutes: 25 });
  });

  it('never measures negative time when the clock goes backwards', () => {
    const running = start(IDLE_FOCUS_LIFECYCLE, 10 * minute, limit).state;
    expect(pause(running, 0).state.accumulatedMs).toBe(0);
    expect(complete(running, 0).event).toEqual({ type: 'completed', focusedMinutes: 0 });
    expect(abandon(running, 0).event).toEqual({ type: 'cancelled', focusedMinutes: 0 });
  });

  // Com o notebook dormindo ou a janela estrangulada, Date.now() avança e a contagem regressiva não.
  it('caps the measured time at the session length after a long gap while running', () => {
    const running = start(IDLE_FOCUS_LIFECYCLE, 0, limit).state;
    expect(complete(running, 480 * minute).event).toEqual({ type: 'completed', focusedMinutes: 25 });
    expect(abandon(running, 480 * minute).event).toEqual({ type: 'cancelled', focusedMinutes: 25 });
    expect(pause(running, 480 * minute).state.accumulatedMs).toBe(limit);
  });

  it('keeps the cap across a pause and a resume after a gap', () => {
    let state = start(IDLE_FOCUS_LIFECYCLE, 0, limit).state;
    state = pause(state, 10 * minute).state;
    state = start(state, 600 * minute, limit).state;
    expect(complete(state, 900 * minute).event).toEqual({ type: 'completed', focusedMinutes: 25 });

    const gapBeforePause = pause(start(IDLE_FOCUS_LIFECYCLE, 0, limit).state, 300 * minute).state;
    const resumed = start(gapBeforePause, 301 * minute, limit).state;
    expect(abandon(resumed, 310 * minute).event).toEqual({ type: 'cancelled', focusedMinutes: 25 });
  });

  it('keeps the limit chosen when the session started when it is resumed', () => {
    const paused = pause(start(IDLE_FOCUS_LIFECYCLE, 0, limit).state, 5 * minute).state;
    const resumed = start(paused, 6 * minute, 60 * minute).state;
    expect(resumed.limitMs).toBe(limit);
    expect(complete(resumed, 120 * minute).event).toEqual({ type: 'completed', focusedMinutes: 25 });
  });

  it('cancels only a started, unfinished session', () => {
    const running = start(IDLE_FOCUS_LIFECYCLE, 0, limit).state;
    expect(abandon(running, 7 * minute)).toEqual({ state: IDLE_FOCUS_LIFECYCLE, event: { type: 'cancelled', focusedMinutes: 7 } });
    const paused = pause(running, 3 * minute).state;
    expect(abandon(paused, 60 * minute)).toEqual({ state: IDLE_FOCUS_LIFECYCLE, event: { type: 'cancelled', focusedMinutes: 3 } });
    expect(abandon(IDLE_FOCUS_LIFECYCLE, 60 * minute)).toEqual({ state: IDLE_FOCUS_LIFECYCLE });
  });

  it('does not complete an idle session', () => {
    expect(complete(IDLE_FOCUS_LIFECYCLE, minute)).toEqual({ state: IDLE_FOCUS_LIFECYCLE });
  });

  it('emits nothing after a completion is replayed', () => {
    const done = complete(start(IDLE_FOCUS_LIFECYCLE, 0, limit).state, 25 * minute);
    expect(complete(done.state, 25 * minute).event).toBeUndefined();
    expect(abandon(done.state, 25 * minute).event).toBeUndefined();
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
    expect(ignoresDurationChoice({ running: true, paused: false, selectedMinutes: 5, nextMinutes: 10 })).toBe(true);
  });

  it('ignores the already selected duration while paused, so the session is not abandoned', () => {
    expect(ignoresDurationChoice({ running: false, paused: true, selectedMinutes: 25, nextMinutes: 25 })).toBe(true);
  });

  it('applies a different duration while paused, and any duration on an untouched clock', () => {
    expect(ignoresDurationChoice({ running: false, paused: true, selectedMinutes: 5, nextMinutes: 10 })).toBe(false);
    expect(ignoresDurationChoice({ running: false, paused: false, selectedMinutes: 25, nextMinutes: 25 })).toBe(false);
    expect(ignoresDurationChoice({ running: false, paused: false, selectedMinutes: 5, nextMinutes: 15 })).toBe(false);
  });
});

describe('FocusView lifecycle wiring', () => {
  const source = readFileSync(new URL('../FocusView.tsx', import.meta.url), 'utf8');

  it('emits lifecycle events only through the mode-aware step, limited to the selected duration', () => {
    expect(source.match(/onFocusLifecycleRef\.current\?\.\(/g)).toHaveLength(1);
    expect(source).toMatch(/const step = stepFocusLifecycle\(mode, action, lifecycle\.current, Date\.now\(\), duration \* 60_000\);/);
    expect(source).not.toMatch(/setSeconds\(\(value\) => [^)]*emitLifecycle/);
  });

  it('checks the duration choice before abandoning the paused session', () => {
    const choose = source.slice(source.indexOf('const chooseDuration = '), source.indexOf('\n', source.indexOf('const chooseDuration = ')));
    const guard = 'if (ignoresDurationChoice({ running, paused: lifecycle.current.phase === \'paused\' || seconds < duration * 60, selectedMinutes: duration, nextMinutes: minutes })) return;';
    expect(choose).toContain(guard);
    expect(choose.indexOf(guard)).toBeLessThan(choose.indexOf("emitLifecycle('abandon')"));
  });
});
