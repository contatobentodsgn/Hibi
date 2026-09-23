import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AssistantBar, latestWords } from '../AssistantBar';

describe('AssistantBar', () => {
  it('preserves the active request while showing a reply', () => {
    const markup = renderToStaticMarkup(<AssistantBar initialContent={{ requestId: 'r-1', mode: 'reply', kind: 'result', text: 'Tarefa criada.', actions: [] }} bridge={undefined} />);
    expect(markup).toContain('Tarefa criada.');
    expect(markup).toContain('data-mode="reply"');
  });

  it('keeps the tail of long dictation visible', () => {
    expect(latestWords('uma frase curta')).toBe('uma frase curta');
    expect(latestWords('palavra '.repeat(12))).toMatch(/^…/u);
  });

  it('follows the Hibi theme instead of the macOS preference', () => {
    const css = readFileSync(new URL('../assistant-bar.css', import.meta.url), 'utf8');
    expect(css).toContain('var(--hibi-paper)');
    expect(css).toContain(':root[data-theme="dark"]');
    expect(css).not.toContain('prefers-color-scheme');
  });
});
