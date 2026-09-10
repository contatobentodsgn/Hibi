import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createSeedData } from '../../data/seed-data'
import type { StudyData } from '../../domain/models'
import { NotesView } from '../NotesView'
import { TasksView } from '../TasksView'

const noop = () => undefined
const stamp = '2026-09-10T00:00:00.000Z'
// A seed traz 8 tarefas em "Bento" e nenhuma nota; somamos uma pasta nova e itens sem pasta.
const withFolders = (): StudyData => {
  const data = createSeedData()
  data.tasks.push({ id: 'c1', title: 'Cliente A', durationMinutes: 30, category: 'work', folder: 'Clientes' }, { id: 'u1', title: 'Solta', durationMinutes: 30, category: 'work' })
  data.notes.push({ id: 'n1', title: 'Briefing', content: 'x', folder: 'Clientes', createdAt: stamp, updatedAt: stamp }, { id: 'n2', title: 'Rascunho', content: '', createdAt: stamp, updatedAt: stamp })
  return data
}

describe('filtros de pasta', () => {
  it('Tarefas mostra uma opção por pasta real, com contagem, e "Sem pasta"', () => {
    const markup = renderToStaticMarkup(<TasksView data={withFolders()} onEvent={noop} onTaskStatusChange={noop} />)
    expect(markup).toContain('Pasta · Todas')
    expect(markup).toContain('Pasta · Bento 8')
    expect(markup).toContain('Pasta · Clientes 1')
    expect(markup).toContain('Pasta · Sem pasta 1')
    expect(markup).not.toContain('Folder · Bento')
    expect(markup).not.toContain('Unfiled')
  })

  it('aplica o filtro inicial vindo da navegação', () => {
    const markup = renderToStaticMarkup(<TasksView data={withFolders()} onEvent={noop} onTaskStatusChange={noop} initialFolder="Clientes" />)
    expect(markup).toContain('Cliente A')
    expect(markup).not.toContain('Kabrito Post 01')
    expect(markup).toMatch(/aria-pressed="true"[^>]*>Pasta · Clientes 1</)
  })

  it('Notas filtra por pasta e mostra a nota sem pasta como "Sem pasta"', () => {
    const markup = renderToStaticMarkup(<NotesView data={withFolders()} onCreate={noop} onUpdate={noop} onDelete={noop} />)
    expect(markup).toContain('Pasta · Clientes 1')
    expect(markup).toContain('Pasta · Sem pasta 1')
    expect(markup).toContain('Sem conteúdo · Sem pasta')
    expect(markup).not.toContain('Folder · Bento')
  })

  it('o formulário de nota nova usa a pasta do filtro ativo e sugere as pastas existentes', () => {
    const markup = renderToStaticMarkup(<NotesView data={withFolders()} onCreate={noop} onUpdate={noop} onDelete={noop} initialFolder="Clientes" />)
    expect(markup).toMatch(/id="new-note-title-folder"[^>]*value="Clientes"/)
    expect(markup).toContain('<option value="Bento">')
    expect(markup).toContain('<option value="Clientes">')
  })
})
