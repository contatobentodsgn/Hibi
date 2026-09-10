import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createSeedData } from '../../data/seed-data'
import type { StudyData } from '../../domain/models'
import { NotesView } from '../NotesView'
import { TasksView } from '../TasksView'

const noop = () => undefined
const stamp = '2026-09-10T00:00:00.000Z'
// A seed traz 8 tarefas em "Bento" e nenhuma nota; somamos uma pasta nova e itens sem pasta, mais uma
// pasta só de tarefa ("Só tarefas") e uma só de nota ("Só notas") para exercitar pastas sem itens do
// tipo de uma das telas.
const withFolders = (): StudyData => {
  const data = createSeedData()
  data.tasks.push(
    { id: 'c1', title: 'Cliente A', durationMinutes: 30, category: 'work', folder: 'Clientes' },
    { id: 'u1', title: 'Solta', durationMinutes: 30, category: 'work' },
    { id: 't-only', title: 'Só tarefa', durationMinutes: 30, category: 'work', folder: 'Só tarefas' },
  )
  data.notes.push(
    { id: 'n1', title: 'Briefing', content: 'x', folder: 'Clientes', createdAt: stamp, updatedAt: stamp },
    { id: 'n2', title: 'Rascunho', content: '', createdAt: stamp, updatedAt: stamp },
    { id: 'n-only', title: 'Só nota', content: '', folder: 'Só notas', createdAt: stamp, updatedAt: stamp },
  )
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

  it('um initialFolder sem pasta correspondente cai para "Todas" em vez de lista vazia', () => {
    const markup = renderToStaticMarkup(<TasksView data={withFolders()} onEvent={noop} onTaskStatusChange={noop} initialFolder="Fantasma" />)
    expect(markup).toContain('Kabrito Post 01')
    expect(markup).toMatch(/aria-pressed="true"[^>]*>Pasta · Todas</)
  })

  it('Tarefas mantém ativa uma pasta sem tarefas nesta tela, com chip de contagem 0 e lista vazia', () => {
    const markup = renderToStaticMarkup(<TasksView data={withFolders()} onEvent={noop} onTaskStatusChange={noop} initialFolder="Só notas" />)
    expect(markup).toMatch(/aria-pressed="true"[^>]*>Pasta · Só notas 0</)
    expect(markup).toContain('No tasks match these filters.')
    expect(markup).not.toContain('Kabrito Post 01')
  })

  it('Notas mantém ativa uma pasta sem notas nesta tela, e o formulário de nota nova pré-preenche com ela', () => {
    const markup = renderToStaticMarkup(<NotesView data={withFolders()} onCreate={noop} onUpdate={noop} onDelete={noop} initialFolder="Só tarefas" />)
    expect(markup).toMatch(/aria-pressed="true"[^>]*>Pasta · Só tarefas 0</)
    expect(markup).toMatch(/id="new-note-title-folder"[^>]*value="Só tarefas"/)
    expect(markup).toContain('No notes match this search.')
    expect(markup).not.toContain('Briefing')
  })

  // Sem initialFolder cada tela só oferece chips das pastas do seu próprio tipo — "Só notas" (sem
  // tarefa nenhuma) não pode aparecer em Tarefas, e "Só tarefas" (sem nota nenhuma) não pode aparecer
  // em Notas. Também prova que as pastas reais saem em ordem alfabética, com "Sem pasta" por último.
  it('cada tela só lista chips de pastas do seu próprio tipo, em ordem alfabética com "Sem pasta" por último', () => {
    const tasksMarkup = renderToStaticMarkup(<TasksView data={withFolders()} onEvent={noop} onTaskStatusChange={noop} />)
    expect(tasksMarkup).not.toContain('Pasta · Só notas')

    const notesMarkup = renderToStaticMarkup(<NotesView data={withFolders()} onCreate={noop} onUpdate={noop} onDelete={noop} />)
    expect(notesMarkup).not.toContain('Pasta · Só tarefas')

    const indexOfChip = (markup: string, name: string) => markup.indexOf(`Pasta · ${name} `)
    const tasksOrder = ['Bento', 'Clientes', 'Só tarefas', 'Sem pasta'].map((name) => indexOfChip(tasksMarkup, name))
    expect(tasksOrder.every((index) => index !== -1)).toBe(true)
    expect(tasksOrder).toEqual([...tasksOrder].sort((a, b) => a - b))
  })
})
