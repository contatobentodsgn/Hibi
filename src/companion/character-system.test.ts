import { describe, expect, it } from 'vitest';
import {
  BODY_STATES,
  EARS_STATES,
  EYES_STATES,
  FX_STATES,
  HIBI_PRESETS,
  TAIL_STATES,
  PROP_STATES,
  DEFAULT_HIBI_VIEW_MODEL,
  normalizeHibiViewModel,
  resolveHibiComposition,
} from './character-system';

describe('Hibi character system contract', () => {
  it('keeps the master catalog sizes stable', () => {
    expect(BODY_STATES).toHaveLength(20);
    expect(EYES_STATES).toHaveLength(30);
    expect(EARS_STATES).toHaveLength(10);
    expect(TAIL_STATES).toHaveLength(8);
    expect(PROP_STATES).toHaveLength(40);
    expect(FX_STATES).toHaveLength(20);
  });

  it('provides a safe default view model and named presets', () => {
    expect(DEFAULT_HIBI_VIEW_MODEL.mode).toBe('companion');
    expect(DEFAULT_HIBI_VIEW_MODEL.intensity).toBe(1);
    expect(HIBI_PRESETS.deep_focus.isFocused).toBe(true);
    expect(HIBI_PRESETS.perfect_session.celebration).toBe('large');
  });

  it('normalizes values and resolves composition constraints', () => {
    const model = normalizeHibiViewModel({ ...DEFAULT_HIBI_VIEW_MODEL, intensity: 99 as never, progress: -2, body: 'body_07_back', propPrimary: 'prop_04_laptop' });
    expect(model.intensity).toBe(4);
    expect(model.progress).toBe(0);
    expect(resolveHibiComposition(model).eyesVisible).toBe(false);
    expect(resolveHibiComposition({ ...model, body: 'body_05_side_left' }).eyes).toBe('eyes_30_looking_sideways');
  });
});
