import { describe, expect, it } from 'vitest'
import { assistantTurnReducer, dismissIntent, initialAssistantTurnState, provenanceLabel, type AssistantTurnState } from '../assistant-turn'

const confirmation = { id: 'c-1', digest: 'd', calls: [{ name: 'task.create', arguments: { title: 'x' } }], expiresAtMs: 10 }
const started = (): AssistantTurnState => assistantTurnReducer(initialAssistantTurnState, { type: 'turn.started', requestId: 'r-1' })

describe('assistantTurnReducer', () => {
  it('acumula o stream do pedido ativo e ignora pedidos antigos', () => {
    let state = started()
    state = assistantTurnReducer(state, { type: 'stream.started', requestId: 'r-1', provider: 'OpenAI-compatible', model: 'gpt-test' })
    state = assistantTurnReducer(state, { type: 'stream.delta', requestId: 'r-1', delta: 'Olá' })
    state = assistantTurnReducer(state, { type: 'stream.delta', requestId: 'r-0', delta: ' antigo' })
    state = assistantTurnReducer(state, { type: 'stream.usage', requestId: 'r-1', totalTokens: 17 })
    expect(state).toEqual({ status: 'streaming', requestId: 'r-1', text: 'Olá', provenance: { provider: 'OpenAI-compatible', model: 'gpt-test', totalTokens: 17 }, cancelRequested: false })
  })

  it('vai para confirmação e só sai dela por executar ou cancelar', () => {
    let state = assistantTurnReducer(started(), { type: 'turn.confirmation', requestId: 'r-1', confirmation, text: 'Confirme.', provenance: {} })
    expect(state.status).toBe('confirmation')
    expect(assistantTurnReducer(state, { type: 'turn.replied', requestId: 'r-1', text: 'x', provenance: {} })).toBe(state)
    state = assistantTurnReducer(state, { type: 'confirmation.executed', requestId: 'r-1', summary: 'Tarefa criada: x', partialFailure: false })
    expect(state).toEqual({ status: 'executed', requestId: 'r-1', summary: 'Tarefa criada: x', partialFailure: false })
  })

  it('registra falha e cancelamento apenas do pedido ativo', () => {
    const failure = { code: 'rate_limited' as const, retryable: true }
    expect(assistantTurnReducer(started(), { type: 'turn.failed', requestId: 'r-1', message: 'oi', failure })).toEqual({ status: 'failure', requestId: 'r-1', message: 'oi', failure })
    expect(assistantTurnReducer(started(), { type: 'turn.failed', requestId: 'r-9', message: 'oi', failure }).status).toBe('streaming')
    const cancelling = assistantTurnReducer(started(), { type: 'cancel.requested', requestId: 'r-1' })
    expect(cancelling).toMatchObject({ status: 'streaming', cancelRequested: true })
    expect(assistantTurnReducer(cancelling, { type: 'turn.cancelled', requestId: 'r-1', text: 'Cancelado.' })).toEqual({ status: 'cancelled', requestId: 'r-1', text: 'Cancelado.' })
  })

  it('decide o que Esc faz pelo estado', () => {
    expect(dismissIntent(initialAssistantTurnState)).toBe('close')
    expect(dismissIntent(started())).toBe('stop-stream')
    expect(dismissIntent(assistantTurnReducer(started(), { type: 'turn.confirmation', requestId: 'r-1', confirmation, text: 't', provenance: {} }))).toBe('cancel-confirmation')
  })

  it('monta o rótulo de proveniência sem partes vazias', () => {
    expect(provenanceLabel({ provider: 'Pixano local tools', model: 'local-tool-provider' })).toBe('Pixano local tools · local-tool-provider')
    expect(provenanceLabel({ provider: 'OpenAI-compatible', model: 'gpt-test', totalTokens: 17, fallback: true })).toBe('OpenAI-compatible · gpt-test · 17 tokens · local fallback')
    expect(provenanceLabel({})).toBe('')
  })
})
