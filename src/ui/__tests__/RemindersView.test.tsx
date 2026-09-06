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

  it('exposes the new reminder control as a modal trigger', () => {
    const markup = renderToStaticMarkup(
      <RemindersView data={createSeedData()} onEvent={() => undefined} onReminderStatusChange={() => undefined} onCreateReminder={() => undefined} />,
    );

    expect(markup).toContain('aria-haspopup="dialog"');
    expect(markup).toContain('aria-controls="reminder-create-title"');
  });

  it('defines an explicit accessible delete confirmation flow', async () => {
    const source = await (await import('node:fs/promises')).readFile(new URL('../RemindersView.tsx', import.meta.url), 'utf8');
    expect(source).not.toContain('window.confirm');
    expect(source).toContain('role="dialog"');
    expect(source).toContain('Confirm delete');
    expect(source).toContain('Cancel');
  });
});
