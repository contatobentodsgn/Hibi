import { describe, expect, it } from 'vitest';
import { FOCUS_MOODS, resolveFocusLoopAnimationId, type FocusMood } from '../../../electron/focus-presence.mjs';
import { createActivityRecord, type ActivityRecord } from '../../domain/activity';
import { focusActivity } from '../../domain/activity-events';
import { companionAnimationForState } from '../CompanionAnimation';
import { completeFocus, IDLE_FOCUS_LIFECYCLE, startFocus } from '../focus-lifecycle';
import { deriveFocusMood, EXCITED_AFTER_COMPLETED_TODAY, focusSessionsCompletedToday } from '../focus-mood';

// Datas montadas com componentes locais: o dia é o do relógio de quem usa o app, em qualquer fuso.
const completedAt = (date: Date): ActivityRecord => createActivityRecord(focusActivity('completed', 25, date.toISOString()));
const cancelledAt = (date: Date): ActivityRecord => createActivityRecord(focusActivity('cancelled', 10, date.toISOString()));

describe('humor do companion durante o foco', () => {
  it('segue a matriz: ausente é entediado, 2 ou mais concluídas hoje é animado, o resto é normal', () => {
    const matrix: [awayPending: boolean, completedToday: number, mood: FocusMood][] = [
      [true, 0, 'bored'],
      [true, 1, 'bored'],
      // Esperando a volta, o companion espera — mesmo num dia animado.
      [true, 5, 'bored'],
      [false, 0, 'normal'],
      [false, 1, 'normal'],
      [false, 2, 'excited'],
      [false, 7, 'excited'],
    ];
    for (const [awayPending, completedToday, mood] of matrix) expect(deriveFocusMood({ awayPending, completedToday }), `${awayPending}/${completedToday}`).toBe(mood);
    expect(EXCITED_AFTER_COMPLETED_TODAY).toBe(2);
  });

  it('conta só sessões concluídas hoje, e ignora as de ontem perto da meia-noite local', () => {
    const now = new Date(2026, 8, 11, 0, 10);
    const records = [
      completedAt(new Date(2026, 8, 10, 23, 50)),
      completedAt(new Date(2026, 8, 10, 23, 59, 59)),
      completedAt(new Date(2026, 8, 11, 0, 1)),
      // Abandonada não é concluída.
      cancelledAt(new Date(2026, 8, 11, 0, 2)),
    ];
    expect(focusSessionsCompletedToday(records, now)).toBe(1);
    expect(deriveFocusMood({ awayPending: false, completedToday: focusSessionsCompletedToday(records, now) })).toBe('normal');

    // A segunda concluída hoje, antes desta sessão: esta é a terceira, e o companion trabalha animado.
    const twoToday = [...records, completedAt(new Date(2026, 8, 11, 0, 5))];
    expect(focusSessionsCompletedToday(twoToday, now)).toBe(2);
    expect(deriveFocusMood({ awayPending: false, completedToday: focusSessionsCompletedToday(twoToday, now) })).toBe('excited');

    // Na véspera, perto da meia-noite, as sessões de hoje ainda são de amanhã.
    expect(focusSessionsCompletedToday(twoToday, new Date(2026, 8, 10, 23, 59, 59))).toBe(2);
    expect(focusSessionsCompletedToday(twoToday, new Date(2026, 8, 12, 0, 0))).toBe(0);
  });

  // Duas sessões sem ninguém na frente do Mac não podem deixar o companion animado.
  it('duas sessões rebaixadas por falta de presença hoje não deixam o companion animado', () => {
    const now = new Date(2026, 8, 11, 15, 0);
    const minute = 60_000;
    const limit = 25 * minute;
    // Cada uma: 25 minutos de relógio, a pessoa saiu no primeiro e ninguém respondeu até o zero.
    const unattended = completeFocus(startFocus(IDLE_FOCUS_LIFECYCLE, 0, limit).state, limit, { sinceMs: minute }).event!;
    expect(unattended).toEqual({ type: 'cancelled', focusedMinutes: 1 });
    const demoted = [new Date(2026, 8, 11, 9, 0), new Date(2026, 8, 11, 10, 0)].map((at) => createActivityRecord(focusActivity(unattended.type as 'cancelled', unattended.focusedMinutes, at.toISOString())));
    expect(focusSessionsCompletedToday(demoted, now)).toBe(0);
    expect(deriveFocusMood({ awayPending: false, completedToday: focusSessionsCompletedToday(demoted, now) })).toBe('normal');

    // As mesmas duas sessões com alguém presente o tempo todo concluem, e aí sim o companion fica animado.
    const attended = completeFocus(startFocus(IDLE_FOCUS_LIFECYCLE, 0, limit).state, limit).event!;
    expect(attended.type).toBe('completed');
    const whole = [new Date(2026, 8, 11, 9, 0), new Date(2026, 8, 11, 10, 0)].map((at) => createActivityRecord(focusActivity(attended.type as 'completed', attended.focusedMinutes, at.toISOString())));
    expect(deriveFocusMood({ awayPending: false, completedToday: focusSessionsCompletedToday(whole, now) })).toBe('excited');
  });

  it('não conta registros semeados, como o /stats', () => {
    const now = new Date(2026, 8, 11, 15, 0);
    const seeded = [completedAt(new Date(2026, 8, 11, 9, 0)), completedAt(new Date(2026, 8, 11, 10, 0))].map((record) => ({ ...record, seeded: true }));
    expect(focusSessionsCompletedToday(seeded, now)).toBe(0);
  });
});

describe('loop do foco pelo humor', () => {
  it('"trabalhando" toca o notebook no humor do momento, e sem humor fica no normal', () => {
    expect(resolveFocusLoopAnimationId('focus', 'bored')).toBe('working_laptop_bored_loop');
    expect(resolveFocusLoopAnimationId('focus', 'normal')).toBe('working_laptop_normal_loop');
    expect(resolveFocusLoopAnimationId('focus', 'excited')).toBe('working_laptop_excited_loop');
    expect(resolveFocusLoopAnimationId('focus')).toBe('working_laptop_normal_loop');
    expect(resolveFocusLoopAnimationId(undefined, 'excited')).toBe('working_laptop_excited_loop');
    // Um humor desconhecido, nem herdado do protótipo, cai no normal.
    expect(resolveFocusLoopAnimationId('focus', 'toString' as FocusMood)).toBe('working_laptop_normal_loop');
  });

  it('"ouvindo música" sempre toca o loop de música, qualquer que seja o humor', () => {
    expect(FOCUS_MOODS).toEqual(['bored', 'normal', 'excited']);
    for (const mood of [...FOCUS_MOODS, undefined]) expect(resolveFocusLoopAnimationId('music', mood)).toBe('listening_music_loop');
  });

  it('cada loop de humor é um vídeo do registro de assets, e o movimento reduzido continua valendo', () => {
    expect(companionAnimationForState(resolveFocusLoopAnimationId('focus', 'bored'))).toMatchObject({ kind: 'video', url: '/companion-assets/animations/notch/working_laptop_bored_loop.mp4' });
    expect(companionAnimationForState(resolveFocusLoopAnimationId('focus', 'excited'))).toMatchObject({ kind: 'video', url: '/companion-assets/animations/notch/working_laptop_excited_loop.mp4' });
    expect(companionAnimationForState(resolveFocusLoopAnimationId('focus', 'excited'), true)).toEqual({ kind: 'fallback', symbol: '●' });
  });
});
