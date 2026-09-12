import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRESENCE_SETTINGS,
  INITIAL_PRESENCE_STATE,
  absenceStartMs,
  decideAwayResponse,
  resolveFocusLoopAnimationId,
  sanitizePresenceEvent,
  sanitizePresenceSettings,
  sanitizePresenceWatch,
  stepPresence,
  type PresenceState,
} from '../../../electron/focus-presence.mjs';
import { DEFAULT_FOCUS_SETTINGS, sanitizeFocusSettings } from '../focus-settings';
import { companionAnimationForState } from '../CompanionAnimation';

describe('ajustes de presença', () => {
  // Escolhidos, não copiados: a tela de ajustes do original não está na árvore (ver focus-presence.mjs).
  it('têm padrões declarados, e o loop "focus" é o único copiado do original', () => {
    expect(DEFAULT_PRESENCE_SETTINGS).toEqual({ idleMinutes: 5, awayBehavior: 'ask', focusLoopAnimation: 'focus', screenTimeoutSeconds: 60 });
    expect(DEFAULT_FOCUS_SETTINGS).toMatchObject(DEFAULT_PRESENCE_SETTINGS);
  });

  it('mantêm um valor válido e trocam um inválido pelo padrão, campo a campo', () => {
    expect(sanitizePresenceSettings({ idleMinutes: 10, awayBehavior: 'pause', focusLoopAnimation: 'music', screenTimeoutSeconds: 300 }))
      .toEqual({ idleMinutes: 10, awayBehavior: 'pause', focusLoopAnimation: 'music', screenTimeoutSeconds: 300 });
    expect(sanitizePresenceSettings({ idleMinutes: 7, awayBehavior: 'sleep', focusLoopAnimation: 'jazz', screenTimeoutSeconds: '300' }))
      .toEqual(DEFAULT_PRESENCE_SETTINGS);
    expect(sanitizePresenceSettings({ idleMinutes: 1, awayBehavior: 'nope' })).toEqual({ ...DEFAULT_PRESENCE_SETTINGS, idleMinutes: 1 });
    expect(sanitizePresenceSettings(null)).toEqual(DEFAULT_PRESENCE_SETTINGS);
  });

  it('passam pela mesma porta dos ajustes de foco, sem mexer nos campos do portão', () => {
    const settings = sanitizeFocusSettings({ sessionMinutes: 50, nudgePreset: 'calm', awayBehavior: 'keep', screenTimeoutSeconds: 30 });
    expect(settings).toEqual({ ...DEFAULT_FOCUS_SETTINGS, sessionMinutes: 50, nudgePreset: 'calm', awayBehavior: 'keep', screenTimeoutSeconds: 30 });
  });
});

describe('decisão de ausência', () => {
  it('só uma sessão de foco rodando reage, conforme o comportamento escolhido', () => {
    expect(decideAwayResponse({ mode: 'focus', phase: 'running', behavior: 'ask' })).toBe('ask');
    expect(decideAwayResponse({ mode: 'focus', phase: 'running', behavior: 'pause' })).toBe('pause');
    expect(decideAwayResponse({ mode: 'focus', phase: 'running', behavior: 'keep' })).toBe('none');
  });

  it('nunca reage na pausa de descanso, com a sessão parada ou já pausada', () => {
    for (const behavior of ['ask', 'pause', 'keep'] as const) {
      expect(decideAwayResponse({ mode: 'break', phase: 'running', behavior })).toBe('none');
      expect(decideAwayResponse({ mode: 'focus', phase: 'idle', behavior })).toBe('none');
      expect(decideAwayResponse({ mode: 'focus', phase: 'paused', behavior })).toBe('none');
    }
  });
});

