import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AvailabilityView } from '../AvailabilityView';

describe('Updates view', () => {
  it('clearly explains the offline, not-configured state and keeps Settings navigation', () => {
    const markup = renderToStaticMarkup(<AvailabilityView kind="updates" onNavigate={() => undefined} />);

    expect(markup).toContain('Offline mode');
    expect(markup).toContain('No update source configured');
    expect(markup).toContain('External update checks are disabled in offline mode.');
    expect(markup).toContain('Open Settings');
    expect(markup).toContain('/companion-assets/updates/0.1.7/home-tint-default.png');
    expect(markup).not.toContain('Adapter status');
  });
});
