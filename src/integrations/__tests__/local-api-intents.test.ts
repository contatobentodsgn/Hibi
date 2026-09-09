import { describe, expect, it } from 'vitest'
import { localApiTaskMutation } from '../local-api-intents'

describe('local API intents', () => {
  it('creates a bounded local task only after an approved task.create intent', () => {
    expect(localApiTaskMutation({ kind: 'task.create', payload: { title: ' Review API proposal ' } })).toEqual({
      title: 'Review API proposal', durationMinutes: 60, category: 'work', folder: 'Bento', status: 'open',
    })
    expect(localApiTaskMutation({ kind: 'task.create', payload: { title: '' } })).toBeNull()
    expect(localApiTaskMutation({ kind: 'reminder.create', payload: { title: 'Ignore' } })).toBeNull()
  })
})
