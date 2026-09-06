import { companionAssetList, type CompanionAsset } from '../assets/companion-assets';

const PREVIEW_LIMIT = 6;
const REPRESENTATIVE_IDS = [
  'animations.notch.idle01Loop',
  'animations.notch.workingLoop',
  'animations.notch.taskCompleted',
  'animations.status.searchingLoop',
  'icons.tabyMarkApp',
  'updates.homeTintDefault',
] as const;

const previews = REPRESENTATIVE_IDS
  .flatMap((id) => {
    const asset = companionAssetList.find((candidate) => candidate.id === id);
    return asset ? [asset as CompanionAsset] : [];
  })
  .slice(0, PREVIEW_LIMIT);

const quarantined = [
  'rive/talk/*.riv',
  'rive/talk/*.wasm',
];

export function CompanionAssetGallery() {
  return <section className="list-card companion-gallery" aria-labelledby="companion-gallery-title" style={{ marginTop: 15, padding: '22px' }}>
    <div className="companion-gallery-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 18 }}>
      <div>
        <p className="eyebrow">LOCAL ASSET CABINET</p>
        <h2 id="companion-gallery-title">Companion previews</h2>
        <p className="muted">A small browser-safe sample from the bundled companion library.</p>
      </div>
      <span className="pill green">{previews.length} previews</span>
    </div>
    <div className="companion-gallery-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginTop: 18 }}>
      {previews.map((asset) => <PreviewCard key={asset.id} asset={asset} />)}
    </div>
    <div className="companion-quarantine" style={{ display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'center', borderTop: '1px solid #ebe9e5', marginTop: 20, paddingTop: 18 }}>
      <div>
        <strong>Reference only · quarantined formats</strong>
        <span style={{ display: 'block', color: '#888', fontSize: 12, marginTop: 5 }}>Not loaded or executed in this offline build.</span>
      </div>
      <div className="companion-reference-list" aria-label="Quarantined companion assets" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
        {quarantined.map((asset) => <code key={asset}>{asset}</code>)}
      </div>
    </div>
  </section>;
}

function PreviewCard({ asset }: { asset: CompanionAsset }) {
  return <article className="companion-preview" style={{ minWidth: 0 }}>
    <div className="companion-preview-media" style={{ aspectRatio: '16 / 9', overflow: 'hidden', borderRadius: 10, background: '#171717' }}>
      {asset.kind === 'video'
        ? <video src={asset.url} muted loop autoPlay playsInline preload="none" aria-label={asset.label} />
        : <img src={asset.url} loading="lazy" alt={asset.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
    </div>
    <div className="companion-preview-caption" style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '9px 2px 0' }}><strong>{asset.label}</strong><span style={{ color: '#888', fontSize: 11 }}>{asset.kind} · local</span></div>
  </article>;
}
