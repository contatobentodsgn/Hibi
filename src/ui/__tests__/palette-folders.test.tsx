import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { NO_FOLDER } from '../../domain/folders'
import { translate, type DictionaryKey } from '../../i18n/dictionary'
import { countsLabel, filterFolders, folderIntent, previousView, renameOutcome } from '../palette/folder-view'
import { PaletteFolders } from '../palette/PaletteFolders'

const t = (key: DictionaryKey) => translate('pt', key)
const noop = () => undefined
const folders = [{ name: 'Bento', tasks: 8, notes: 0 }, { name: 'Clientes', tasks: 1, notes: 1 }, { name: NO_FOLDER, tasks: 1, notes: 0 }]
const key = (overrides: Partial<{ key: string; shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }> = {}) => ({ key: 'Enter', shiftKey: false, metaKey: false, ctrlKey: false, ...overrides })
const stamp = '2026-09-10T00:00:00.000Z'
const data = {
  tasks: [{ id: 't1', title: 'A', durationMinutes: 30, category: 'work' as const, folder: 'Clientes' }, { id: 't2', title: 'B', durationMinutes: 30, category: 'work' as const, folder: 'Bento' }],
  notes: [{ id: 'n1', title: 'N', content: '', folder: 'Clientes', createdAt: stamp, updatedAt: stamp }],
}

describe('vista de pastas da paleta', () => {
  it('conta no singular e no plural e omite o que é zero', () => {
    expect(countsLabel(8, 0, t)).toBe('8 tarefas')
    expect(countsLabel(1, 1, t)).toBe('1 tarefa · 1 nota')
    expect(countsLabel(0, 2, t)).toBe('2 notas')
  })

  it('filtra pelo nome exibido, inclusive "Sem pasta"', () => {
    expect(filterFolders(folders, 'cli', t).map((folder) => folder.name)).toEqual(['Clientes'])
    expect(filterFolders(folders, 'sem', t).map((folder) => folder.name)).toEqual([NO_FOLDER])
    expect(filterFolders(folders, '  ', t)).toHaveLength(3)
  })

  it('↵ abre Tarefas, ⇧↵ abre Notas e ⌘↵ renomeia — nunca "Sem pasta"', () => {
    expect(folderIntent(key(), folders[1])).toEqual({ type: 'open', route: 'tasks', folder: 'Clientes' })
    expect(folderIntent(key({ shiftKey: true }), folders[1])).toEqual({ type: 'open', route: 'notes', folder: 'Clientes' })
    expect(folderIntent(key({ metaKey: true }), folders[1])).toEqual({ type: 'rename', from: 'Clientes' })
    expect(folderIntent(key({ ctrlKey: true }), folders[1])).toEqual({ type: 'rename', from: 'Clientes' })
    expect(folderIntent(key({ metaKey: true }), folders[2])).toEqual({ type: 'none' })
    expect(folderIntent(key({ key: 'a' }), folders[1])).toEqual({ type: 'none' })
    expect(folderIntent(key(), undefined)).toEqual({ type: 'none' })
  })

  it('aplica renomeação livre, pede confirmação para juntar e recusa com motivo', () => {
    expect(renameOutcome(data, 'Clientes', 'Estúdio')).toEqual({ type: 'apply', from: 'Clientes', to: 'Estúdio' })
    expect(renameOutcome(data, 'Clientes', 'Bento')).toEqual({ type: 'confirm-merge', view: { kind: 'merge', from: 'Clientes', to: 'Bento', tasks: 1, notes: 1 } })
    expect(renameOutcome(data, 'Clientes', '')).toEqual({ type: 'refuse', reason: 'empty' })
  })

  it('cada esc volta um passo: juntar → renomear → pastas → comandos → fechar', () => {
    expect(previousView({ kind: 'merge', from: 'Clientes', to: 'Bento', tasks: 1, notes: 1 })).toEqual({ kind: 'rename', from: 'Clientes', error: null })
    expect(previousView({ kind: 'rename', from: 'Clientes', error: null })).toEqual({ kind: 'folders' })
    expect(previousView({ kind: 'folders' })).toEqual({ kind: 'commands' })
    expect(previousView({ kind: 'commands' })).toBeNull()
  })

  it('renderiza linhas com contagens, a linha de junção e o motivo de recusa', () => {
    const list = renderToStaticMarkup(<PaletteFolders view={{ kind: 'folders' }} folders={folders} selectedIndex={1} notice={null} onHover={noop} onOpen={noop} />)
    expect(list).toContain('>Sem pasta</span>')
    expect(list).toMatch(/data-selected="true"[^>]*data-folder="Clientes"/)
    expect(list).toContain('1 tarefa · 1 nota')

    const merge = renderToStaticMarkup(<PaletteFolders view={{ kind: 'merge', from: 'Clientes', to: 'Bento', tasks: 1, notes: 1 }} folders={folders} selectedIndex={0} notice={null} onHover={noop} onOpen={noop} />)
    expect(merge).toContain('role="alert"')
    expect(merge).toContain('Juntar “Clientes” em “Bento”: 1 tarefa · 1 nota')

    const refused = renderToStaticMarkup(<PaletteFolders view={{ kind: 'rename', from: 'Clientes', error: 'unchanged' }} folders={folders} selectedIndex={0} notice={null} onHover={noop} onOpen={noop} />)
    expect(refused).toContain('Esse já é o nome da pasta.')
  })
})
