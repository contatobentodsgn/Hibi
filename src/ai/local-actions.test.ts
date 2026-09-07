import { describe, expect, it } from 'vitest';
import { describeLocalAction, parseLocalAction } from './local-actions';

describe('local assistant actions', () => {
  it('parses a task and keeps the default duration', () => {
    const action = parseLocalAction('crie uma tarefa: revisar o calendário');
    expect(action).toEqual({ kind: 'create-task', title: 'revisar o calendário', durationMinutes: 60 });
  });

  it('parses a scheduled reminder and produces a reviewable description', () => {
    const action = parseLocalAction('adicione um lembrete: reunião às 09:30', new Date('2026-09-06T10:00:00-03:00'));
    expect(action?.kind).toBe('create-reminder');
    expect(describeLocalAction(action!)).toContain('09:30');
  });

  it('parses focus requests', () => expect(parseLocalAction('iniciar foco')).toEqual({ kind: 'start-focus' }));

  it('parses a same-day calendar block', () => {
    const action = parseLocalAction('crie um bloco: revisar pauta das 14:00 às 15:00', new Date('2026-09-06T10:00:00-03:00'));
    expect(action).toMatchObject({ kind: 'create-block', title: 'revisar pauta', category: 'work' });
  });
});
