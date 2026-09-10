export type ReadOnlyShare = Readonly<{
  scope: 'read-only'
  expiresAt: string
  payload: Record<string, unknown>
  signature: string
}>

const encoder = new TextEncoder()
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const signingPayload = (share: Omit<ReadOnlyShare, 'signature'>) => JSON.stringify({ scope: share.scope, expiresAt: share.expiresAt, payload: share.payload })

async function sign(payload: string, secret: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Secure share signing is unavailable.')
  const key = await globalThis.crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return base64(new Uint8Array(await globalThis.crypto.subtle.sign('HMAC', key, encoder.encode(payload))))
}

const safePayload = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) && JSON.stringify(value).length <= 64_000 ? structuredClone(value as Record<string, unknown>) : (() => { throw new Error('Share payload is invalid.') })()

export async function createReadOnlyShare(payload: Record<string, unknown>, secret: string, expiresAt: Date): Promise<ReadOnlyShare> {
  if (typeof secret !== 'string' || !secret || secret.length > 8_192 || !Number.isFinite(expiresAt.getTime())) throw new Error('Share signing input is invalid.')
  const unsigned = { scope: 'read-only' as const, expiresAt: expiresAt.toISOString(), payload: safePayload(payload) }
  return { ...unsigned, signature: await sign(signingPayload(unsigned), secret) }
}

export async function verifyReadOnlyShare(value: unknown, secret: string, now = new Date()): Promise<Record<string, unknown>> {
  if (!value || typeof value !== 'object') throw new Error('Share is invalid.')
  const share = value as Partial<ReadOnlyShare>
  if (share.scope !== 'read-only') throw new Error('Share is read-only.')
  if (typeof share.expiresAt !== 'string' || typeof share.signature !== 'string') throw new Error('Share is invalid.')
  const expiration = new Date(share.expiresAt)
  if (!Number.isFinite(expiration.getTime()) || expiration <= now) throw new Error('Share has expired.')
  const payload = safePayload(share.payload)
  const expected = await sign(signingPayload({ scope: 'read-only', expiresAt: share.expiresAt, payload }), secret)
  if (expected !== share.signature) throw new Error('Share signature is invalid.')
  return payload
}
