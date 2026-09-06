import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createSeedData } from '../../data/seed-data';
import { RemindersView } from '../RemindersView';

describe('RemindersView recurrence editor', () => {
  it('keeps the reminder list free of prompt-based recurrence controls', () => {
    const markup = renderToStaticMarkup(
      <RemindersView data={createSeedData()} onEvent={() => undefined} onReminderStatusChange={() => undefined} />,
    );

    expect(markup).toContain('aria-label="Edit vaga/inglês - Horizontes"');
    expect(markup).not.toContain('window.prompt');
  });
});
