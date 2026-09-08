import { describe, expect, it } from 'vitest';
import { initialCompanionState, reduceCompanion } from '../reducer';

describe('companion reducer', () => {
  it('moves from idle through listening and thinking to a result', () => {
    const listening = reduceCompanion(initialCompanionState, {
      type: 'ai.stage', requestId: 'turn-a', stage: 'listening', text: 'Listening', nowMs: 100,
    });
    expect(listening).toMatchObject({
      requestId: 'turn-a', kind: 'listening', priority: 70,
      animation: { entry: 'listening_in', loop: 'listening_loop', reducedMotion: false },
      text: 'Listening', actions: [], interaction: 'passthrough', expiresAtMs: null,
    });

    const thinking = reduceCompanion(listening, {
      type: 'ai.stage', requestId: 'turn-a', stage: 'thinking', text: 'Thinking', nowMs: 200,
    });
    expect(thinking).toMatchObject({
      kind: 'thinking', animation: { entry: null, loop: 'searching_loop' }, interaction: 'passthrough',
    });

    const result = reduceCompanion(thinking, {
      type: 'ai.result', requestId: 'turn-a', text: 'Ready', nowMs: 300, expiresInMs: 4_000,
    });
    expect(result).toMatchObject({
      kind: 'result', priority: 50,
      animation: { entry: 'taby_response_ready_in', loop: 'taby_response_ready_loop' },
      text: 'Ready', interaction: 'passthrough', expiresAtMs: 4_300,
    });
  });

  it('keeps confirmation visible when a lower-priority focus cue arrives', () => {
    const confirmation = reduceCompanion(initialCompanionState, {
      type: 'confirmation.requested', requestId: 'confirm-a', text: 'Create this task?',
      actions: [{ id: 'approve', label: 'Create' }, { id: 'cancel', label: 'Cancel' }],
      nowMs: 10, expiresInMs: 30_000,
    });
    const afterFocus = reduceCompanion(confirmation, {
      type: 'focus.started', requestId: 'focus-a', text: 'Focus active', nowMs: 20,
    });
    expect(afterFocus).toBe(confirmation);
    expect(confirmation).toMatchObject({ kind: 'confirmation', priority: 100, interaction: 'capture' });
  });

  it('ignores stale dismissal and animation-ended events', () => {
    const active = reduceCompanion(initialCompanionState, {
      type: 'ai.result', requestId: 'new', text: 'New result', nowMs: 10,
    });
    expect(reduceCompanion(active, { type: 'presentation.dismissed', requestId: 'old' })).toBe(active);
    expect(reduceCompanion(active, { type: 'animation.ended', requestId: 'old' })).toBe(active);
  });

  it('makes animation-only presentations click-through', () => {
    const focus = reduceCompanion(initialCompanionState, {
      type: 'focus.started', requestId: 'focus-a', text: 'Working', nowMs: 0,
    });
    expect(focus.actions).toEqual([]);
    expect(focus.interaction).toBe('passthrough');
  });

  it('turns a completed focus session into a short result presentation', () => {
    const completed = reduceCompanion(initialCompanionState, {
      type: 'focus.completed', requestId: 'focus-complete', text: 'Focus complete', nowMs: 0, expiresInMs: 3_000,
    });

    expect(completed).toMatchObject({ kind: 'result', text: 'Focus complete', expiresAtMs: 3_000, interaction: 'passthrough' });
  });

  it('captures the pointer for visible actions', () => {
    const reminder = reduceCompanion(initialCompanionState, {
      type: 'reminder.triggered', requestId: 'reminder-a', text: 'Send the message',
      actions: [{ id: 'done', label: 'Done' }], animationId: 'waiting_01', nowMs: 0,
    });
    expect(reminder).toMatchObject({ kind: 'reminder', priority: 60, interaction: 'capture' });
  });

  it('expires only the current presentation', () => {
    const result = reduceCompanion(initialCompanionState, {
      type: 'ai.result', requestId: 'turn-a', text: 'Ready', nowMs: 1_000, expiresInMs: 2_000,
    });
    expect(reduceCompanion(result, { type: 'time.elapsed', nowMs: 2_999 })).toBe(result);
    expect(reduceCompanion(result, { type: 'time.elapsed', nowMs: 3_000 })).toEqual(initialCompanionState);
  });

  it('uses a static semantic frame in reduced-motion mode', () => {
    const listening = reduceCompanion(initialCompanionState, {
      type: 'ai.stage', requestId: 'turn-a', stage: 'listening', nowMs: 0, reducedMotion: true,
    });
    expect(listening.animation).toEqual({ entry: null, loop: null, staticFrame: 'listening_loop', reducedMotion: true });
  });

  it('returns to idle when the current presentation is dismissed or its animation ends', () => {
    const completed = reduceCompanion(initialCompanionState, {
      type: 'task.completed', requestId: 'task-a', text: 'Task complete', nowMs: 0,
    });
    expect(reduceCompanion(completed, { type: 'animation.ended', requestId: 'task-a' })).toEqual(initialCompanionState);

    const result = reduceCompanion(initialCompanionState, {
      type: 'ai.result', requestId: 'turn-a', text: 'Ready', nowMs: 0,
    });
    expect(reduceCompanion(result, { type: 'presentation.dismissed', requestId: 'turn-a' })).toEqual(initialCompanionState);
  });
});
