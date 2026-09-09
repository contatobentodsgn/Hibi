import { describe, expect, it } from 'vitest'
import { createReadOnlyShare, verifyReadOnlyShare } from '../shares'

describe('read-only shares', () => {
  it('creates an expiring signed read-only share that rejects writes and expiry', async () => {
    const share = await createReadOnlyShare({ taskIds: ['task-1'] }, 'local-signing-secret', new Date('2026-09-10T12:00:00.000Z'))

    await expect(verifyReadOnlyShare(share, 'local-signing-secret', new Date('2026-09-10T11:59:00.000Z'))).resolves.toEqual({ taskIds: ['task-1'] })
    await expect(verifyReadOnlyShare({ ...share, scope: 'write' }, 'local-signing-secret', new Date('2026-09-10T11:59:00.000Z'))).rejects.toThrow('read-only')
    await expect(verifyReadOnlyShare(share, 'local-signing-secret', new Date('2026-09-10T12:01:00.000Z'))).rejects.toThrow('expired')
  })
})
