# `/folder` e `/break` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar `/folder` (pastas reais, navegáveis e renomeáveis pela paleta) e `/break` (pausa de verdade no Foco, com eventos próprios).

**Architecture:** Pastas continuam sendo o campo `folder` de tarefas e notas; um módulo puro deriva a lista e planeja renomeações, e o repositório só aplica. A paleta `⌘K` ganha uma vista de pastas; Tarefas e Notas passam a filtrar por todas as pastas e aceitam um filtro inicial vindo da navegação. `/break` é uma rota que abre o Foco em modo pausa.

**Tech Stack:** React 19, TypeScript 7, Vitest 5 (ambiente node, sem DOM — testes de componente usam `renderToStaticMarkup`), Playwright 1.63.

**Spec:** `docs/superpowers/specs/2026-09-10-folders-and-break-design.md`

---

## Antes de começar

- Worktree: `.worktrees/folders-break`, branch `feat/folders-break`. Dependências já instaladas.
- **Use `rtk proxy` para rodar testes.** O hook do shell cacheia a saída de `npx vitest` e `npx playwright`; sem `rtk proxy` você pode ler um resultado antigo.
- Gate de cada tarefa: `rtk proxy npm test`, `npx tsc --noEmit`, e o Playwright indicado na tarefa.
- Convenção de texto: strings novas passam por `src/i18n/dictionary.ts`. O objeto `pt` é a fonte (`as const`) e `en` é `Record<DictionaryKey, string>` — **uma chave em `pt` sem par em `en` quebra o `tsc`**.
- Estilo: `src/domain` e `src/ui/palette` usam sem ponto e vírgula; `src/data/local-repository.ts`, `src/App.tsx` e as telas antigas usam ponto e vírgula. Siga o arquivo que você está editando.

## Mapa de arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `src/domain/folders.ts` (novo) | Derivar pastas, contar itens, planejar renomeação |
| `src/domain/__tests__/folders.test.ts` (novo) | Regras de pastas |
| `src/data/local-repository.ts` | `renameFolder(from, to)` |
| `src/i18n/dictionary.ts` | Textos de pastas, pausa e comandos novos |
| `src/ui/shell/routes.ts` | Rota `break` agrupada em Foco |
| `src/ui/palette/commands.ts` | `/folder` com ação, `/break` com rota |
| `src/ui/palette/PaletteFolders.tsx` (novo) | Lista e renomeação de pastas dentro da paleta |
| `src/ui/palette/CommandPalette.tsx` | Vistas comandos/pastas/renomear/juntar |
| `src/ui/palette/palette.css` | Estilo das linhas de pasta |
| `src/ui/TasksView.tsx`, `src/ui/NotesView.tsx` | Filtros derivados e `initialFolder` |
| `src/ui/TaskCreateModal.tsx` | Sugestões de pasta |
| `src/ui/FocusView.tsx` | Modos foco e pausa |
| `src/ui/HelpView.tsx` | `/break` na Ajuda |
| `src/App.tsx` | Navegação com filtro, renomear, rotas `focus`/`break` |
| `tests/e2e/folders-break.spec.ts` (novo) | Fluxos reais de pastas e pausa |

---

### Task 1: Regras de pastas no domínio e no repositório

**Files:**
- Create: `src/domain/folders.ts`
- Create: `src/domain/__tests__/folders.test.ts`
- Modify: `src/data/local-repository.ts` (depois de `deleteTask`, linha ~100)
- Test: `src/data/__tests__/local-repository.test.ts`

- [ ] **Step 1: Write the failing domain tests**

Create `src/domain/__tests__/folders.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Note, Task } from '../models'
import { FOLDER_NAME_MAX, listFolders, NO_FOLDER, planFolderRename } from '../folders'

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
})
```

- [ ] **Step 2: Run the domain tests to verify they fail**

Run: `rtk proxy npx vitest run src/domain/__tests__/folders.test.ts`
Expected: FAIL — `Failed to resolve import "../folders"`.

- [ ] **Step 3: Implement the domain module**

Create `src/domain/folders.ts`:

```ts
import type { Note, StudyData, Task } from './models'

// Pastas não são uma entidade: existem enquanto algum item as usa. `NO_FOLDER` agrupa os itens sem
// pasta; como todo nome real é não vazio depois de aparado, a chave vazia nunca colide com uma pasta.
export const NO_FOLDER = ''
export const FOLDER_NAME_MAX = 120

export type FolderSummary = Readonly<{ name: string; tasks: number; notes: number }>
export type FolderRenameRefusal = 'empty' | 'unchanged' | 'too-long' | 'no-folder' | 'missing'
export type FolderRenamePlan =
  | Readonly<{ ok: true; from: string; to: string; tasks: number; notes: number; merge: boolean }>
  | Readonly<{ ok: false; reason: FolderRenameRefusal }>

type FolderSource = Pick<StudyData, 'tasks' | 'notes'>

export const folderOf = (item: Pick<Task, 'folder'> | Pick<Note, 'folder'>): string => item.folder?.trim() ?? NO_FOLDER

export function listFolders(data: FolderSource): FolderSummary[] {
  const counts = new Map<string, { tasks: number; notes: number }>()
  const entry = (name: string) => {
    const current = counts.get(name) ?? { tasks: 0, notes: 0 }
    counts.set(name, current)
    return current
  }
  for (const task of data.tasks) entry(folderOf(task)).tasks += 1
  for (const note of data.notes) entry(folderOf(note)).notes += 1
  const named = [...counts]
    .filter(([name]) => name !== NO_FOLDER)
    .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
    .map(([name, count]) => ({ name, ...count }))
  const none = counts.get(NO_FOLDER)
  return none ? [...named, { name: NO_FOLDER, ...none }] : named
}

// Calcula o efeito antes de aplicar, para a interface avisar sobre uma junção — que não se desfaz.
export function planFolderRename(data: FolderSource, from: string, to: string): FolderRenamePlan {
  if (from === NO_FOLDER) return { ok: false, reason: 'no-folder' }
  const target = to.trim()
  if (!target) return { ok: false, reason: 'empty' }
  if (target.length > FOLDER_NAME_MAX) return { ok: false, reason: 'too-long' }
  if (target === from) return { ok: false, reason: 'unchanged' }
  const folders = listFolders(data)
  const source = folders.find((folder) => folder.name === from)
  if (!source) return { ok: false, reason: 'missing' }
  return { ok: true, from, to: target, tasks: source.tasks, notes: source.notes, merge: folders.some((folder) => folder.name === target) }
}
```

- [ ] **Step 4: Run the domain tests to verify they pass**

Run: `rtk proxy npx vitest run src/domain/__tests__/folders.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Write the failing repository test**

In `src/data/__tests__/local-repository.test.ts`, add inside `describe('LocalRepository', ...)`, after the existing `it` blocks:

```ts
  it('renomeia uma pasta só nos itens dela e devolve as contagens', () => {
    repository.createTask({ title: 'Cliente A', durationMinutes: 30, category: 'work', folder: 'Clientes' });
    repository.createNote({ title: 'Briefing', content: '', folder: ' Clientes ', createdAt: '2026-09-10T00:00:00.000Z', updatedAt: '2026-09-10T00:00:00.000Z' });

    expect(repository.renameFolder('Clientes', ' Estúdio ')).toEqual({ tasks: 1, notes: 1 });

    const data = repository.snapshot();
    expect(data.tasks.filter((task) => task.folder === 'Estúdio')).toHaveLength(1);
    expect(data.notes.map((note) => note.folder)).toEqual(['Estúdio']);
    expect(data.tasks.filter((task) => task.folder === 'Bento')).toHaveLength(8);
  });
```

- [ ] **Step 6: Run it to verify it fails**

Run: `rtk proxy npx vitest run src/data/__tests__/local-repository.test.ts`
Expected: FAIL — `repository.renameFolder is not a function`.

- [ ] **Step 7: Implement `renameFolder`**

In `src/data/local-repository.ts`, add right after the `deleteTask(id: string): void { ... }` line:

```ts
  // Aplica uma renomeação já validada por planFolderRename: só itens daquela pasta são tocados.
  renameFolder(from: string, to: string): { tasks: number; notes: number } {
    const target = to.trim();
    let tasks = 0;
    let notes = 0;
    for (const task of this.data.tasks) if (task.folder?.trim() === from) { this.updateTask(task.id, { folder: target }); tasks += 1; }
    for (const note of this.data.notes) if (note.folder?.trim() === from) { this.updateNote(note.id, { folder: target, updatedAt: this.now() }); notes += 1; }
    return { tasks, notes };
  }
