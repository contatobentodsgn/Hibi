const previews = [
  { id: 'idle', label: 'At rest', src: '/mascot/idle.mp4' },
  { id: 'curious', label: 'Curious', src: '/mascot/idle_curious.mp4' },
  { id: 'listening', label: 'Listening', src: '/mascot/listening.mp4' },
  { id: 'focus', label: 'Focus', src: '/mascot/focus.mp4' },
  { id: 'happy', label: 'Happy', src: '/mascot/happy_1.mp4' },
  { id: 'love', label: 'Love', src: '/mascot/love.mp4' },
] as const;

export function CompanionAssetGallery() {
  return <section className="list-card companion-gallery" aria-labelledby="companion-gallery-title" style={{ marginTop: 15, padding: '22px' }}>
    <div className="companion-gallery-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 18 }}>
      <div>
        <p className="eyebrow">PIXANO MASCOT</p>
        <h2 id="companion-gallery-title">Pixano mascot</h2>
        <p className="muted">Local animations of your cat companion.</p>
      </div>
      <span className="pill green">{previews.length} animations</span>
    </div>
    <div className="companion-gallery-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginTop: 18 }}>
      {previews.map((asset) => <article className="companion-preview" key={asset.id} style={{ minWidth: 0 }}>
        <div className="companion-preview-media" style={{ aspectRatio: '16 / 9', overflow: 'hidden', borderRadius: 10, background: '#171717' }}>
          <video src={asset.src} muted loop autoPlay playsInline preload="none" aria-label={asset.label} />
        </div>
        <div className="companion-preview-caption" style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '9px 2px 0' }}>
          <strong>{asset.label}</strong>
          <span style={{ color: '#888', fontSize: 11 }}>Video · local</span>
        </div>
      </article>)}
    </div>
  </section>;
}
