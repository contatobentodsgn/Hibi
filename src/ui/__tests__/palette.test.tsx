import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createSeedData } from '../../data/seed-data'
import { translate } from '../../i18n/dictionary'
import type { AssistantTurnState } from '../../ai/assistant-turn'
import type { AssistantTurnControls } from '../useAssistantTurn'
import { CommandPalette } from '../palette/CommandPalette'
import { filterCommands, PALETTE_COMMANDS } from '../palette/commands'
import { paletteModeFor } from '../palette/mode'
import { PaletteTurn } from '../palette/PaletteTurn'

const noop = () => undefined
const data = createSeedData()
// Controles inertes: estes testes cobrem o modo comando, não o turno do assistente.
const idleTurn: AssistantTurnControls = { state: { status: 'idle' }, ask: async () => undefined, confirm: async () => undefined, cancelConfirmation: async () => undefined, stop: noop, retry: async () => undefined, useLocalFallback: async () => undefined, dismiss: () => 'close', reset: noop }

// Fábrica de controles inertes com um status de turno específico — as mesmas chamadas (confirm,
// stop, retry, useLocalFallback) nunca fazem nada de verdade aqui; só o `state` varia por teste.
const turnWith = (state: AssistantTurnState): AssistantTurnControls => ({ state, ask: async () => undefined, confirm: async () => undefined, cancelConfirmation: async () => undefined, stop: noop, retry: async () => undefined, useLocalFallback: async () => undefined, dismiss: () => 'close', reset: noop })

describe('paleta', () => {
  it('decide o modo pelo primeiro caractere', () => {
    expect(paletteModeFor('')).toBe('command')
    expect(paletteModeFor('/week')).toBe('command')
    expect(paletteModeFor('  /foco')).toBe('command')
    expect(paletteModeFor('crie uma tarefa: revisar')).toBe('assistant')
  })

  it('mantém o modo assistente com um turno ativo, mesmo com a query vazia', () => {
    // A regressão do bug crítico: send() limpa a query, e sem o segundo parâmetro o modo caía
    // de volta para 'command' bem quando a confirmação/streaming/resposta está na tela.
    expect(paletteModeFor('', true)).toBe('assistant')
    expect(paletteModeFor('', false)).toBe('command')
  })

  it('deixa "/" vencer mesmo com um turno ativo', () => {
    expect(paletteModeFor('/week', true)).toBe('command')
    expect(paletteModeFor('/', true)).toBe('command')
  })

  it('filtra comandos pela chave e pelo rótulo traduzido', () => {
    const t = (key: Parameters<typeof translate>[1]) => translate('pt', key)
    expect(filterCommands('/week', t).map((command) => command.key)).toEqual(['/week'])
    expect(filterCommands('agenda', t).map((command) => command.key)).toEqual(['/day', '/week'])
    expect(filterCommands('', t)).toHaveLength(PALETTE_COMMANDS.length)
  })

  it('renderiza o diálogo em modo comando com rótulos do dicionário', () => {
    const markup = renderToStaticMarkup(<CommandPalette data={data} onClose={noop} onNavigate={noop} onEvent={noop} onRenameFolder={() => ({ ok: false, reason: 'missing' } as const)} turn={idleTurn} />)
    expect(markup).toContain('aria-label="Paleta de comandos"')
    expect(markup).toContain('placeholder="Digite um comando ou pergunte ao Taby"')
    expect(markup).toContain('Abrir agenda da semana')
    expect(markup).toContain('Acompanhar hábitos')
    expect(markup).not.toContain('role="alert"')
  })

  it('expõe o campo como combobox e os comandos como listbox de opções', () => {
    const markup = renderToStaticMarkup(<CommandPalette data={data} onClose={noop} onNavigate={noop} onEvent={noop} onRenameFolder={() => ({ ok: false, reason: 'missing' } as const)} turn={idleTurn} />)
    expect(markup).toContain('role="combobox"')
    expect(markup).toContain('aria-expanded="true"')
    expect(markup).toContain('aria-controls="palette-commands"')
    expect(markup).toContain('role="listbox"')
    expect(markup).toContain('role="option"')
    expect(markup.match(/aria-selected="true"/g)).toHaveLength(1)
  })

  it('/folder troca a paleta para a vista de pastas em vez de navegar', () => {
    const folder = PALETTE_COMMANDS.find((command) => command.key === '/folder')
    expect(folder && 'action' in folder ? folder.action : null).toBe('folders')
    const markup = renderToStaticMarkup(<CommandPalette data={data} onClose={noop} onNavigate={noop} onEvent={noop} onRenameFolder={() => ({ ok: false, reason: 'missing' } as const)} turn={idleTurn} />)
    expect(markup).toContain('Navegar e renomear pastas')
  })

  it('/break abre o Foco em modo pausa', () => {
    const command = PALETTE_COMMANDS.find((entry) => entry.key === '/break')
    expect(command && 'route' in command ? command.route : null).toBe('break')
  })

  it('/stats abre a página dedicada de estatísticas, e /review continua abrindo a revisão', () => {
    const stats = PALETTE_COMMANDS.find((entry) => entry.key === '/stats')
    expect(stats && 'route' in stats ? stats.route : null).toBe('stats')
    const review = PALETTE_COMMANDS.find((entry) => entry.key === '/review')
    expect(review && 'route' in review ? review.route : null).toBe('review')
  })
})

describe('PaletteTurn', () => {
  it('mostra o cartão de streaming com o botão de parar, sem lista de comandos', () => {
    const state: AssistantTurnState = { status: 'streaming', requestId: 'r1', text: 'Gerando…', provenance: {}, cancelRequested: false }
    const markup = renderToStaticMarkup(<PaletteTurn submitted="crie uma tarefa: revisar briefing" state={state} turn={turnWith(state)} />)
    expect(markup).toContain('role="status"')
    expect(markup).toContain('crie uma tarefa: revisar briefing')
    expect(markup).toContain('Gerando…')
    expect(markup).toContain('Parar')
    expect(markup).not.toContain('command-row')
    expect(markup).not.toContain('/day')
  })

  it('mostra o cartão de confirmação com os botões confirmar/cancelar, sem lista de comandos', () => {
    const state: AssistantTurnState = { status: 'confirmation', requestId: 'r1', confirmation: { id: 'c1', digest: 'd1', calls: [], expiresAtMs: Date.now() + 60_000 }, text: 'Confirme para continuar.', provenance: {} }
    const markup = renderToStaticMarkup(<PaletteTurn submitted="crie uma tarefa: revisar briefing" state={state} turn={turnWith(state)} />)
    expect(markup).toContain('role="alert"')
    expect(markup).toContain('Confirme para continuar.')
    expect(markup).toContain('Confirmar')
    expect(markup).toContain('Cancelar')
    expect(markup).not.toContain('command-row')
  })

  it('mostra o cartão de falha com tentar novamente e assistente local, sem lista de comandos', () => {
    const state: AssistantTurnState = { status: 'failure', requestId: 'r1', message: 'crie uma tarefa', failure: { code: 'unavailable', retryable: true } }
    const markup = renderToStaticMarkup(<PaletteTurn submitted="crie uma tarefa: revisar briefing" state={state} turn={turnWith(state)} />)
    expect(markup).toContain('role="alert"')
    expect(markup).toContain('Provider unavailable')
    expect(markup).toContain('Tentar novamente')
    expect(markup).toContain('Usar assistente local')
    expect(markup).not.toContain('command-row')
  })
})
