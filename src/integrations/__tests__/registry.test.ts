import { describe, expect, it } from 'vitest'
import { IntegrationRegistry } from '../registry'

describe('IntegrationRegistry', () => {
  it('exposes only safe connector descriptors and rejects duplicate IDs', () => {
    const registry = new IntegrationRegistry()
    registry.register({ id: 'notion', label: 'Notion', capabilities: ['import', 'write'] })

    expect(registry.list()).toEqual([{ id: 'notion', label: 'Notion', capabilities: ['import', 'write'] }])
    expect(() => registry.register({ id: 'notion', label: 'Other', capabilities: [] })).toThrow('already registered')
  })
})
