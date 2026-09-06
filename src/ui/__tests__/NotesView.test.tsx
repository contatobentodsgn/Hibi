import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createSeedData } from '../../data/seed-data';
import { NotesView } from '../NotesView';

describe('NotesView note editor', () => {
  it('exposes an accessible form instead of prompt-based note controls', () => {
    const markup = renderToStaticMarkup(
      <NotesView data={createSeedData()} onCreate={() => undefined} onUpdate={() => undefined} onDelete={() => undefined} />,
    );

    expect(markup).toContain('aria-label="Create note"');
    expect(markup).toContain('for="new-note-title"');
    expect(markup).not.toContain('window.prompt');
  });
});
