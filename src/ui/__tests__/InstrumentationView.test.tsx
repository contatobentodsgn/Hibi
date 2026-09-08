import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { InstrumentationView } from '../InstrumentationView';

describe('InstrumentationView AI audit history', () => {
  it('renders request correlation, complete local date-time, type, and status', () => {
    const markup = renderToStaticMarkup(<InstrumentationView events={[]} onEvent={() => undefined} aiHistory={[{ type: 'failed', requestId: 'request-42', at: '2026-09-07T12:34:56.000Z', summary: 'Provider request failed' }]} />);

    expect(markup).toContain('request-42');
    expect(markup).toContain('failed');
    expect(markup).toContain('Provider request failed');
    expect(markup).toMatch(/07\/09\/2026|9\/7\/2026/);
  });

  it('offers an AI-only history clear action separately from the general event log', () => {
    const markup = renderToStaticMarkup(<InstrumentationView events={[{ id: 1, at: '09:00:00', route: 'home', action: 'open', detail: 'Opened home' }]} onEvent={() => undefined} onClear={() => undefined} onClearAiHistory={() => undefined} />);

    expect(markup).toContain('Clear log');
    expect(markup).toContain('Clear AI history');
  });
});
