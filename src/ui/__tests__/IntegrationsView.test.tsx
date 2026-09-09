import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { IntegrationsView } from '../IntegrationsView'

describe('IntegrationsView', () => {
  it('shows safe connection statuses, audit controls, imports, and local API controls without credentials', () => {
    const markup = renderToStaticMarkup(<IntegrationsView onEvent={() => undefined} />)

    expect(markup).toContain('Integrations')
    expect(markup).toContain('Notion')
    expect(markup).toContain('Slack')
    expect(markup).toContain('Email')
    expect(markup).toContain('Remote notifications')
    expect(markup).toContain('Refresh status')
    expect(markup).toContain('Connect securely')
    expect(markup).toContain('Import preview')
    expect(markup).toContain('Local API')
    expect(markup).toContain('Start local API')
    expect(markup).toContain('Saved credentials are never shown again in this view.')
  })
})
