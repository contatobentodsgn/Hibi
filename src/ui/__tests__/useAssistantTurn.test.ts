import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AiTurnInput, AiTurnRuntime } from '../../ai/runtime';
import { todayKey } from '../../domain/date-context';
import { useAssistantTurn, type AssistantTurnControls } from '../useAssistantTurn';

// Runtime fake shaped like AiTurnRuntime: subscribeToStream returns a no-op unsubscribe (never
// exercised here, since renderToStaticMarkup does not run effects), and runTurn rejects with the
// same { failure } shape the real provider errors carry, which failureFor() unwraps.
const failingRuntime = (): AiTurnRuntime => ({
  subscribeToStream: () => () => undefined,
  runTurn: () => Promise.reject(Object.assign(new Error('rate limited'), { failure: { code: 'rate_limited', retryable: true } })),
}) as unknown as AiTurnRuntime;

// Runtime fake that only records the turn input and answers without any action.
const capturingRuntime = (calls: AiTurnInput[]): AiTurnRuntime => ({
  subscribeToStream: () => () => undefined,
  runTurn: (input: AiTurnInput) => {
    calls.push(input);
    return Promise.resolve({ requestId: input.requestId, providerLabel: 'fake', provider: { id: 'fake', label: 'fake', fallback: false }, reply: 'ok', toolResults: [] });
  },
}) as unknown as AiTurnRuntime;

const capture = (runtime: AiTurnRuntime, handlers: Partial<Parameters<typeof useAssistantTurn>[0]> = {}) => {
  let controls: AssistantTurnControls | undefined;
  const Capture = () => {
    controls = useAssistantTurn({ runtime, onEvent: () => undefined, ...handlers });
    return null;
  };
  renderToStaticMarkup(React.createElement(Capture));
  return controls!;
};

describe('useAssistantTurn provider-failure companion text', () => {
  it('sends the human-readable failure title to the companion, not the internal failure code', async () => {
    const onEvent = vi.fn();
    const onCompanionError = vi.fn();
    const onCompanionEvent = vi.fn();

    const controls = capture(failingRuntime(), { onEvent, onCompanionEvent, onCompanionError });

    await controls.ask('Preciso de ajuda com minhas tarefas');

    // The instrumentation event carries the raw internal code — that line is correct and untouched.
    expect(onEvent).toHaveBeenCalledWith('assistant-query', 'rate_limited', 'failed');

    // The companion-facing text must be the human-readable title, never the internal code.
    expect(onCompanionError).toHaveBeenCalledWith('Rate limit reached');
    expect(onCompanionError).not.toHaveBeenCalledWith('rate_limited');
    expect(onCompanionEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'error.raised', text: 'Rate limit reached' }));
  });
});

describe('useAssistantTurn clock', () => {
  // O assistente precisa raciocinar sobre o agora de quem pergunta. Antes recebia 09:00 em -03:00
  // no dia do bloco mais antigo do workspace: dia errado e, fora de São Paulo, hora errada também.
  it('gives the runtime the real local instant, not a fixed hour on the oldest block of the workspace', async () => {
    const calls: AiTurnInput[] = [];
    const controls = capture(capturingRuntime(calls));

    const before = Date.now();
    await controls.ask('qual a agenda de hoje?');
    const after = Date.now();

    expect(calls).toHaveLength(1);
    const now = calls[0].now;
    expect(now).toBeInstanceOf(Date);
    expect(now!.getTime()).toBeGreaterThanOrEqual(before);
    expect(now!.getTime()).toBeLessThanOrEqual(after);
    expect(todayKey(now!)).toBe(todayKey());
  });
});
