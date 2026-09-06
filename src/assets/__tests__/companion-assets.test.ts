import { describe, expect, it } from 'vitest';
import { companionAssets, companionAssetList, type CompanionAsset } from '../companion-assets';

describe('companion asset registry', () => {
  it('contains browser-safe assets and excludes quarantined Rive resources', () => {
    const assets: CompanionAsset[] = companionAssetList;
    expect(assets).toHaveLength(97);
    expect(assets.every(({ url }) => url.startsWith('/companion-assets/'))).toBe(true);
    expect(assets.some(({ url }) => url.endsWith('working_loop.mp4'))).toBe(true);
    expect(assets).toEqual(expect.not.arrayContaining([expect.objectContaining({ url: expect.stringContaining('/rive/talk/') })]));
    expect(companionAssets.animations.notch.idle01Loop.kind).toBe('video');
    expect(companionAssets.icons.tabyMarkApp.kind).toBe('image');
  });
});
