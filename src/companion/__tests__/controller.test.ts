import { describe, expect, it, vi } from 'vitest';
import { CompanionController } from '../controller';

describe('CompanionController', () => {
  it('turns a completed task into a passive result presentation', () => {
    const show = vi.fn(); const controller = new CompanionController({ show, hide: vi.fn() });
    controller.dispatch({ type: 'task.completed', requestId: 'task-1', text: 'Tarefa concluída: roteiro', nowMs: 1, expiresInMs: 2_000 });
    expect(show).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'task-1', kind: 'result', interaction: 'passthrough', text: 'Tarefa concluída: roteiro' }));
  });

  it('preserves the reducer animation plan in the notch presentation', () => {
    const show = vi.fn();
    const controller = new CompanionController({ show, hide: vi.fn() });

    controller.dispatch({ type: 'ai.stage', requestId: 'listen-1', stage: 'listening', nowMs: 1 });

    expect(show).toHaveBeenCalledWith(expect.objectContaining({
      animation: { entry: 'listening_in', loop: 'listening_loop', reducedMotion: false },
    }));
  });

  it('preserves static-frame instructions when reduced motion is enabled', () => {
    const show = vi.fn();
    const controller = new CompanionController({ show, hide: vi.fn() });

    controller.dispatch({ type: 'ai.stage', requestId: 'listen-2', stage: 'listening', nowMs: 1, reducedMotion: true });

    expect(show).toHaveBeenCalledWith(expect.objectContaining({
      animation: { entry: null, loop: null, staticFrame: 'listening_loop', reducedMotion: true },
    }));
  });

  it('emits a reminder and dismisses it after its expiry', () => {
    const show = vi.fn(); const hide = vi.fn(); const controller = new CompanionController({ show, hide });
    controller.dispatch({ type: 'reminder.triggered', requestId: 'reminder-1', text: 'Horizontes', nowMs: 10, expiresInMs: 100 });
    controller.dispatch({ type: 'time.elapsed', nowMs: 110 });
    expect(show).toHaveBeenCalledWith(expect.objectContaining({ kind: 'reminder' }));
    expect(hide).toHaveBeenCalledWith('reminder-1');
  });

  // O relógio despacha `time.elapsed` a cada segundo. Reapresentar o cartão a cada tique ressuscita
  // no notch uma confirmação que já foi respondida e escondida: só mudanças de verdade viram `show`.
  it('não reapresenta o mesmo cartão a cada tique do relógio', () => {
    const show = vi.fn(); const controller = new CompanionController({ show, hide: vi.fn() });
    controller.dispatch({ type: 'confirmation.requested', requestId: 'confirm-1', text: 'Criar tarefa?', actions: [{ id: 'confirm', label: 'Confirmar' }, { id: 'cancel', label: 'Cancelar' }], nowMs: 0, expiresInMs: 60_000 });
    controller.dispatch({ type: 'time.elapsed', nowMs: 1_000 });
    controller.dispatch({ type: 'time.elapsed', nowMs: 2_000 });
    expect(show).toHaveBeenCalledTimes(1);
  });

  it('esconde a confirmação respondida e não a mostra de novo nos tiques seguintes', () => {
    const show = vi.fn(); const hide = vi.fn(); const controller = new CompanionController({ show, hide });
    controller.dispatch({ type: 'confirmation.requested', requestId: 'confirm-1', text: 'Criar tarefa?', actions: [{ id: 'confirm', label: 'Confirmar' }], nowMs: 0, expiresInMs: 60_000 });
    controller.dispatch({ type: 'presentation.dismissed', requestId: 'confirm-1' });
    expect(hide).toHaveBeenCalledWith('confirm-1');
    show.mockClear();
    controller.dispatch({ type: 'time.elapsed', nowMs: 1_000 });
    controller.dispatch({ type: 'time.elapsed', nowMs: 2_000 });
    expect(show).not.toHaveBeenCalled();
  });
});

// O painel nativo desenha o mascote, não texto: uma resposta enviada para ele apareceria como
// carinha e nada mais.
describe('superfície do cartão', () => {
  it('manda o cartão com texto para a overlay, que sabe desenhá-lo', () => {
    const mostrados: { host?: string; text: string | null }[] = [];
    const controller = new CompanionController({ show: (presentation) => mostrados.push(presentation), hide: () => undefined });

    controller.dispatch({ type: 'ai.result', requestId: 'r1', text: 'Use a técnica de 25 minutos.', nowMs: 1_000, expiresInMs: 10_000 });

    expect(mostrados[0]?.host).toBe('electron');
    expect(mostrados[0]?.text).toBe('Use a técnica de 25 minutos.');
  });

  it('sem texto, o cartão fica no painel nativo, onde o mascote mora', () => {
    const mostrados: { host?: string }[] = [];
    const controller = new CompanionController({ show: (presentation) => mostrados.push(presentation), hide: () => undefined });

    controller.dispatch({ type: 'ai.stage', requestId: 'r2', stage: 'thinking', nowMs: 1_000 });

    expect(mostrados[0]).toBeDefined();
    expect(mostrados[0]?.host).toBeUndefined();
  });
});
