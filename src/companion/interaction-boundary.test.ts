import { describe, expect, it } from 'vitest';
import { classifyCompanionPresentation } from './interaction-boundary';

describe('companion interaction boundary', () => {
  it('sends passive content to the visual host', () => {
    expect(classifyCompanionPresentation({ actions: [], interaction: 'passthrough' })).toBe('visual');
  });

  it('sends every action-bearing presentation to the action surface', () => {
    expect(classifyCompanionPresentation({ actions: [{ id: 'confirm', label: 'Confirmar' }], interaction: 'capture' })).toBe('action');
  });

  it('protects the visual host when actions and interaction disagree', () => {
    expect(classifyCompanionPresentation({ actions: [{ id: 'confirm', label: 'Confirmar' }], interaction: 'passthrough' })).toBe('action');
  });
});
