import type { IntegrationDescriptor } from './contracts'

const isIdentifier = (value: string) => /^[a-z0-9-]{1,80}$/.test(value)

export class IntegrationRegistry {
  private readonly values = new Map<string, IntegrationDescriptor>()

  register(descriptor: IntegrationDescriptor): this {
    if (!isIdentifier(descriptor.id) || !descriptor.label.trim() || descriptor.label.length > 120) throw new Error('Invalid integration descriptor.')
    if (this.values.has(descriptor.id)) throw new Error(`Integration connector is already registered: ${descriptor.id}`)
    this.values.set(descriptor.id, Object.freeze({ ...descriptor, capabilities: Object.freeze([...descriptor.capabilities]) }))
    return this
  }

  list(): readonly IntegrationDescriptor[] {
    return [...this.values.values()].map((descriptor) => ({ ...descriptor, capabilities: [...descriptor.capabilities] }))
  }
}
