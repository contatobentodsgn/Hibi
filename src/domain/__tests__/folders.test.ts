import { describe, expect, it } from 'vitest'
import type { Note, Task } from '../models'
import { FOLDER_NAME_MAX, listFolders, NO_FOLDER, planFolderRename, renameApplied } from '../folders'

const task = (id: string, folder?: string): Task => ({ id, title: id, durationMinutes: 30, category: 'work', ...(folder === undefined ? {} : { folder }) })
const note = (id: string, folder?: string): Note => ({ id, title: id, content: '', createdAt: '2026-09-10T00:00:00.000Z', updatedAt: '2026-09-10T00:00:00.000Z', ...(folder === undefined ? {} : { folder }) })

describe('listFolders', () => {
  it('agrupa pelo nome aparado e conta tarefas e notas separadamente', () => {
    const folders = listFolders({ tasks: [task('t1', 'Bento'), task('t2', ' Bento ')], notes: [note('n1', 'Bento')] })
    expect(folders).toEqual([{ name: 'Bento', tasks: 2, notes: 1 }])
  })

  it('ordena alfabeticamente e deixa "Sem pasta" por último', () => {
    const folders = listFolders({ tasks: [task('t1', 'Clientes'), task('t2'), task('t3', 'Arquivo')], notes: [note('n1', 'Bento'), note('n2', '   ')] })
    expect(folders.map((folder) => folder.name)).toEqual(['Arquivo', 'Bento', 'Clientes', NO_FOLDER])
    expect(folders.at(-1)).toEqual({ name: NO_FOLDER, tasks: 1, notes: 1 })
  })

  it('omite "Sem pasta" quando todo item tem pasta', () => {
    expect(listFolders({ tasks: [task('t1', 'Bento')], notes: [] }).map((folder) => folder.name)).toEqual(['Bento'])
  })

  it('trata maiúsculas como pastas diferentes: nada se junta sem ação explícita', () => {
    const names = listFolders({ tasks: [task('t1', 'Bento'), task('t2', 'bento')], notes: [] }).map((folder) => folder.name)
    expect(names).toHaveLength(2)
    expect(names).toEqual(expect.arrayContaining(['Bento', 'bento']))
  })

  it('agrupa a mesma pasta em NFC e NFD (ex.: colada do macOS) numa única entrada', () => {
    const nfc = 'Estúdio'
    const nfd = nfc.normalize('NFD')
    const folders = listFolders({ tasks: [task('t1', nfd), task('t2', nfc)], notes: [] })
    expect(folders).toEqual([{ name: 'Estúdio', tasks: 2, notes: 0 }])
    expect(folders[0].name).toBe('Estúdio')
  })
})

describe('planFolderRename', () => {
  const data = { tasks: [task('t1', 'Clientes'), task('t2', 'Clientes'), task('t3', 'Bento'), task('t4')], notes: [note('n1', 'Clientes')] }

  it('recusa renomear "Sem pasta", nome vazio, longo demais, igual ou pasta inexistente', () => {
    expect(planFolderRename(data, NO_FOLDER, 'Nova')).toEqual({ ok: false, reason: 'no-folder' })
    expect(planFolderRename(data, 'Clientes', '   ')).toEqual({ ok: false, reason: 'empty' })
    expect(planFolderRename(data, 'Clientes', 'x'.repeat(FOLDER_NAME_MAX + 1))).toEqual({ ok: false, reason: 'too-long' })
    expect(planFolderRename(data, 'Clientes', ' Clientes ')).toEqual({ ok: false, reason: 'unchanged' })
    expect(planFolderRename(data, 'Fantasma', 'Nova')).toEqual({ ok: false, reason: 'missing' })
  })

  it('renomeia para um nome livre sem juntar, com o nome aparado', () => {
    expect(planFolderRename(data, 'Clientes', ' Estúdio ')).toEqual({ ok: true, from: 'Clientes', to: 'Estúdio', tasks: 2, notes: 1, merge: false })
  })

  it('marca como junção quando o nome novo já existe', () => {
    expect(planFolderRename(data, 'Clientes', 'Bento')).toEqual({ ok: true, from: 'Clientes', to: 'Bento', tasks: 2, notes: 1, merge: true })
  })

  it('marca como junção ao normalizar para NFC mesmo quando o nome novo é colado em outra forma Unicode', () => {
    const nfc = 'Estúdio'
    const nfd = nfc.normalize('NFD')
    const withEstudio = { tasks: [...data.tasks, task('t5', nfc)], notes: data.notes }
    expect(planFolderRename(withEstudio, 'Clientes', nfd)).toEqual({ ok: true, from: 'Clientes', to: 'Estúdio', tasks: 2, notes: 1, merge: true })
  })
})

describe('renameApplied', () => {
  it('diz que aplicou quando o plano foi aceito e a junção bate com o esperado', () => {
    expect(renameApplied({ ok: true, from: 'Clientes', to: 'Estúdio', tasks: 2, notes: 1, merge: false }, false)).toBe(true)
    expect(renameApplied({ ok: true, from: 'Clientes', to: 'Bento', tasks: 2, notes: 1, merge: true }, true)).toBe(true)
  })

  it('diz que não aplicou quando o plano foi recusado, ou quando a junção não bate com o esperado', () => {
    expect(renameApplied({ ok: false, reason: 'missing' }, false)).toBe(false)
    expect(renameApplied({ ok: true, from: 'Clientes', to: 'Bento', tasks: 2, notes: 1, merge: true }, false)).toBe(false)
    expect(renameApplied({ ok: true, from: 'Clientes', to: 'Estúdio', tasks: 2, notes: 1, merge: false }, true)).toBe(false)
  })
})
