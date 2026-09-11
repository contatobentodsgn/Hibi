import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { InstrumentationView } from '../InstrumentationView';

describe('InstrumentationView AI audit history', () => {
  it('renders request correlation, complete local date-time, type, and status', () => {
    // A view mostra o instante no relógio de quem lê, que é o certo para um registro de auditoria.
    // Fixar aqui um dia de calendário só valeria perto de UTC-03, então o instante é montado com
    // componentes locais e a expectativa sai do mesmo instante.
    const at = new Date(2026, 8, 7, 12, 34, 56);
    const markup = renderToStaticMarkup(<InstrumentationView events={[]} onEvent={() => undefined} aiHistory={[{ type: 'failed', requestId: 'request-42', at: at.toISOString(), summary: 'Provider request failed' }]} />);

    expect(markup).toContain('request-42');
    expect(markup).toContain('failed');
    expect(markup).toContain('Provider request failed');
    expect(markup).toContain(at.toLocaleString());
  });

  it('offers an AI-only history clear action separately from the general event log', () => {
    const markup = renderToStaticMarkup(<InstrumentationView events={[{ id: 1, at: '09:00:00', route: 'home', action: 'open', detail: 'Opened home' }]} onEvent={() => undefined} onClear={() => undefined} onClearAiHistory={() => undefined} />);

    expect(markup).toContain('Clear log');
    expect(markup).toContain('Clear AI history');
  });
});