```

- [ ] **Step 8: Run the repository and domain tests**

Run: `rtk proxy npx vitest run src/data/__tests__/local-repository.test.ts src/domain/__tests__/folders.test.ts`
Expected: PASS.

- [ ] **Step 9: Typecheck and commit**

Run: `npx tsc --noEmit` — Expected: no errors.

```bash
git add src/domain/folders.ts src/domain/__tests__/folders.test.ts src/data/local-repository.ts src/data/__tests__/local-repository.test.ts
git commit -m "feat: derive folders and plan renames from existing items"
```

---

### Task 2: Filtros de pasta em Tarefas e Notas, com filtro inicial

**Files:**
- Modify: `src/i18n/dictionary.ts`
- Modify: `src/ui/TasksView.tsx`
- Replace: `src/ui/NotesView.tsx`
- Modify: `src/ui/TaskCreateModal.tsx`
- Modify: `src/App.tsx`
- Create: `src/ui/__tests__/folder-filters.test.tsx`
- Modify: `tests/e2e/smoke.spec.ts` (teste "filtro Bento funciona em Tasks e Notes")

- [ ] **Step 1: Add the folder filter strings**

In `src/i18n/dictionary.ts`, inside `pt`, after `'command.hardware': 'Inspecionar superfícies de hardware',` add:

```ts

  'folders.label': 'Pasta',
  'folders.all': 'Todas',
  'folders.none': 'Sem pasta',
```

Inside `en`, after `'command.hardware': 'Inspect hardware surfaces',` add:

```ts

  'folders.label': 'Folder',
  'folders.all': 'All',
  'folders.none': 'No folder',
```

- [ ] **Step 2: Write the failing markup tests**

Create `src/ui/__tests__/folder-filters.test.tsx`:

```tsx
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
```

- [ ] **Step 3: Run it to verify it fails**

Run: `rtk proxy npx vitest run src/ui/__tests__/folder-filters.test.tsx`
Expected: FAIL — markup still contains `Folder · Bento`, and `initialFolder` is not a prop.

- [ ] **Step 4: Update `TasksView`**

In `src/ui/TasksView.tsx`, make these edits.

After `import type { EntityStatus, StudyData } from '../domain/models';` add:

```ts
import { folderOf, listFolders } from '../domain/folders';
import { useT } from '../i18n/LocaleProvider';
```

In `type Props`, after `onEditTaskDeadline?: (id: string) => void;` add:

```ts
  // Filtro de pasta pedido pela navegação (ex.: /folder). `null` mostra todas; '' é "Sem pasta".
  initialFolder?: string | null;
