import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createSeedData } from '../../data/seed-data'
import { translate } from '../../i18n/dictionary'
import type { AssistantTurnControls } from '../useAssistantTurn'
import { CommandPalette } from '../palette/CommandPalette'
import { filterCommands, PALETTE_COMMANDS } from '../palette/commands'
import { paletteModeFor } from '../palette/mode'

const noop = () => undefined
const data = createSeedData()
// Controles inertes: estes testes cobrem o modo comando, não o turno do assistente.
const idleTurn: AssistantTurnControls = { state: { status: 'idle' }, ask: async () => undefined, confirm: async () => undefined, cancelConfirmation: async () => undefined, stop: noop, retry: async () => undefined, useLocalFallback: async () => undefined, dismiss: () => 'close', reset: noop }

describe('paleta', () => {
  it('decide o modo pelo primeiro caractere', () => {
    expect(paletteModeFor('')).toBe('command')
    expect(paletteModeFor('/week')).toBe('command')
    expect(paletteModeFor('  /foco')).toBe('command')
    expect(paletteModeFor('crie uma tarefa: revisar')).toBe('assistant')
  })

  it('filtra comandos pela chave e pelo rótulo traduzido', () => {
    const t = (key: Parameters<typeof translate>[1]) => translate('pt', key)
    expect(filterCommands('/week', t).map((command) => command.key)).toEqual(['/week'])
    expect(filterCommands('agenda', t).map((command) => command.key)).toEqual(['/day', '/week'])
    expect(filterCommands('', t)).toHaveLength(PALETTE_COMMANDS.length)
  })

  it('renderiza o diálogo em modo comando com rótulos do dicionário', () => {
    const markup = renderToStaticMarkup(<CommandPalette onClose={noop} onNavigate={noop} onEvent={noop} turn={idleTurn} />)
    expect(markup).toContain('aria-label="Paleta de comandos"')
    expect(markup).toContain('placeholder="Digite um comando ou pergunte ao Taby"')
    expect(markup).toContain('Abrir agenda da semana')
    expect(markup).toContain('Acompanhar hábitos')
    expect(markup).not.toContain('role="alert"')
  })
})