describe('monitor de presença, passo a passo', () => {
  const threshold = 300;
  const poll = (state: PresenceState, idleSeconds: number, nowMs: number) => stepPresence(state, { kind: 'poll', idleSeconds, thresholdSeconds: threshold, nowMs });
  const power = (state: PresenceState, event: 'lock-screen' | 'suspend' | 'unlock-screen' | 'resume', nowMs: number, idleSeconds = 0) => stepPresence(state, { kind: 'power', event, idleSeconds, nowMs });

  it('abaixo do limiar nada acontece; no limiar emite ausência desde quando o teclado parou', () => {
    expect(poll(INITIAL_PRESENCE_STATE, 299, 1_000_000).event).toBeUndefined();
    const away = poll(INITIAL_PRESENCE_STATE, 300, 1_000_000);
    expect(away.event).toEqual({ type: 'away', reason: 'idle', idleSeconds: 300, atMs: 1_000_000 });
    expect(away.state.away).toEqual({ reason: 'idle', sinceMs: 700_000 });
    // Continuar ocioso não repete a ausência.
    expect(poll(away.state, 400, 1_100_000).event).toBeUndefined();
  });

  it('o teclado de volta emite retorno com o tempo ausente inteiro', () => {
    const away = poll(INITIAL_PRESENCE_STATE, 300, 1_000_000).state;
    expect(poll(away, 2, 1_020_000).event).toEqual({ type: 'returned', reason: 'idle', awaySeconds: 320, atMs: 1_020_000 });
    expect(poll(away, 2, 1_020_000).state).toEqual(INITIAL_PRESENCE_STATE);
  });

  it('bloquear a tela é ausência por energia, e desbloquear é o retorno', () => {
    const locked = power(INITIAL_PRESENCE_STATE, 'lock-screen', 5_000, 30);
    expect(locked.event).toEqual({ type: 'away', reason: 'power', idleSeconds: 30, atMs: 5_000 });
    // Mexer o mouse na tela de senha zera o ocioso, mas a pessoa ainda não voltou.
    expect(poll(locked.state, 0, 6_000).event).toBeUndefined();
    expect(power(locked.state, 'unlock-screen', 65_000).event).toEqual({ type: 'returned', reason: 'power', awaySeconds: 90, atMs: 65_000 });
  });

  it('acordar de um sono com senha só volta depois do desbloqueio', () => {
    let state = power(INITIAL_PRESENCE_STATE, 'lock-screen', 0).state;
    const suspended = power(state, 'suspend', 1_000);
    expect(suspended.event).toBeUndefined();
    state = suspended.state;
    const resumed = power(state, 'resume', 3_600_000);
    expect(resumed.event).toBeUndefined();
    expect(power(resumed.state, 'unlock-screen', 3_660_000).event).toEqual({ type: 'returned', reason: 'power', awaySeconds: 3_660, atMs: 3_660_000 });
  });

  it('dormir sem senha volta no resume, e um retorno sem ausência não emite nada', () => {
    const asleep = power(INITIAL_PRESENCE_STATE, 'suspend', 0, 60).state;
    expect(power(asleep, 'resume', 600_000).event).toEqual({ type: 'returned', reason: 'power', awaySeconds: 660, atMs: 600_000 });
    expect(power(INITIAL_PRESENCE_STATE, 'unlock-screen', 10).event).toBeUndefined();
  });

  it('o pedido de vigia do renderer só liga com `watching: true` e um limiar da lista', () => {
    expect(sanitizePresenceWatch({ watching: true, idleMinutes: 10 })).toEqual({ watching: true, idleSeconds: 600 });
    expect(sanitizePresenceWatch({ watching: 'true', idleMinutes: 10 })).toEqual({ watching: false, idleSeconds: 600 });
    expect(sanitizePresenceWatch({ watching: true, idleMinutes: 0 })).toEqual({ watching: true, idleSeconds: 300 });
    expect(sanitizePresenceWatch(undefined)).toEqual({ watching: false, idleSeconds: 300 });
  });
});

describe('evento de presença no renderer', () => {
  it('aceita só os dois formatos conhecidos', () => {
    expect(sanitizePresenceEvent({ type: 'away', reason: 'idle', idleSeconds: 300, atMs: 10, extra: 'x' })).toEqual({ type: 'away', reason: 'idle', idleSeconds: 300, atMs: 10 });
    expect(sanitizePresenceEvent({ type: 'returned', reason: 'power', awaySeconds: 60, atMs: 10 })).toEqual({ type: 'returned', reason: 'power', awaySeconds: 60, atMs: 10 });
    expect(sanitizePresenceEvent({ type: 'away', reason: 'bored', idleSeconds: 300, atMs: 10 })).toBeNull();
    expect(sanitizePresenceEvent({ type: 'away', reason: 'idle', idleSeconds: -1, atMs: 10 })).toBeNull();
    expect(sanitizePresenceEvent({ type: 'returned', reason: 'idle', atMs: 10 })).toBeNull();
    expect(sanitizePresenceEvent('away')).toBeNull();
  });

  // Um `suspend` só chega ao renderer depois que o Mac acorda: medir pela entrega contaria o sono.
  it('a ausência começa pelo relógio da detecção, não pelo da entrega', () => {
    expect(absenceStartMs({ atMs: 1_000_000, idleSeconds: 300 })).toBe(700_000);
  });
});

describe('loop visual do foco', () => {
  it('"music" toca listening_music_loop e "focus" toca working_laptop_normal_loop', () => {
    expect(resolveFocusLoopAnimationId('music')).toBe('listening_music_loop');
    expect(resolveFocusLoopAnimationId('focus')).toBe('working_laptop_normal_loop');
    expect(resolveFocusLoopAnimationId(undefined)).toBe('working_laptop_normal_loop');
  });

  it('o id resolvido vira o vídeo que já existe no registro de assets, e respeita o movimento reduzido', () => {
    expect(companionAnimationForState(resolveFocusLoopAnimationId('music'))).toMatchObject({ kind: 'video', url: '/companion-assets/animations/notch/listening_music_loop.mp4' });
    expect(companionAnimationForState(resolveFocusLoopAnimationId('focus'))).toMatchObject({ kind: 'video', url: '/companion-assets/animations/notch/working_laptop_normal_loop.mp4' });
    expect(companionAnimationForState(resolveFocusLoopAnimationId('music'), true)).toEqual({ kind: 'fallback', symbol: '♪' });
  });
});
