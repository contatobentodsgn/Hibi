import { describe, expect, it } from 'vitest';
import { companionAssets, companionAssetList, type CompanionAsset } from '../companion-assets';

describe('companion asset registry', () => {
  it('contains browser-safe assets and excludes quarantined Rive resources', () => {
    const assets: CompanionAsset[] = companionAssetList;
    expect(assets).toHaveLength(20);
    expect(assets.every(({ url }) => url.startsWith('/companion-assets/'))).toBe(true);
    expect(assets.every(({ kind }) => kind === 'image')).toBe(true);
    expect(assets).toEqual(expect.not.arrayContaining([expect.objectContaining({ url: expect.stringContaining('/rive/talk/') })]));
    expect(companionAssets.icons.catMarkApp.kind).toBe('image');
  });

  it('gives every eligible asset a stable semantic ID and label', () => {
    expect(companionAssetList.every(({ id, label }) => id.length > 0 && label.length > 0)).toBe(true);
    expect(new Set(companionAssetList.map(({ id }) => id)).size).toBe(companionAssetList.length);
    expect(companionAssets.icons.catMarkApp.id).toBe('icons.catMarkApp');
    expect(companionAssets.icons.catMarkApp.label).toBe('Cat Mark');
    expect(companionAssets.icons.catFaviconFace.url).toBe('/companion-assets/icons/pixano-cat-face.svg');
    expect(companionAssets.icons.catFaviconFull.url).toBe('/companion-assets/icons/pixano-cat-full.svg');
    expect(companionAssets.icons.catMarkApp.url).toBe('/companion-assets/icons/pixano-cat-mark.svg');
  });
});
