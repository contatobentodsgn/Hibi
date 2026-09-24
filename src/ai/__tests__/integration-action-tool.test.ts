import { describe, expect, it } from 'vitest'
import { LocalRepository } from '../../data/local-repository'
import { createSeedData } from '../../data/seed-data'
import { createLocalAssistantRuntime, createLocalToolRegistry } from '../local-runtime'
import { AiToolPolicy } from '../policy'

const repository = () => new LocalRepository(createSeedData())
const bridge = () => {
  const calls: string[] = []
  return {
    calls,
    prepare: async (input: { connectorId: string; kind: string; payload: Record<string, unknown> }) => {
      calls.push(`prepare:${input.connectorId}:${input.kind}:${JSON.stringify(input.payload)}`)
      return { id: 'action-1', connectorId: input.connectorId, kind: input.kind, confirmationId: 'confirm-1' }
    },
    executeApproved: async (input: { actionId: string; confirmationId: string }) => {
      calls.push(`execute:${input.actionId}:${input.confirmationId}`)
      return { ok: true, remoteId: 'remote-9' }
    },
  }
}

describe('integration.send', () => {
  it('não é registrada quando a ponte de ações preparadas não existe', () => {
    expect(createLocalToolRegistry(repository()).has('integration.send')).toBe(false)
  })

  it('exige confirmação por ser uma ação externa', async () => {
    const registry = createLocalToolRegistry(repository(), { integrations: bridge() })
    const outcome = await new AiToolPolicy(registry).decide([{ name: 'integration.send', arguments: { connectorId: 'slack', kind: 'slack.post', payload: { channel: '#geral', text: 'oi' } } }])
    expect(outcome.kind).toBe('confirm')
  })

  it('prepara e executa com o par de identificadores devolvido pelo processo principal', async () => {
    const desktop = bridge()
    const registry = createLocalToolRegistry(repository(), { integrations: desktop })
    const result = await registry.get('integration.send')!.execute({ connectorId: 'slack', kind: 'slack.post', payload: { channel: '#geral', text: 'oi' } }, { nowMs: 0 })

    expect(desktop.calls).toEqual(['prepare:slack:slack.post:{"channel":"#geral","text":"oi"}', 'execute:action-1:confirm-1'])
    expect(result.summary).toBe('Ação enviada para slack: slack.post')
    expect(result.data).toEqual({ connectorId: 'slack', remoteId: 'remote-9' })
  })

  it('falha quando o serviço remoto não aceita a ação', async () => {
    const registry = createLocalToolRegistry(repository(), { integrations: { ...bridge(), executeApproved: async () => ({ ok: false }) } })
    await expect(registry.get('integration.send')!.execute({ connectorId: 'slack', kind: 'slack.post', payload: { text: 'oi' } }, { nowMs: 0 })).rejects.toThrow(/não foi aceita por slack/)
  })

  it('recusa argumentos fora do formato esperado', () => {
    const tool = createLocalToolRegistry(repository(), { integrations: bridge() }).get('integration.send')!
    expect(tool.validate({ connectorId: 'SLACK', kind: 'slack.post', payload: {} })).toBe(false)
    expect(tool.validate({ connectorId: 'slack', kind: '', payload: {} })).toBe(false)
    expect(tool.validate({ connectorId: 'slack', kind: 'slack.post', payload: [] })).toBe(false)
    expect(tool.validate({ connectorId: 'slack', kind: 'slack.post', payload: { text: 'oi' } })).toBe(true)
  })

  it('propõe a ação remota a partir de um pedido explícito e só executa após confirmar', async () => {
    const desktop = bridge()
    const runtime = createLocalAssistantRuntime(repository(), { integrations: desktop })
    const turn = await runtime.runTurn({ message: 'envie no slack #geral: reunião às 10h', surface: 'desktop', requestId: 'req-1', now: new Date('2026-09-09T09:00:00-03:00') })

    expect(turn.confirmation).toBeTruthy()
    expect(turn.confirmation!.calls[0]).toEqual({ name: 'integration.send', arguments: { connectorId: 'slack', kind: 'slack.post', payload: { channel: '#geral', text: 'reunião às 10h' } } })
    expect(desktop.calls).toEqual([])

    const confirmed = await runtime.confirm(turn.confirmation!)
    expect(confirmed.toolResults[0]?.summary).toBe('Ação enviada para slack: slack.post')
    expect(desktop.calls).toEqual(['prepare:slack:slack.post:{"channel":"#geral","text":"reunião às 10h"}', 'execute:action-1:confirm-1'])
  })

  it('não envia nada quando a confirmação é cancelada', async () => {
    const desktop = bridge()
    const runtime = createLocalAssistantRuntime(repository(), { integrations: desktop })
    const turn = await runtime.runTurn({ message: 'envie no slack #geral: reunião às 10h', surface: 'desktop', requestId: 'req-2', now: new Date('2026-09-09T09:00:00-03:00') })

    expect(runtime.cancelConfirmation(turn.confirmation!)).toBe(true)
    await expect(runtime.confirm(turn.confirmation!)).rejects.toThrow()
    expect(desktop.calls).toEqual([])
  })
})
