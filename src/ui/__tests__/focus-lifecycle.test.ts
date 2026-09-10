import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { abandon, complete, IDLE_FOCUS_LIFECYCLE, pause, start, stepFocusLifecycle, type FocusLifecycleAction, type FocusLifecycleState } from '../focus-lifecycle';

const minute = 60_000;

describe('focus lifecycle', () => {
  it('starts an idle session and resumes a paused one', () => {
    const started = start(IDLE_FOCUS_LIFECYCLE, 1_000);
    expect(started.event).toEqual({ type: 'started' });
    expect(started.state).toEqual({ phase: 'running', accumulatedMs: 0, runningSince: 1_000 });

    const paused = pause(started.state, 1_000 + 4 * minute);
    expect(paused.event).toEqual({ type: 'paused' });
    expect(paused.state).toEqual({ phase: 'paused', accumulatedMs: 4 * minute });

    const resumed = start(paused.state, 10 * minute);
    expect(resumed.event).toEqual({ type: 'resumed' });
    expect(resumed.state).toEqual({ phase: 'running', accumulatedMs: 4 * minute, runningSince: 10 * minute });
  });

  it('ignores a start while running and a pause while not running', () => {
    const running: FocusLifecycleState = { phase: 'running', accumulatedMs: 0, runningSince: 0 };
    expect(start(running, 5)).toEqual({ state: running });
    expect(pause(IDLE_FOCUS_LIFECYCLE, 5)).toEqual({ state: IDLE_FOCUS_LIFECYCLE });
    const paused: FocusLifecycleState = { phase: 'paused', accumulatedMs: minute };
    expect(pause(paused, 5)).toEqual({ state: paused });
  });

  it('completes with the measured minutes across pauses, excluding paused time', () => {
    let state = start(IDLE_FOCUS_LIFECYCLE, 0).state;
    state = pause(state, 10 * minute).state;
    state = start(state, 30 * minute).state;
    const done = complete(state, 45 * minute);
    expect(done).toEqual({ state: IDLE_FOCUS_LIFECYCLE, event: { type: 'completed', focusedMinutes: 25 } });
  });

  it('rounds to the nearest minute', () => {
    const running = start(IDLE_FOCUS_LIFECYCLE, 0).state;
    expect(complete(running, 29_999).event).toEqual({ type: 'completed', focusedMinutes: 0 });
    expect(complete(running, 30_000).event).toEqual({ type: 'completed', focusedMinutes: 1 });
    expect(complete(running, 24 * minute + 40_000).event).toEqual({ type: 'completed', focusedMinutes: 25 });
  });

  it('never measures negative time when the clock goes backwards', () => {
    const running = start(IDLE_FOCUS_LIFECYCLE, 10 * minute).state;
    expect(pause(running, 0).state.accumulatedMs).toBe(0);
    expect(complete(running, 0).event).toEqual({ type: 'completed', focusedMinutes: 0 });
    expect(abandon(running, 0).event).toEqual({ type: 'cancelled', focusedMinutes: 0 });
  });

  it('cancels only a started, unfinished session', () => {
    const running = start(IDLE_FOCUS_LIFECYCLE, 0).state;
    expect(abandon(running, 7 * minute)).toEqual({ state: IDLE_FOCUS_LIFECYCLE, event: { type: 'cancelled', focusedMinutes: 7 } });
    const paused = pause(running, 3 * minute).state;
    expect(abandon(paused, 60 * minute)).toEqual({ state: IDLE_FOCUS_LIFECYCLE, event: { type: 'cancelled', focusedMinutes: 3 } });
    expect(abandon(IDLE_FOCUS_LIFECYCLE, 60 * minute)).toEqual({ state: IDLE_FOCUS_LIFECYCLE });
  });

  it('does not complete an idle session', () => {
    expect(complete(IDLE_FOCUS_LIFECYCLE, minute)).toEqual({ state: IDLE_FOCUS_LIFECYCLE });
  });

  it('emits nothing after a completion is replayed', () => {
    const done = complete(start(IDLE_FOCUS_LIFECYCLE, 0).state, 25 * minute);
    expect(complete(done.state, 25 * minute).event).toBeUndefined();
    expect(abandon(done.state, 25 * minute).event).toBeUndefined();
  });
});

describe('stepFocusLifecycle', () => {
  const actions: FocusLifecycleAction[] = ['start', 'pause', 'start', 'complete', 'start', 'abandon'];

  it('follows the lifecycle in focus mode', () => {
    let state = IDLE_FOCUS_LIFECYCLE;
    const events = actions.map((action, index) => { const step = stepFocusLifecycle('focus', action, state, index * minute); state = step.state; return step.event?.type; });
    expect(events).toEqual(['started', 'paused', 'resumed', 'completed', 'started', 'cancelled']);
  });

  it('never emits lifecycle events in break mode', () => {
    let state = IDLE_FOCUS_LIFECYCLE;
    for (const [index, action] of actions.entries()) {
      const step = stepFocusLifecycle('break', action, state, index * minute);
      expect(step.event).toBeUndefined();
      state = step.state;
    }
    expect(state).toEqual(IDLE_FOCUS_LIFECYCLE);
  });
});

describe('FocusView lifecycle wiring', () => {
  const source = readFileSync(new URL('../FocusView.tsx', import.meta.url), 'utf8');

  it('emits lifecycle events only through the mode-aware step', () => {
    expect(source.match(/onFocusLifecycleRef\.current\?\.\(/g)).toHaveLength(1);
    expect(source).toMatch(/const step = stepFocusLifecycle\(mode, action, lifecycle\.current, Date\.now\(\)\);/);
    expect(source).not.toMatch(/setSeconds\(\(value\) => [^)]*emitLifecycle/);
  });
});