```

Replace:

```ts
export function TasksView({ data, onEvent, onTaskStatusChange, onCreateTask, onRenameTask, onDeleteTask, onEditTaskDeadline }: Props) {
  const [folder, setFolder] = useState<string | null>(null);
```

with:

```ts
export function TasksView({ data, onEvent, onTaskStatusChange, onCreateTask, onRenameTask, onDeleteTask, onEditTaskDeadline, initialFolder = null }: Props) {
  const t = useT();
  const [folder, setFolder] = useState<string | null>(initialFolder);
```

Replace `(!folder || (task.folder ?? 'Unfiled') === folder)` with `(folder === null || folderOf(task) === folder)`.

Right after the `const openTasks = ...` line add:

```ts
  const taskFolders = listFolders({ tasks: data.tasks, notes: [] });
```

Replace the fixed button:

```tsx
<button className={`filter ${folder === 'Bento' ? 'active' : ''}`} onClick={() => setFolder(folder === 'Bento' ? null : 'Bento')}>Folder · Bento</button>
```

with:

```tsx
<button className={`filter ${folder === null ? 'active' : ''}`} aria-pressed={folder === null} onClick={() => setFolder(null)}>{`${t('folders.label')} · ${t('folders.all')}`}</button>{taskFolders.map((entry) => <button key={`folder-${entry.name}`} className={`filter ${folder === entry.name ? 'active' : ''}`} aria-pressed={folder === entry.name} onClick={() => { setFolder(folder === entry.name ? null : entry.name); onEvent('filter', `Tasks · Folder · ${entry.name || 'none'}`); }}>{`${t('folders.label')} · ${entry.name || t('folders.none')} ${entry.tasks}`}</button>)}
```

Replace `{task.folder ?? 'Unfiled'}` with `{folderOf(task) || t('folders.none')}`.

- [ ] **Step 5: Replace `NotesView`**

Replace the whole content of `src/ui/NotesView.tsx` with:

```tsx
import React, { useMemo, useState } from 'react';
import { folderOf, listFolders, NO_FOLDER } from '../domain/folders';
import type { Note, StudyData } from '../domain/models';
import { useT } from '../i18n/LocaleProvider';

type Props = { data: StudyData; onCreate: (title: string, content: string, folder: string) => void; onUpdate: (id: string, changes: Partial<Omit<Note, 'id'>>) => void; onDelete: (id: string) => void; initialFolder?: string | null };
type Editor = { id?: string; title: string; content: string; folder: string };

// A pasta volta aparada e pode vir vazia: quem cria decide o padrão, quem edita decide "Sem pasta".
function NoteForm({ editor, folders, onCancel, onSubmit, titleId }: { editor: Editor; folders: readonly string[]; onCancel?: () => void; onSubmit: (title: string, content: string, folder: string) => void; titleId: string }) {
  const [title, setTitle] = useState(editor.title);
  const [content, setContent] = useState(editor.content);
  const [folder, setFolder] = useState(editor.folder);
  return <form className="settings-card" aria-label={editor.id ? 'Edit note' : 'Create note'} onSubmit={(event) => { event.preventDefault(); if (title.trim()) onSubmit(title.trim(), content, folder.trim()); }}><label htmlFor={titleId}>Title</label><input id={titleId} className="search-input" value={title} onChange={(event) => setTitle(event.target.value)} required /><label htmlFor={`${titleId}-content`}>Content</label><textarea id={`${titleId}-content`} className="search-input" value={content} onChange={(event) => setContent(event.target.value)} rows={5} /><label htmlFor={`${titleId}-folder`}>Folder</label><input id={`${titleId}-folder`} className="search-input" list={`${titleId}-folders`} value={folder} onChange={(event) => setFolder(event.target.value)} /><datalist id={`${titleId}-folders`}>{folders.map((name) => <option key={name} value={name} />)}</datalist><div className="heading-actions"><button className="primary" type="submit">{editor.id ? 'Save note' : 'Add note'}</button>{onCancel && <button className="outline" type="button" onClick={onCancel}>Cancel</button>}</div></form>;
}

export function NotesView({ data, onCreate, onUpdate, onDelete, initialFolder = null }: Props) {
  const t = useT();
  const [query, setQuery] = useState(''); const [folder, setFolder] = useState<string | null>(initialFolder); const [editor, setEditor] = useState<Editor | null>(null); const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);
  const noteFolders = listFolders({ tasks: [], notes: data.notes });
  const suggestions = listFolders(data).map((entry) => entry.name).filter((name) => name !== NO_FOLDER);
  const defaultFolder = folder !== null && folder !== NO_FOLDER ? folder : 'Bento';
  const notes = useMemo(() => data.notes.filter((note) => (folder === null || folderOf(note) === folder) && `${note.title} ${note.content}`.toLowerCase().includes(query.toLowerCase())), [data.notes, query, folder]);
  return <div className="view"><div className="view-heading"><div><p className="eyebrow">CAPTURE LAYER</p><h1>Notes</h1><p className="muted">{data.notes.length} local notes · searchable</p></div><button className="primary" onClick={() => setEditor({ title: '', content: '', folder: defaultFolder })}>+ New note</button></div><NoteForm key={`new-note-${defaultFolder}`} editor={{ title: '', content: '', folder: defaultFolder }} folders={suggestions} titleId="new-note-title" onSubmit={(title, content, nextFolder) => onCreate(title, content, nextFolder || 'Bento')} /><input className="search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notes" aria-label="Search notes" /><div className="filter-row"><button className={`filter ${folder === null ? 'active' : ''}`} aria-pressed={folder === null} onClick={() => setFolder(null)}>{`${t('folders.label')} · ${t('folders.all')}`}</button>{noteFolders.map((entry) => <button key={`folder-${entry.name}`} className={`filter ${folder === entry.name ? 'active' : ''}`} aria-pressed={folder === entry.name} onClick={() => setFolder(folder === entry.name ? null : entry.name)}>{`${t('folders.label')} · ${entry.name || t('folders.none')} ${entry.notes}`}</button>)}</div><section className="list-card">{notes.map((note) => <div className="task-row" key={note.id}><div><strong>{note.title}</strong><span>{note.content || 'Sem conteúdo'} · {folderOf(note) || t('folders.none')}</span></div><button className="icon-button" aria-label={`Edit ${note.title}`} onClick={() => setEditor({ id: note.id, title: note.title, content: note.content, folder: folderOf(note) })}>✎</button><button className="icon-button" aria-label={`Delete ${note.title}`} onClick={() => setPendingDelete({ id: note.id, title: note.title })}>×</button></div>)}{!notes.length && <p className="empty">No notes match this search.</p>}</section>{editor?.id && <div className="overlay" onMouseDown={() => setEditor(null)}><section className="palette" role="dialog" aria-modal="true" aria-labelledby="edit-note-title" onMouseDown={(event) => event.stopPropagation()}><h2 id="edit-note-title">Edit note</h2><NoteForm editor={editor} folders={suggestions} titleId="edit-note-title-input" onCancel={() => setEditor(null)} onSubmit={(title, content, nextFolder) => { onUpdate(editor.id!, { title, content, folder: nextFolder || undefined, updatedAt: new Date().toISOString() }); setEditor(null); }} /></section></div>}{pendingDelete && <DeleteConfirmation title={pendingDelete.title} onCancel={() => setPendingDelete(null)} onConfirm={() => { onDelete(pendingDelete.id); setPendingDelete(null); }} />}</div>;
}

function DeleteConfirmation({ title, onCancel, onConfirm }: { title: string; onCancel: () => void; onConfirm: () => void }) { return <div className="overlay"><section className="palette" role="dialog" aria-modal="true" aria-labelledby="delete-confirm-title"><h2 id="delete-confirm-title">Delete {title}?</h2><p>This action cannot be undone.</p><button className="outline" type="button" onClick={onCancel} autoFocus>Cancel</button><button className="primary" type="button" onClick={onConfirm}>Confirm delete</button></section></div>; }
```

The "Sem conteúdo · Sem pasta" line is built from separate JSX expressions; if the markup test in Step 2 fails only on that assertion because React inserts `<!-- -->` between text nodes, change that `<span>` to a single template literal: ``<span>{`${note.content || 'Sem conteúdo'} · ${folderOf(note) || t('folders.none')}`}</span>``.

- [ ] **Step 6: Suggest folders when creating a task**

In `src/ui/TaskCreateModal.tsx`:

Replace `type Props = { onClose: () => void; onSubmit: (task: NewTaskForm) => void };` with:

```ts
type Props = { onClose: () => void; onSubmit: (task: NewTaskForm) => void; folders?: readonly string[] };
```

Replace `export function TaskCreateModal({ onClose, onSubmit }: Props) {` with `export function TaskCreateModal({ onClose, onSubmit, folders = [] }: Props) {`.

Replace:

```tsx
          <label style={{ display: 'grid', gap: 7 }}>Folder<input value={folder} onChange={(event) => setFolder(event.target.value)} placeholder="Bento" /></label>
```

with:

```tsx
          <label style={{ display: 'grid', gap: 7 }}>Folder<input value={folder} list="task-create-folders" onChange={(event) => setFolder(event.target.value)} placeholder="Bento" /></label>
          <datalist id="task-create-folders">{folders.map((name) => <option key={name} value={name} />)}</datalist>
```

- [ ] **Step 7: Wire navigation with a folder filter in `App`**

In `src/App.tsx`:

After `import { applyNotionMutations, type NotionLocalMutation } from './integrations/notion-apply';` add:

```ts
import { listFolders, NO_FOLDER } from './domain/folders';
```

After `const [route, setRoute] = useState<NavKey>('home');` add:

```ts
  // Filtro de pasta pedido junto com a navegação. O `nonce` muda a cada navegação e vira `key` das
  // telas, então o filtro pedido é reaplicado mesmo quando se volta à mesma tela.
  const [folderFilter, setFolderFilter] = useState<{ folder: string | null; nonce: number }>({ folder: null, nonce: 0 });
```

Replace:

```ts
  const navigate = (next: NavKey, source = 'navigation') => {
    setRoute(next);
    log(source, `Opened ${next}`);
  };
```

with:

```ts
  const navigate = (next: NavKey, source = 'navigation', options: { folder?: string } = {}) => {
    setFolderFilter((current) => ({ folder: options.folder ?? null, nonce: current.nonce + 1 }));
    setRoute(next);
    log(source, options.folder === undefined ? `Opened ${next}` : `Opened ${next} · folder`);
  };
```

Replace the `createNote` line with:

```ts
  const createNote = (title: string, content: string, folder: string) => { repository.createNote({ title, content, folder, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); refreshData(); log('create', title); };
```

In the `tasks` case, change `<TasksView {...props} data={data}` to `<TasksView key={`tasks-${folderFilter.nonce}`} {...props} data={data} initialFolder={folderFilter.folder}`.

Replace the `notes` case with:

```tsx
      case 'notes': return <NotesView key={`notes-${folderFilter.nonce}`} data={data} initialFolder={folderFilter.folder} onCreate={createNote} onUpdate={updateNote} onDelete={deleteNote} />;
```

Add `folderFilter` to the `useMemo` dependency array of `content`: `[route, events, aiHistory, aiFallbackPolicy, aiUsage, data, assistantTurn.state, folderFilter]`.

Change `<TaskCreateModal onClose={() => setTaskCreateOpen(false)} onSubmit={createTask} />` to:

```tsx
<TaskCreateModal onClose={() => setTaskCreateOpen(false)} onSubmit={createTask} folders={listFolders(data).map((entry) => entry.name).filter((name) => name !== NO_FOLDER)} />
```

- [ ] **Step 8: Run the markup tests**

Run: `rtk proxy npx vitest run src/ui/__tests__/folder-filters.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 9: Update the smoke test that clicked the fixed filter**

In `tests/e2e/smoke.spec.ts`, replace the test `filtro Bento funciona em Tasks e Notes` with:

```ts
test('filtro de pasta funciona em Tarefas e Notas', async ({ page }) => {
  await page.goto('/');
  await go(page, 'Tarefas');
  await page.getByRole('button', { name: 'Pasta · Bento 8' }).click();
  await expect(page.getByText('Kabrito Post 01')).toBeVisible();
  await goMore(page, 'Notas');
  await expect(page.getByRole('button', { name: 'Pasta · Todas' })).toBeVisible();
});
```

- [ ] **Step 10: Gate and commit**

Run: `rtk proxy npm test` — Expected: all green.
Run: `npx tsc --noEmit` — Expected: no errors.
Run: `rtk proxy npx playwright test tests/e2e/smoke.spec.ts` — Expected: all green.

```bash
git add src/i18n/dictionary.ts src/ui/TasksView.tsx src/ui/NotesView.tsx src/ui/TaskCreateModal.tsx src/App.tsx src/ui/__tests__/folder-filters.test.tsx tests/e2e/smoke.spec.ts
git commit -m "feat: filter tasks and notes by every real folder"
```

---

### Task 3: Vista de pastas da paleta — lógica pura e componente

**Files:**
- Modify: `src/i18n/dictionary.ts`
- Create: `src/ui/palette/folder-view.ts`
- Create: `src/ui/palette/PaletteFolders.tsx`
- Modify: `src/ui/palette/palette.css`
- Create: `src/ui/__tests__/palette-folders.test.tsx`

Esta tarefa não liga nada à paleta ainda: entrega as peças testáveis. A Task 4 as conecta.

- [ ] **Step 1: Add the palette folder strings**

In `src/i18n/dictionary.ts`, inside `pt`, right after `'folders.none': 'Sem pasta',` (added in Task 2) add:

```ts
  'command.folder': 'Navegar e renomear pastas',
  'folders.placeholder': 'Filtrar pastas',
  'folders.renamePlaceholder': 'Novo nome da pasta',
  'folders.empty': 'Nenhuma pasta encontrada.',
  'folders.task': 'tarefa',
  'folders.tasks': 'tarefas',
  'folders.note': 'nota',
  'folders.notes': 'notas',
  'folders.rename': 'Renomear',
  'folders.merge': 'Juntar',
  'folders.into': 'em',
  'folders.renamed': 'Pasta renomeada.',
  'folders.reason.empty': 'O nome não pode ficar vazio.',
  'folders.reason.unchanged': 'Esse já é o nome da pasta.',
  'folders.reason.too-long': 'Use até 120 caracteres.',
  'folders.reason.no-folder': '“Sem pasta” não pode ser renomeada.',
  'folders.reason.missing': 'Essa pasta não existe mais.',
  'folders.footer.tasks': '↵ tarefas',
  'folders.footer.notes': '⇧↵ notas',
  'folders.footer.rename': '⌘↵ renomear',
  'folders.footer.back': 'esc voltar',
  'folders.footer.apply': '↵ renomear',
  'folders.footer.merge': '↵ juntar',
```

Inside `en`, right after `'folders.none': 'No folder',` add:

```ts
  'command.folder': 'Browse and rename folders',
  'folders.placeholder': 'Filter folders',
  'folders.renamePlaceholder': 'New folder name',
  'folders.empty': 'No folder found.',
  'folders.task': 'task',
  'folders.tasks': 'tasks',
  'folders.note': 'note',
  'folders.notes': 'notes',
  'folders.rename': 'Rename',
  'folders.merge': 'Merge',
  'folders.into': 'into',
  'folders.renamed': 'Folder renamed.',
  'folders.reason.empty': 'The name cannot be empty.',
  'folders.reason.unchanged': 'That is already the folder name.',
  'folders.reason.too-long': 'Use up to 120 characters.',
  'folders.reason.no-folder': '“No folder” cannot be renamed.',
  'folders.reason.missing': 'That folder no longer exists.',
  'folders.footer.tasks': '↵ tasks',
  'folders.footer.notes': '⇧↵ notes',
  'folders.footer.rename': '⌘↵ rename',
  'folders.footer.back': 'esc back',
  'folders.footer.apply': '↵ rename',
  'folders.footer.merge': '↵ merge',
```

- [ ] **Step 2: Write the failing tests**

Create `src/ui/__tests__/palette-folders.test.tsx`:

```tsx
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
```

- [ ] **Step 3: Run it to verify it fails**

Run: `rtk proxy npx vitest run src/ui/__tests__/palette-folders.test.tsx`
Expected: FAIL — `Failed to resolve import "../palette/folder-view"`.

- [ ] **Step 4: Implement the pure helpers**

Create `src/ui/palette/folder-view.ts`:

```ts
import { NO_FOLDER, planFolderRename, type FolderRenameRefusal, type FolderSummary } from '../../domain/folders'
import type { StudyData } from '../../domain/models'
import type { DictionaryKey } from '../../i18n/dictionary'

type Translate = (key: DictionaryKey) => string

// As vistas da paleta além da lista de comandos. Cada `esc` volta um passo:
// juntar → renomear → pastas → comandos; em comandos, `esc` fecha como antes.
export type PaletteView =
  | Readonly<{ kind: 'commands' }>
  | Readonly<{ kind: 'folders' }>
  | Readonly<{ kind: 'rename'; from: string; error: FolderRenameRefusal | null }>
  | Readonly<{ kind: 'merge'; from: string; to: string; tasks: number; notes: number }>

export const previousView = (view: PaletteView): PaletteView | null =>
  view.kind === 'merge' ? { kind: 'rename', from: view.from, error: null }
    : view.kind === 'rename' ? { kind: 'folders' }
      : view.kind === 'folders' ? { kind: 'commands' }
        : null

export const reasonKey: Record<FolderRenameRefusal, DictionaryKey> = {
  empty: 'folders.reason.empty',
  unchanged: 'folders.reason.unchanged',
  'too-long': 'folders.reason.too-long',
  'no-folder': 'folders.reason.no-folder',
  missing: 'folders.reason.missing',
}

export const folderLabel = (name: string, t: Translate) => name === NO_FOLDER ? t('folders.none') : name

export const countsLabel = (tasks: number, notes: number, t: Translate) => [
  tasks > 0 ? `${tasks} ${t(tasks === 1 ? 'folders.task' : 'folders.tasks')}` : '',
  notes > 0 ? `${notes} ${t(notes === 1 ? 'folders.note' : 'folders.notes')}` : '',
].filter(Boolean).join(' · ')

export const filterFolders = (folders: readonly FolderSummary[], query: string, t: Translate) => {
  const needle = query.trim().toLowerCase()
  return folders.filter((folder) => folderLabel(folder.name, t).toLowerCase().includes(needle))
}

export type FolderKey = Readonly<{ key: string; shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }>
export type FolderIntent =
  | Readonly<{ type: 'open'; route: 'tasks' | 'notes'; folder: string }>
  | Readonly<{ type: 'rename'; from: string }>
  | Readonly<{ type: 'none' }>

// ↵ abre Tarefas, ⇧↵ abre Notas, ⌘↵ (ou Ctrl+↵) renomeia. "Sem pasta" não é uma pasta de verdade.
export function folderIntent(event: FolderKey, selected: FolderSummary | undefined): FolderIntent {
  if (event.key !== 'Enter' || !selected) return { type: 'none' }
  if (event.metaKey || event.ctrlKey) return selected.name === NO_FOLDER ? { type: 'none' } : { type: 'rename', from: selected.name }
  return { type: 'open', route: event.shiftKey ? 'notes' : 'tasks', folder: selected.name }
}

export type RenameOutcome =
  | Readonly<{ type: 'apply'; from: string; to: string }>
  | Readonly<{ type: 'confirm-merge'; view: Extract<PaletteView, { kind: 'merge' }> }>
  | Readonly<{ type: 'refuse'; reason: FolderRenameRefusal }>

// Renomear para um nome livre aplica na hora — desfaz-se renomeando de volta. Juntar não se desfaz,
// então pede um segundo ↵ com a contagem do que vai mudar.
export function renameOutcome(data: Pick<StudyData, 'tasks' | 'notes'>, from: string, to: string): RenameOutcome {
  const plan = planFolderRename(data, from, to)
  if (!plan.ok) return { type: 'refuse', reason: plan.reason }
  if (plan.merge) return { type: 'confirm-merge', view: { kind: 'merge', from: plan.from, to: plan.to, tasks: plan.tasks, notes: plan.notes } }
  return { type: 'apply', from: plan.from, to: plan.to }
}
```

- [ ] **Step 5: Implement the component**

Create `src/ui/palette/PaletteFolders.tsx`:

```tsx
import React from 'react'
import type { FolderSummary } from '../../domain/folders'
import { useT } from '../../i18n/LocaleProvider'
import { countsLabel, folderLabel, reasonKey, type PaletteView } from './folder-view'

type Props = Readonly<{
  view: Exclude<PaletteView, { kind: 'commands' }>
  folders: readonly FolderSummary[]
  selectedIndex: number
  notice: string | null
  onHover: (index: number) => void
  onOpen: (index: number) => void
}>

// O campo da paleta continua sendo o único input: aqui só se desenha a lista, a linha de renomear
// ou a confirmação de junção.
export function PaletteFolders({ view, folders, selectedIndex, notice, onHover, onOpen }: Props) {
  const t = useT()
  if (view.kind === 'rename') return <div className="palette-folder-line" role={view.error ? 'alert' : undefined}>
    <strong>{`${t('folders.rename')} “${view.from}”`}</strong>
    {view.error && <span>{t(reasonKey[view.error])}</span>}
  </div>
  if (view.kind === 'merge') return <div className="palette-folder-line" role="alert">
    <strong>{`${t('folders.merge')} “${view.from}” ${t('folders.into')} “${view.to}”: ${countsLabel(view.tasks, view.notes, t)}`}</strong>
  </div>
  return <>
    {notice && <p className="palette-folder-notice" role="status">{notice}</p>}
    {folders.map((folder, index) => <button type="button" className="command-row folder-row" id={`folder-row-${index}`} key={`folder-${folder.name}`} data-selected={index === selectedIndex} data-folder={folder.name} onMouseEnter={() => onHover(index)} onClick={() => onOpen(index)}><span>{folderLabel(folder.name, t)}</span><small>{countsLabel(folder.tasks, folder.notes, t)}</small></button>)}
    {!folders.length && <p className="empty">{t('folders.empty')}</p>}
  </>
}
```

- [ ] **Step 6: Style the folder rows**

Append to `src/ui/palette/palette.css`:

```css

/* Vista de pastas: as linhas reaproveitam .command-row; a linha de renomear ou juntar toma o lugar da lista. */
.palette .folder-row small { color: var(--text-secondary); }
.palette-folder-line { display: grid; gap: var(--space-1); padding: var(--space-3) var(--space-5); color: var(--text-primary); }
.palette-folder-line span { color: var(--text-secondary); }
.palette-folder-notice { margin: 0; padding: var(--space-2) var(--space-5); color: var(--text-secondary); }
```

- [ ] **Step 7: Run the tests and typecheck**

Run: `rtk proxy npx vitest run src/ui/__tests__/palette-folders.test.tsx` — Expected: PASS, 6 tests.
Run: `npx tsc --noEmit` — Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/i18n/dictionary.ts src/ui/palette/folder-view.ts src/ui/palette/PaletteFolders.tsx src/ui/palette/palette.css src/ui/__tests__/palette-folders.test.tsx
git commit -m "feat: add the palette folder view and its keyboard rules"
```

---

### Task 4: `/folder` na paleta, ligado ao `App`

**Files:**
- Replace: `src/ui/palette/commands.ts`
- Replace: `src/ui/palette/CommandPalette.tsx`
- Modify: `src/App.tsx`
- Modify: `src/ui/__tests__/palette.test.tsx`, `src/ui/__tests__/data-bound-views.test.tsx`
- Create: `tests/e2e/folders.spec.ts`

- [ ] **Step 1: Write the failing unit test**

In `src/ui/__tests__/palette.test.tsx`, add inside `describe('paleta', ...)`:

```tsx
  it('/folder troca a paleta para a vista de pastas em vez de navegar', () => {
    const folder = PALETTE_COMMANDS.find((command) => command.key === '/folder')
    expect(folder && 'action' in folder ? folder.action : null).toBe('folders')
    const markup = renderToStaticMarkup(<CommandPalette data={data} onClose={noop} onNavigate={noop} onEvent={noop} onRenameFolder={noop} turn={idleTurn} />)
    expect(markup).toContain('Navegar e renomear pastas')
  })
```

In the same file, change the existing render in `renderiza o diálogo em modo comando com rótulos do dicionário` to:

```tsx
    const markup = renderToStaticMarkup(<CommandPalette data={data} onClose={noop} onNavigate={noop} onEvent={noop} onRenameFolder={noop} turn={idleTurn} />)
```

In `src/ui/__tests__/data-bound-views.test.tsx`, change the palette render to:

```tsx
    const palette = renderToStaticMarkup(<CommandPalette data={data} onClose={onEvent} onNavigate={onEvent} onEvent={onEvent} onRenameFolder={onEvent} turn={idleTurn} />);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `rtk proxy npx vitest run src/ui/__tests__/palette.test.tsx`
Expected: FAIL — `/folder` is not in `PALETTE_COMMANDS`.

- [ ] **Step 3: Replace `commands.ts`**

Replace the whole content of `src/ui/palette/commands.ts` with:

```ts
import type { DictionaryKey } from '../../i18n/dictionary'
import type { NavKey } from '../shell/routes'

type CommandBase = Readonly<{ key: string; label: DictionaryKey; group: 'palette.group.navigate' | 'palette.group.work' | 'palette.group.system' }>

// Um comando abre uma rota ou troca a paleta para outra vista. `/folder` é o único do segundo tipo.
export type PaletteCommand = (CommandBase & Readonly<{ route: NavKey }>) | (CommandBase & Readonly<{ action: 'folders' }>)

export const PALETTE_COMMANDS: readonly PaletteCommand[] = [
  { key: '/day', label: 'command.day', group: 'palette.group.navigate', route: 'day' },
  { key: '/week', label: 'command.week', group: 'palette.group.navigate', route: 'week' },
  { key: '/tasks', label: 'command.tasks', group: 'palette.group.navigate', route: 'tasks' },
  { key: '/reminders', label: 'command.reminders', group: 'palette.group.navigate', route: 'reminders' },
  { key: '/habits', label: 'command.habits', group: 'palette.group.navigate', route: 'habits' },
  { key: '/goals', label: 'command.goals', group: 'palette.group.navigate', route: 'goals' },
  { key: '/notes', label: 'command.notes', group: 'palette.group.navigate', route: 'notes' },
  { key: '/folder', label: 'command.folder', group: 'palette.group.navigate', action: 'folders' },
  { key: '/review', label: 'command.review', group: 'palette.group.navigate', route: 'review' },
  { key: '/stats', label: 'command.stats', group: 'palette.group.navigate', route: 'review' },
  { key: '/taby', label: 'command.taby', group: 'palette.group.navigate', route: 'taby' },
  { key: '/help', label: 'command.help', group: 'palette.group.system', route: 'help' },
  { key: '/feedback', label: 'command.feedback', group: 'palette.group.system', route: 'feedback' },
  { key: '/bug', label: 'command.bug', group: 'palette.group.system', route: 'feedback' },
  { key: '/idea', label: 'command.idea', group: 'palette.group.system', route: 'feedback' },
  { key: '/focus', label: 'command.focus', group: 'palette.group.work', route: 'focus' },
  { key: '/settings', label: 'command.settings', group: 'palette.group.system', route: 'settings' },
  { key: '/tools', label: 'command.tools', group: 'palette.group.system', route: 'settings' },
  { key: '/events', label: 'command.events', group: 'palette.group.system', route: 'instrumentation' },
  { key: '/updates', label: 'command.updates', group: 'palette.group.system', route: 'updates' },
  { key: '/hardware', label: 'command.hardware', group: 'palette.group.system', route: 'hardware' },
]

export const filterCommands = (query: string, t: (key: DictionaryKey) => string): readonly PaletteCommand[] => {
  const needle = query.trim().toLowerCase()
  return PALETTE_COMMANDS.filter((command) => `${command.key} ${t(command.label)}`.toLowerCase().includes(needle))
}
```

- [ ] **Step 4: Replace `CommandPalette.tsx`**

Replace the whole content of `src/ui/palette/CommandPalette.tsx` with:

```tsx
import React, { useEffect, useRef, useState } from 'react'
import { listFolders } from '../../domain/folders'
import type { StudyData } from '../../domain/models'
import { useT } from '../../i18n/LocaleProvider'
import type { NavKey } from '../shell/routes'
import type { AssistantTurnControls } from '../useAssistantTurn'
import { filterCommands } from './commands'
import { filterFolders, folderIntent, previousView, renameOutcome, type PaletteView } from './folder-view'
import { paletteModeFor } from './mode'
import { PaletteFolders } from './PaletteFolders'
import { PaletteTurn } from './PaletteTurn'
import './palette.css'

type Props = Readonly<{
  data: StudyData
  onClose: () => void
  onNavigate: (key: NavKey, options?: { folder?: string }) => void
  onEvent: (action: string, detail: string) => void
  onRenameFolder: (from: string, to: string) => void
  turn: AssistantTurnControls
}>

// Um campo, várias vistas: "/" filtra comandos; uma frase vai para o Taby e confirma aqui mesmo;
// `/folder` troca para a vista de pastas, onde o mesmo campo filtra e renomeia pastas.
export function CommandPalette({ data, onClose, onNavigate, onEvent, onRenameFolder, turn }: Props) {
  const t = useT()
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [view, setView] = useState<PaletteView>({ kind: 'commands' })
  const [notice, setNotice] = useState<string | null>(null)
  const paletteRef = useRef<HTMLElement>(null)
  const turnRef = useRef(turn)
  turnRef.current = turn
  // O turno é compartilhado com a página Taby (ver App.tsx); "submitted !== null" é o que distingue
  // um turno que ESTA instância da paleta pediu de um turno levantado alhures (ex.: confirmação na
  // página Taby enquanto a paleta está com o campo vazio). Precisa de ref porque o cleanup de
  // unmount roda com deps `[]` e, sem isso, veria sempre o valor da montagem.
  const startedByThisRef = useRef(submitted !== null)
  startedByThisRef.current = submitted !== null
  // Pelo mesmo motivo a vista vive numa ref: o listener de `esc` é registrado uma vez só.
  const viewRef = useRef(view)
  viewRef.current = view
  const { state } = turn
  // Um turno "ativo" cobre qualquer status além de idle enquanto submitted !== null: streaming,
  // resposta, confirmação pendente, falha, executado ou cancelado ainda contam — a paleta só
  // volta a comandos quando o usuário digita "/" de novo (ver onChange) ou fecha o diálogo.
  const turnActive = submitted !== null && state.status !== 'idle'
  const mode = paletteModeFor(query, turnActive)
  const matches = filterCommands(query, t)
  const folders = view.kind === 'folders' ? filterFolders(listFolders(data), query, t) : []
  const settled = state.status === 'replied' || state.status === 'executed' || state.status === 'cancelled' || state.status === 'failure'

  useEffect(() => { setSelectedIndex(0) }, [query, view.kind])
  // Fechar nunca executa nada: uma confirmação pendente é cancelada e um stream é parado — mas só
  // quando o turno em voo foi pedido por ESTA instância. Um turno levantado pela página Taby (ou por
  // uma montagem anterior da paleta) não é nosso para descartar: unmount aqui deve deixá-lo intacto.
  useEffect(() => () => { if (startedByThisRef.current) turnRef.current.dismiss() }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        // Nas vistas de pastas, `esc` volta um passo; da renomeação de uma junção, volta com o nome digitado.
        const current = viewRef.current
        const previous = previousView(current)
        if (previous) { setView(previous); setQuery(current.kind === 'merge' ? current.to : ''); setNotice(null); return }
        if (!startedByThisRef.current) { onClose(); return }
        if (turnRef.current.dismiss() === 'close') onClose()
        return
      }
      if (event.key !== 'Tab') return
      const root = paletteRef.current
      if (!root) return
      const focusable = Array.from(root.querySelectorAll<HTMLElement>('input,button')).filter((item) => !(item as HTMLButtonElement).disabled)
      if (!focusable.length) return
      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const openCommand = (index: number) => {
    const item = matches[index]
    if (!item) return
    onEvent('command', item.key)
    if ('action' in item) { setView({ kind: 'folders' }); setQuery(''); setNotice(null); return }
    onNavigate(item.route)
  }
  const openFolder = (index: number, route: 'tasks' | 'notes' = 'tasks') => {
    const folder = folders[index]
    if (!folder) return
    onEvent('folder', route)
    onNavigate(route, { folder: folder.name })
  }
  const applyRename = (from: string, to: string) => { onRenameFolder(from, to); setView({ kind: 'folders' }); setQuery(''); setNotice(t('folders.renamed')) }
  const send = () => { const message = query.trim(); if (!message) return; setSubmitted(message); setQuery(''); void turn.ask(message) }

  // Digitar "/" com um turno na tela é o usuário pedindo comandos de volta explicitamente.
  // dismiss() primeiro: é o único jeito seguro de sair de uma confirmação pendente (cancela via
  // policy) ou de um stream (para). Só depois reset() zera o estado do turno e limpamos submitted.
  // Importante: isso NÃO dispara quando a query fica vazia — esse era o bug original.
  const handleQueryChange = (value: string) => {
    if (view.kind === 'merge') setView({ kind: 'rename', from: view.from, error: null })
    else if (view.kind === 'rename' && view.error) setView({ ...view, error: null })
    else if (view.kind === 'commands' && turnActive && value.trimStart().startsWith('/')) { turn.dismiss(); turn.reset(); setSubmitted(null) }
    setQuery(value)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (view.kind === 'folders') {
      if (folders.length && event.key === 'ArrowDown') { event.preventDefault(); setSelectedIndex((index) => (index + 1) % folders.length); return }
      if (folders.length && event.key === 'ArrowUp') { event.preventDefault(); setSelectedIndex((index) => (index - 1 + folders.length) % folders.length); return }
      if (event.key === 'Enter') event.preventDefault()
      const intent = folderIntent(event, folders[selectedIndex])
      if (intent.type === 'open') openFolder(selectedIndex, intent.route)
      if (intent.type === 'rename') { setView({ kind: 'rename', from: intent.from, error: null }); setQuery(intent.from); setNotice(null) }
      return
    }
    if (view.kind === 'rename') {
      if (event.key !== 'Enter') return
      event.preventDefault()
      const outcome = renameOutcome(data, view.from, query)
      if (outcome.type === 'refuse') setView({ ...view, error: outcome.reason })
      else if (outcome.type === 'confirm-merge') setView(outcome.view)
      else applyRename(outcome.from, outcome.to)
      return
    }
    if (view.kind === 'merge') {
      if (event.key !== 'Enter') return
      event.preventDefault()
      applyRename(view.from, view.to)
      return
    }
    if (mode === 'command') {
      if (!matches.length) return
      if (event.key === 'ArrowDown') { event.preventDefault(); setSelectedIndex((index) => (index + 1) % matches.length) }
      if (event.key === 'ArrowUp') { event.preventDefault(); setSelectedIndex((index) => (index - 1 + matches.length) % matches.length) }
      if (event.key === 'Enter') { event.preventDefault(); if (query.trim() === '' && settled) onClose(); else openCommand(selectedIndex) }
      return
    }
    if (event.key === 'Enter') { event.preventDefault(); if (state.status === 'confirmation') void turn.confirm(); else if (state.status !== 'streaming') send() }
  }

  const footer = view.kind === 'folders' ? [t('palette.footer.select'), t('folders.footer.tasks'), t('folders.footer.notes'), t('folders.footer.rename'), t('folders.footer.back')]
    : view.kind === 'rename' ? [t('folders.footer.apply'), t('folders.footer.back')]
      : view.kind === 'merge' ? [t('folders.footer.merge'), t('folders.footer.back')]
        : state.status === 'confirmation' ? [t('palette.footer.confirm'), t('palette.footer.cancel')] : state.status === 'streaming' ? [t('palette.footer.cancel')] : mode === 'assistant' ? [t('palette.footer.ask'), t('palette.footer.close')] : [t('palette.footer.select'), t('palette.footer.open'), t('palette.footer.close')]
  const placeholder = view.kind === 'rename' || view.kind === 'merge' ? t('folders.renamePlaceholder') : view.kind === 'folders' ? t('folders.placeholder') : t('palette.placeholder')
  const activeDescendant = view.kind === 'folders' ? (folders[selectedIndex] ? `folder-row-${selectedIndex}` : undefined) : view.kind === 'commands' && mode === 'command' && matches[selectedIndex] ? `command-${matches[selectedIndex].key.slice(1)}` : undefined

  return <div className="overlay" onMouseDown={onClose}><section ref={paletteRef} className="palette" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={t('palette.title')}>
    <div className="palette-search"><span>{view.kind !== 'commands' ? '▤' : mode === 'command' ? '/' : '✦'}</span><input autoFocus value={query} onChange={(event) => handleQueryChange(event.target.value)} onKeyDown={handleKeyDown} placeholder={placeholder} aria-label={placeholder} aria-activedescendant={activeDescendant} /></div>
    <div className="palette-body">
      {view.kind !== 'commands'
        ? <PaletteFolders view={view} folders={folders} selectedIndex={selectedIndex} notice={notice} onHover={setSelectedIndex} onOpen={(index) => openFolder(index)} />
        : <>
          {mode === 'command' && matches.map((item, index) => <button type="button" className="command-row" id={`command-${item.key.slice(1)}`} data-selected={index === selectedIndex} key={item.key} onMouseEnter={() => setSelectedIndex(index)} onClick={() => openCommand(index)}><kbd>{item.key}</kbd><span>{t(item.label)}</span><small>{t(item.group)}</small></button>)}
          {mode === 'command' && !matches.length && <p className="empty">{t('palette.empty')}</p>}
          {submitted !== null && <PaletteTurn submitted={submitted} state={state} turn={turn} />}
        </>}
    </div>
    <div className="palette-footer">{footer.map((hint) => <span key={hint}>{hint}</span>)}</div>
  </section></div>
}
```

- [ ] **Step 5: Wire the palette in `App`**

In `src/App.tsx`, change the folders import from Task 2 to:

```ts
import { listFolders, NO_FOLDER, planFolderRename } from './domain/folders';
```

Right after the `deleteNote` line add:

```ts
  // Revalida contra o estado atual do repositório: a paleta pode ter planejado sobre um snapshot anterior.
  const renameFolder = (from: string, to: string) => { const plan = planFolderRename(repository.snapshot(), from, to); if (!plan.ok) return; repository.renameFolder(plan.from, plan.to); refreshData(); log('edit', `Folder · ${plan.from} → ${plan.to}`, plan.merge ? 'merged' : 'renamed'); };
```

Replace:

```tsx
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} onNavigate={(next) => { setPaletteOpen(false); navigate(next, 'command'); }} onEvent={log} turn={assistantTurn} />}
```

with:

```tsx
      {paletteOpen && <CommandPalette data={data} onClose={() => setPaletteOpen(false)} onNavigate={(next, options) => { setPaletteOpen(false); navigate(next, 'command', options); }} onEvent={log} onRenameFolder={renameFolder} turn={assistantTurn} />}
```

- [ ] **Step 6: Run the unit tests and typecheck**

Run: `rtk proxy npm test` — Expected: all green.
Run: `npx tsc --noEmit` — Expected: no errors.

- [ ] **Step 7: Write the e2e spec**

Create `tests/e2e/folders.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';

const dock = (page: Page) => page.getByRole('navigation', { name: 'Navegação principal' });
const palette = (page: Page) => page.getByRole('dialog', { name: 'Paleta de comandos' });
const field = (page: Page) => palette(page).getByRole('textbox');
const row = (page: Page, name: string) => palette(page).locator(`.folder-row[data-folder="${name}"]`);

// A seed só tem a pasta "Bento". O app grava o workspace no primeiro render; acrescentamos uma pasta
// nova e itens sem pasta direto no armazenamento e recarregamos.
async function openWithFolders(page: Page) {
  await page.goto('/');
  await expect(dock(page)).toBeVisible();
  await page.evaluate(() => {
    const data = JSON.parse(window.localStorage.getItem('hibi-study-data') ?? '{}');
    const stamp = '2026-09-10T12:00:00.000Z';
    data.tasks.push({ id: 'e2e-client', title: 'Cliente A', durationMinutes: 30, category: 'work', folder: 'Clientes' }, { id: 'e2e-loose', title: 'Tarefa solta', durationMinutes: 30, category: 'work' });
    data.notes.push({ id: 'e2e-brief', title: 'Briefing do cliente', content: 'x', folder: 'Clientes', createdAt: stamp, updatedAt: stamp });
    window.localStorage.setItem('hibi-study-data', JSON.stringify(data));
  });
  await page.reload();
  await expect(dock(page)).toBeVisible();
}

async function openFolders(page: Page) {
  await page.keyboard.press('Meta+K');
  await expect(palette(page)).toBeVisible();
  await field(page).fill('/folder');
  await page.keyboard.press('Enter');
  await expect(field(page)).toHaveAttribute('placeholder', 'Filtrar pastas');
}

test('/folder lista as pastas com contagens e ↵ abre Tarefas filtrada', async ({ page }) => {
  await openWithFolders(page);
  await openFolders(page);
  await expect(row(page, 'Bento')).toContainText('8 tarefas');
  await expect(row(page, 'Clientes')).toContainText('1 tarefa · 1 nota');
  await expect(row(page, '')).toContainText('Sem pasta');

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(palette(page)).toHaveCount(0);
  await expect(page.getByText('Cliente A')).toBeVisible();
  await expect(page.getByText('Kabrito Post 01')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pasta · Clientes 1' })).toHaveAttribute('aria-pressed', 'true');
  await expect(dock(page).getByRole('button', { name: 'Tarefas', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('⇧↵ abre Notas filtrada pela pasta', async ({ page }) => {
  await openWithFolders(page);
  await openFolders(page);
  await field(page).fill('cli');
  await page.keyboard.press('Shift+Enter');
  await expect(page.getByText('Briefing do cliente')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pasta · Clientes 1' })).toHaveAttribute('aria-pressed', 'true');
});

test('renomear para um nome livre aplica na hora', async ({ page }) => {
  await openWithFolders(page);
  await openFolders(page);
  await field(page).fill('cli');
  await page.keyboard.press('Meta+Enter');
  await expect(palette(page).getByText('Renomear “Clientes”')).toBeVisible();
  await expect(field(page)).toHaveValue('Clientes');

  await field(page).fill('Estúdio');
  await page.keyboard.press('Enter');
  await expect(palette(page).getByRole('status')).toHaveText('Pasta renomeada.');
  await expect(row(page, 'Estúdio')).toContainText('1 tarefa · 1 nota');
  await expect(row(page, 'Clientes')).toHaveCount(0);
});

test('juntar pede um segundo ↵ com a contagem, e esc volta sem aplicar', async ({ page }) => {
  await openWithFolders(page);
  await openFolders(page);
  await field(page).fill('cli');
  await page.keyboard.press('Meta+Enter');
  await field(page).fill('Bento');
  await page.keyboard.press('Enter');
  const merge = palette(page).getByRole('alert');
  await expect(merge).toHaveText('Juntar “Clientes” em “Bento”: 1 tarefa · 1 nota');

  // esc volta à renomeação com o nome digitado; esc de novo volta à lista, sem nada aplicado.
  await page.keyboard.press('Escape');
  await expect(field(page)).toHaveValue('Bento');
  await page.keyboard.press('Escape');
  await expect(row(page, 'Clientes')).toContainText('1 tarefa · 1 nota');

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Meta+Enter');
  await field(page).fill('Bento');
  await page.keyboard.press('Enter');
  await expect(merge).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(row(page, 'Bento')).toContainText('9 tarefas · 1 nota');
  await expect(row(page, 'Clientes')).toHaveCount(0);
});

test('"Sem pasta" abre, mas não oferece renomeação; esc volta aos comandos', async ({ page }) => {
  await openWithFolders(page);
  await openFolders(page);
  await field(page).fill('sem');
  await page.keyboard.press('Meta+Enter');
  await expect(row(page, '')).toBeVisible();
  await expect(palette(page).getByText(/^Renomear/)).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(field(page)).toHaveAttribute('placeholder', 'Digite um comando ou pergunte ao Taby');
  await expect(palette(page).locator('#command-day')).toBeVisible();

  await field(page).fill('/folder');
  await page.keyboard.press('Enter');
  await field(page).fill('sem');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Tarefa solta')).toBeVisible();
});
```

- [ ] **Step 8: Run the e2e specs that touch the palette**

Run: `rtk proxy npx playwright test tests/e2e/folders.spec.ts tests/e2e/foundation.spec.ts`
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add src/ui/palette/commands.ts src/ui/palette/CommandPalette.tsx src/App.tsx src/ui/__tests__/palette.test.tsx src/ui/__tests__/data-bound-views.test.tsx tests/e2e/folders.spec.ts
git commit -m "feat: browse, open and rename folders from the command palette"
```

---

### Task 5: `/break` — pausa de verdade no Foco

**Files:**
- Modify: `src/i18n/dictionary.ts`
- Modify: `src/ui/shell/routes.ts`
- Modify: `src/ui/palette/commands.ts`
- Replace: `src/ui/FocusView.tsx`
- Modify: `src/ui/HelpView.tsx`
- Modify: `src/App.tsx`
- Modify: `src/ui/__tests__/shell.test.tsx`, `src/ui/__tests__/palette.test.tsx`, `src/ui/__tests__/data-bound-views.test.tsx`
- Modify: `tests/e2e/smoke.spec.ts` (teste "Focus aplica a duração escolhida antes de iniciar")
- Create: `tests/e2e/break.spec.ts`

- [ ] **Step 1: Add the break strings**

In `src/i18n/dictionary.ts`, inside `pt`, right after `'folders.footer.merge': '↵ juntar',` add:

```ts
  'command.break': 'Fazer uma pausa',
  'focus.takeBreak': 'Fazer uma pausa',
  'focus.backToFocus': 'Voltar ao foco',
  'focus.breakEyebrow': 'PAUSA · SESSÃO LOCAL',
  'focus.breakReady': 'Hora de respirar.',
  'focus.breakTitle': 'Pausa',
  'focus.breakRunning': 'Longe da tela por alguns minutos.',
  'focus.breakOnClock': 'min de pausa no relógio.',
  'focus.startBreak': 'Começar pausa',
  'focus.stopBreak': 'Encerrar pausa',
  'focus.breakCompanion': 'Companion em pausa',
```

Inside `en`, right after `'folders.footer.merge': '↵ merge',` add:

```ts
  'command.break': 'Take a break',
  'focus.takeBreak': 'Take a break',
  'focus.backToFocus': 'Back to focus',
  'focus.breakEyebrow': 'BREAK · LOCAL SESSION',
  'focus.breakReady': 'Time to breathe.',
  'focus.breakTitle': 'Break',
  'focus.breakRunning': 'Away from the screen for a few minutes.',
  'focus.breakOnClock': 'min of break on the clock.',
  'focus.startBreak': 'Start break',
  'focus.stopBreak': 'End break',
  'focus.breakCompanion': 'Companion on break',
```

- [ ] **Step 2: Write the failing unit tests**

In `src/ui/__tests__/shell.test.tsx`, add inside `describe('shell', ...)`:

```tsx
  it('agrupa a pausa no item Foco do dock', () => {
    expect(dockKeyFor('break')).toBe('focus')
    expect(sectionLabelKey('break')).toBe('nav.focus')
    const markup = renderToStaticMarkup(<Dock active="break" onNavigate={noop} onOpenCommands={noop} />)
    expect(markup).toMatch(/aria-current="page"[^>]*>Foco</)
  })
```

In `src/ui/__tests__/palette.test.tsx`, add inside `describe('paleta', ...)`:

```tsx
  it('/break abre o Foco em modo pausa', () => {
    const command = PALETTE_COMMANDS.find((entry) => entry.key === '/break')
    expect(command && 'route' in command ? command.route : null).toBe('break')
  })
```

In `src/ui/__tests__/data-bound-views.test.tsx`, replace the test `exposes selectable focus and break durations` with:

```tsx
  it('separates focus and break durations', () => {
    const focus = renderToStaticMarkup(<FocusView onEvent={onEvent} />);
    expect(focus).toContain('25m focus');
    expect(focus).not.toContain('5m break');
    expect(focus).toContain('Fazer uma pausa');

    const pause = renderToStaticMarkup(<FocusView onEvent={onEvent} mode="break" />);
    expect(pause).toContain('PAUSA · SESSÃO LOCAL');
    expect(pause).toContain('>5m</button>');
    expect(pause).toContain('>15m</button>');
    expect(pause).toContain('5 min de pausa no relógio.');
    expect(pause).toContain('Voltar ao foco');
  });
```

In the same file, in `lists the release and hardware surfaces in Help`, add `expect(markup).toContain('/break');`.

- [ ] **Step 3: Run them to verify they fail**

Run: `rtk proxy npx vitest run src/ui/__tests__/shell.test.tsx src/ui/__tests__/palette.test.tsx src/ui/__tests__/data-bound-views.test.tsx`
Expected: FAIL — `'break'` is not a `NavKey`, `/break` is missing, and the focus markup still shows `5m break`.

- [ ] **Step 4: Add the `break` route**

In `src/ui/shell/routes.ts`:

In the `export type NavKey = ...` line, replace `| 'focus' |` with `| 'focus' | 'break' |`.

Replace:

```ts
// Dia e Semana são a mesma seção para o dock.
export const dockKeyFor = (route: NavKey): NavKey => isAgendaRoute(route) ? 'agenda' : route

export const sectionLabelKey = (route: NavKey): DictionaryKey => isAgendaRoute(route) ? 'nav.agenda' : `nav.${route}`
```

with:

```ts
// Dia e Semana são a mesma seção para o dock; a pausa é um modo do Foco.
export const dockKeyFor = (route: NavKey): NavKey => isAgendaRoute(route) ? 'agenda' : route === 'break' ? 'focus' : route

export const sectionLabelKey = (route: NavKey): DictionaryKey => isAgendaRoute(route) ? 'nav.agenda' : route === 'break' ? 'nav.focus' : `nav.${route}`
```

- [ ] **Step 5: Add the `/break` command**

In `src/ui/palette/commands.ts`, right after the `/focus` entry add:

```ts
  { key: '/break', label: 'command.break', group: 'palette.group.work', route: 'break' },
```

- [ ] **Step 6: Replace `FocusView`**

Replace the whole content of `src/ui/FocusView.tsx` with:

```tsx
import React, { useEffect, useState } from 'react';
import { useT } from '../i18n/LocaleProvider';
import { CompanionAnimation } from './CompanionAnimation';

export type FocusMode = 'focus' | 'break';
type Props = { onEvent: (action: string, detail: string, result?: string) => void; onFocusStarted?: () => void; onFocusCompleted?: () => void; mode?: FocusMode; onModeChange?: (mode: FocusMode) => void };

// Foco e pausa usam o mesmo relógio, mas nunca os mesmos eventos: uma pausa concluída não pode contar
// como sessão de foco — o /stats soma sessões e minutos a partir de focus.*.
const DURATIONS: Record<FocusMode, readonly number[]> = { focus: [25], break: [5, 10, 15] };

export function FocusView({ onEvent, onFocusStarted, onFocusCompleted, mode = 'focus', onModeChange }: Props) {
  const t = useT();
  const onBreak = mode === 'break';
  const initial = DURATIONS[mode][0]!;
  const [running, setRunning] = useState(false);
  const [duration, setDuration] = useState(initial);
  const [seconds, setSeconds] = useState(initial * 60);
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setSeconds((value) => {
      if (value > 1) return value - 1;
      setRunning(false);
      if (onBreak) onEvent('break-complete', 'Completed break', 'pass');
      else { onFocusCompleted?.(); onEvent('focus-complete', 'Completed focus session', 'pass'); }
      return duration * 60;
    }), 1000);
    return () => window.clearInterval(id);
  }, [running, onEvent, onFocusCompleted, duration, onBreak]);
  const chooseDuration = (minutes: number) => { if (running) return; setDuration(minutes); setSeconds(minutes * 60); onEvent(onBreak ? 'break-duration' : 'focus-duration', `${minutes} minute ${onBreak ? 'break' : 'session'}`, 'pass'); };
  const toggle = () => {
    const starting = !running;
    setRunning(starting);
    if (onBreak) { onEvent(starting ? 'break-start' : 'break-stop', starting ? 'Started break' : 'Stopped break', 'pass'); return; }
    if (starting) onFocusStarted?.();
    onEvent(starting ? 'focus-start' : 'focus-stop', starting ? 'Started Post 1 focus' : 'Stopped focus session', 'pass');
  };
  const time = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const heading = onBreak ? (running ? t('focus.breakTitle') : t('focus.breakReady')) : (running ? 'Post 1 — Kabrito digital' : 'Ready to focus.');
  const subhead = onBreak ? (running ? t('focus.breakRunning') : `${duration} ${t('focus.breakOnClock')}`) : (running ? 'One clear block. No back-to-back nudges.' : `Pick a task — ${duration}m on the clock.`);
  const action = onBreak ? (running ? t('focus.stopBreak') : t('focus.startBreak')) : (running ? 'Pause session' : 'Start focus');
  return <div className="focus-view"><div className="eyebrow">{onBreak ? t('focus.breakEyebrow') : 'FOCUS MODE · LOCAL SESSION'}</div><CompanionAnimation state={running && !onBreak ? 'working' : 'idle'} label={onBreak ? t('focus.breakCompanion') : 'Focus companion'} /><div className={`focus-ring ${running ? 'is-running' : ''}`}><span>{time}</span><small>MINUTES</small></div><h1>{heading}</h1><p className="subhead">{subhead}</p><button className="primary focus-button" onClick={toggle}>{action}</button><div className="focus-options">{DURATIONS[mode].map((minutes) => <button key={minutes} className={`filter ${duration === minutes ? 'active' : ''}`} aria-pressed={duration === minutes} disabled={running} onClick={() => chooseDuration(minutes)}>{onBreak ? `${minutes}m` : `${minutes}m focus`}</button>)}<button className="outline" disabled={running} onClick={() => onModeChange?.(onBreak ? 'focus' : 'break')}>{onBreak ? t('focus.backToFocus') : t('focus.takeBreak')}</button></div><p className="muted">Reminders are quiet during focus unless marked Important.</p></div>;
}
```

- [ ] **Step 7: List `/break` in Help**

In `src/ui/HelpView.tsx`, replace `['/focus', 'Timer de foco', 'focus'],` with `['/focus', 'Timer de foco', 'focus'], ['/break', 'Pausa curta', 'break'],`.

- [ ] **Step 8: Route `focus` and `break` in `App`**

In `src/App.tsx`, in the `case 'focus':` line, change the start from:

```tsx
      case 'focus': return <FocusView {...props} onFocusStarted=
```

to:

```tsx
      case 'focus': case 'break': return <FocusView key={route} {...props} mode={route === 'break' ? 'break' : 'focus'} onModeChange={(next) => navigate(next)} onFocusStarted=
```

Keep the existing `onFocusStarted` and `onFocusCompleted` handlers exactly as they are. `key={route}` remounts the view when switching modes, so each mode starts from its own default duration.

- [ ] **Step 9: Run the unit tests and typecheck**

Run: `rtk proxy npx vitest run src/ui/__tests__/shell.test.tsx src/ui/__tests__/palette.test.tsx src/ui/__tests__/data-bound-views.test.tsx` — Expected: PASS.
Run: `npx tsc --noEmit` — Expected: no errors.

- [ ] **Step 10: Update the Focus smoke test**

In `tests/e2e/smoke.spec.ts`, replace the test `Focus aplica a duração escolhida antes de iniciar` with:

```ts
test('Foco e pausa aplicam a duração escolhida antes de iniciar', async ({ page }) => {
  await page.goto('/');
  await go(page, 'Foco');
  await expect(page.getByText('25:00')).toBeVisible();
  await page.getByRole('button', { name: 'Fazer uma pausa' }).click();
  await page.getByRole('button', { name: '10m', exact: true }).click();
  await expect(page.getByText('10 min de pausa no relógio.')).toBeVisible();
  await expect(page.getByText('10:00')).toBeVisible();
  await page.getByRole('button', { name: 'Começar pausa' }).click();
  await expect(page.getByRole('button', { name: 'Encerrar pausa' })).toBeVisible();
});
```

- [ ] **Step 11: Write the break e2e spec**

Create `tests/e2e/break.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';

const dock = (page: Page) => page.getByRole('navigation', { name: 'Navegação principal' });
const palette = (page: Page) => page.getByRole('dialog', { name: 'Paleta de comandos' });
// O App persiste a instrumentação em `hibi-events`; ler dali prova o que foi registrado de fato.
const recordedActions = (page: Page) => page.evaluate(() => (JSON.parse(window.localStorage.getItem('hibi-events') ?? '[]') as { action: string }[]).map((event) => event.action));

async function openBreak(page: Page) {
  await expect(dock(page)).toBeVisible();
  await page.keyboard.press('Meta+K');
  await expect(palette(page)).toBeVisible();
  await palette(page).getByRole('textbox').fill('/break');
  await page.keyboard.press('Enter');
}

test('/break abre o Foco em modo pausa com 5 minutos e o dock marca Foco', async ({ page }) => {
  await page.goto('/');
  await openBreak(page);
  await expect(page.getByText('PAUSA · SESSÃO LOCAL')).toBeVisible();
  await expect(page.getByText('05:00')).toBeVisible();
  await expect(page.getByRole('button', { name: '5m', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(dock(page).getByRole('button', { name: 'Foco', exact: true })).toHaveAttribute('aria-current', 'page');

  await page.getByRole('button', { name: 'Voltar ao foco' }).click();
  await expect(page.getByText('25:00')).toBeVisible();
});

test('terminar uma pausa registra break-complete e nunca conta como foco', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await openBreak(page);
  await page.getByRole('button', { name: 'Começar pausa' }).click();
  await expect(page.getByRole('button', { name: 'Encerrar pausa' })).toBeVisible();

  await page.clock.runFor(5 * 60 * 1000 + 1000);

  await expect(page.getByRole('button', { name: 'Começar pausa' })).toBeVisible();
  await expect.poll(() => recordedActions(page)).toContain('break-complete');
  const actions = await recordedActions(page);
  expect(actions).toContain('break-start');
  expect(actions).not.toContain('focus-start');
  expect(actions).not.toContain('focus-complete');
});
```

- [ ] **Step 12: Run the affected e2e specs**

Run: `rtk proxy npx playwright test tests/e2e/break.spec.ts tests/e2e/smoke.spec.ts`
Expected: all green.

- [ ] **Step 13: Commit**

```bash
git add src/i18n/dictionary.ts src/ui/shell/routes.ts src/ui/palette/commands.ts src/ui/FocusView.tsx src/ui/HelpView.tsx src/App.tsx src/ui/__tests__/shell.test.tsx src/ui/__tests__/palette.test.tsx src/ui/__tests__/data-bound-views.test.tsx tests/e2e/smoke.spec.ts tests/e2e/break.spec.ts
git commit -m "feat: add /break as a real break mode that never counts as focus"
```

---

### Task 6: Status oficial e gate final

**Files:**
- Modify: `docs/IMPLEMENTATION_STATUS_AND_PLAN.md`

- [ ] **Step 1: Record the commands in the official status**

In `docs/IMPLEMENTATION_STATUS_AND_PLAN.md`, in the "Status atual" table, add this row right after the row that starts with `| Nova UI`:

```markdown
| Comandos `/folder` e `/break` | Implementado | Pastas derivadas dos itens, com filtros reais em Tarefas e Notas e navegação e renomeação pela paleta (junção só com confirmação). `/break` abre o Foco em modo pausa, com eventos `break-*` que nunca contam como foco. Paridade com os 21 comandos do original. |
```

- [ ] **Step 2: Run the full gate**

Run: `rtk proxy npm test` — Expected: all green.
Run: `npx tsc --noEmit` — Expected: no errors.
Run: `rtk proxy npm run build` — Expected: build succeeds.
Run: `rtk proxy npx playwright test` — Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add docs/IMPLEMENTATION_STATUS_AND_PLAN.md
git commit -m "docs: record /folder and /break in the implementation status"
```
