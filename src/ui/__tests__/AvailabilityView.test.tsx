import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AvailabilityView } from '../AvailabilityView';

describe('AvailabilityView adapter status', () => {
  it('uses Pixano branding in the updates surface', () => {
    const markup = renderToStaticMarkup(<AvailabilityView kind="updates" onNavigate={() => undefined} />);

    expect(markup).toContain('Pixano · local build');
    expect(markup).not.toMatch(/Hibi|Taby/);
  });

  it('renders the typed status rows while preserving the companion gallery', () => {
    const markup = renderToStaticMarkup(<AvailabilityView kind="hardware" onNavigate={() => undefined} />);

    expect(markup).toContain('Local persistence');
    expect(markup).toContain('Native notifications');
    expect(markup).toContain('Launch at login');
    expect(markup).toContain('External AI');
    expect(markup).toContain('Hardware');
    expect(markup).toContain('>Available</b>');
    expect(markup).toContain('>Unavailable</b>');
    expect(markup).toContain('Pixano mascot');
    expect(markup).toContain('Checking native companion');
  });
});
