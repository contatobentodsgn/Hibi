import { describe, expect, it, vi } from 'vitest';
import { CompanionController } from '../controller';

describe('CompanionController', () => {
  it('turns a completed task into a passive result presentation', () => {
    const show = vi.fn(); const controller = new CompanionController({ show, hide: vi.fn() });
    controller.dispatch({ type: 'task.completed', requestId: 'task-1', text: 'Tarefa concluída: roteiro', nowMs: 1, expiresInMs: 2_000 });
    expect(show).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'task-1', kind: 'result', interaction: 'passthrough', text: 'Tarefa concluída: roteiro' }));
  });

  it('emits a reminder and dismisses it after its expiry', () => {
    const show = vi.fn(); const hide = vi.fn(); const controller = new CompanionController({ show, hide });
    controller.dispatch({ type: 'reminder.triggered', requestId: 'reminder-1', text: 'Horizontes', nowMs: 10, expiresInMs: 100 });
    controller.dispatch({ type: 'time.elapsed', nowMs: 110 });
    expect(show).toHaveBeenCalledWith(expect.objectContaining({ kind: 'reminder' }));
    expect(hide).toHaveBeenCalledWith('reminder-1');
  });
});
