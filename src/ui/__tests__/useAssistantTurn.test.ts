import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createSeedData } from '../../data/seed-data';
import type { AiTurnRuntime } from '../../ai/runtime';
import { useAssistantTurn, type AssistantTurnControls } from '../useAssistantTurn';

// Runtime fake shaped like AiTurnRuntime: subscribeToStream returns a no-op unsubscribe (never
// exercised here, since renderToStaticMarkup does not run effects), and runTurn rejects with the
// same { failure } shape the real provider errors carry, which failureFor() unwraps.
const failingRuntime = (): AiTurnRuntime => ({
  subscribeToStream: () => () => undefined,
  runTurn: () => Promise.reject(Object.assign(new Error('rate limited'), { failure: { code: 'rate_limited', retryable: true } })),
}) as unknown as AiTurnRuntime;

describe('useAssistantTurn provider-failure companion text', () => {
  it('sends the human-readable failure title to the companion, not the internal failure code', async () => {
    const onEvent = vi.fn();
    const onCompanionError = vi.fn();
    const onCompanionEvent = vi.fn();

    let controls: AssistantTurnControls | undefined;
    const Capture = () => {
      controls = useAssistantTurn({ runtime: failingRuntime(), data: createSeedData(), onEvent, onCompanionEvent, onCompanionError });
      return null;
    };
    renderToStaticMarkup(React.createElement(Capture));

    await controls!.ask('Preciso de ajuda com minhas tarefas');

    // The instrumentation event carries the raw internal code — that line is correct and untouched.
    expect(onEvent).toHaveBeenCalledWith('assistant-query', 'rate_limited', 'failed');

    // The companion-facing text must be the human-readable title, never the internal code.
    expect(onCompanionError).toHaveBeenCalledWith('Rate limit reached');
    expect(onCompanionError).not.toHaveBeenCalledWith('rate_limited');
    expect(onCompanionEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'error.raised', text: 'Rate limit reached' }));
  });
});
