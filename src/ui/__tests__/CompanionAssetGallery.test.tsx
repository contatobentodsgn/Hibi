import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CompanionAssetGallery } from '../CompanionAssetGallery';

describe('CompanionAssetGallery', () => {
  it('previews only the Pixano cat mascot videos', () => {
    const markup = renderToStaticMarkup(<CompanionAssetGallery />);
    expect(markup).toContain('Pixano mascot');
    expect(markup).toContain('src="/mascot/idle.mp4"');
    expect(markup).toContain('src="/mascot/happy_1.mp4"');
    expect(markup).not.toContain('/companion-assets/animations/');
    expect(markup).not.toContain('Assistant');
    expect(markup).not.toContain('Hibi');
  });
});
