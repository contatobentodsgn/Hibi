# Tarefas Atelier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorientar Tarefas para execução diária com síntese local de prioridade e prazo, preservando todas as ações atuais.

**Architecture:** Um seletor puro classifica prazos com chaves de calendário locais e deriva a próxima tarefa de `StudyData.tasks`. Um componente de apresentação renderiza a síntese e `TasksView` a monta antes dos filtros; o CSS permanece isolado da folha global.

**Tech Stack:** React 19, TypeScript, Vitest sem DOM, Playwright e tokens CSS existentes.

---

### Task 1: Derivar ritmo de tarefas localmente

**Files:**
- Create: `src/ui/task-rhythm.ts`
- Create: `src/ui/__tests__/task-rhythm.test.ts`

- [ ] **Step 1: Escrever o teste falho de classificação e prioridade**

```ts
import { describe, expect, it } from 'vitest'
import { deriveTaskRhythm } from '../task-rhythm'

const tasks = [
  { id: 'overdue', title: 'Overdue', durationMinutes: 30, category: 'work', deadline: '2026-09-13T09:00:00' },
  { id: 'today', title: 'Today', durationMinutes: 60, category: 'work', deadline: '2026-09-14T10:00:00' },
  { id: 'later', title: 'Later', durationMinutes: 30, category: 'work', deadline: '2026-09-15T10:00:00' },
  { id: 'none', title: 'No deadline', durationMinutes: 30, category: 'work' },
  { id: 'done', title: 'Done', durationMinutes: 30, category: 'work', status: 'completed' },
] as const

describe('deriveTaskRhythm', () => {
  it('prioritizes overdue open work and describes deadline buckets with local dates', () => {
    const rhythm = deriveTaskRhythm(tasks, '2026-09-14')
    expect(rhythm.next?.id).toBe('overdue')
    expect(rhythm.overdue).toBe(1)
    expect(rhythm.dueToday).toBe(1)
    expect(rhythm.withoutDeadline).toBe(1)
    expect(rhythm.deadlineStateById.overdue).toBe('overdue')
    expect(rhythm.deadlineStateById.today).toBe('today')
    expect(rhythm.deadlineStateById.none).toBe('none')
  })
})
```

- [ ] **Step 2: Confirmar que o teste falha**

Run: `npx vitest run src/ui/__tests__/task-rhythm.test.ts`

Expected: FAIL porque `../task-rhythm` ainda não existe.

- [ ] **Step 3: Implementar o seletor mínimo**

```ts
import type { Task } from '../domain/models'

export type TaskDeadlineState = 'overdue' | 'today' | 'future' | 'none'
export type TaskRhythm = Readonly<{
  next: Task | null
  open: number
  overdue: number
  dueToday: number
  withoutDeadline: number
  deadlineStateById: Readonly<Record<string, TaskDeadlineState>>
}>

const deadlineDay = (deadline?: string) => deadline?.slice(0, 10) ?? null
const open = (task: Task) => task.status !== 'completed' && task.status !== 'paused'

export function deriveTaskRhythm(tasks: readonly Task[], today: string): TaskRhythm {
  const openTasks = tasks.filter(open)
  const deadlineStateById = Object.fromEntries(openTasks.map((task) => {
    const day = deadlineDay(task.deadline)
    const state: TaskDeadlineState = !day ? 'none' : day < today ? 'overdue' : day === today ? 'today' : 'future'
    return [task.id, state]
  }))
  const priority = (task: Task) => ({ overdue: 0, today: 1, future: 2, none: 3 }[deadlineStateById[task.id]])
  const ordered = [...openTasks].sort((a, b) => priority(a) - priority(b) || (a.deadline ?? '').localeCompare(b.deadline ?? '') || a.title.localeCompare(b.title))
  return {
    next: ordered[0] ?? null,
    open: openTasks.length,
    overdue: ordered.filter((task) => deadlineStateById[task.id] === 'overdue').length,
    dueToday: ordered.filter((task) => deadlineStateById[task.id] === 'today').length,
    withoutDeadline: ordered.filter((task) => deadlineStateById[task.id] === 'none').length,
    deadlineStateById,
  }
}
```

- [ ] **Step 4: Rodar o teste e provar que ele detecta mutação**

Run: `npx vitest run src/ui/__tests__/task-rhythm.test.ts`

Expected: PASS. Trocar temporariamente a prioridade de `overdue` de `0` para `3`; o teste precisa falhar em `next`, então restaurar e rodar novamente.

- [ ] **Step 5: Commit**

```bash
git add src/ui/task-rhythm.ts src/ui/__tests__/task-rhythm.test.ts
git commit -m "feat: derive local task rhythm"
```

### Task 2: Renderizar a síntese Atelier de Tarefas

**Files:**
- Create: `src/ui/TasksAtelierSummary.tsx`
- Create: `src/ui/tasks-atelier.css`
- Modify: `src/ui/__tests__/data-bound-views.test.tsx`

- [ ] **Step 1: Adicionar teste falho da região de síntese**

```tsx
import { TasksAtelierSummary } from '../TasksAtelierSummary'

it('renders a named task execution summary with deadline states in text', () => {
  const markup = renderToStaticMarkup(<TasksAtelierSummary tasks={data.tasks} today={keyFromToday(0)} />)
  expect(markup).toContain('aria-label="Task execution summary"')
  expect(markup).toContain('Next action')
  expect(markup).toContain('Overdue')
  expect(markup).toContain('Due today')
  expect(markup).toContain('Without deadline')
})
```

- [ ] **Step 2: Confirmar que o teste falha**

Run: `npx vitest run src/ui/__tests__/data-bound-views.test.tsx`

Expected: FAIL porque o componente não existe.

- [ ] **Step 3: Implementar o componente apresentacional**

```tsx
import React from 'react'
import type { Task } from '../domain/models'
import { deriveTaskRhythm } from './task-rhythm'
import './tasks-atelier.css'

export function TasksAtelierSummary({ tasks, today }: Readonly<{ tasks: readonly Task[]; today: string }>) {
  const rhythm = deriveTaskRhythm(tasks, today)
  return <section className="tasks-atelier-summary" aria-label="Task execution summary">
    <div className="task-next"><span>Next action</span><strong>{rhythm.next?.title ?? 'Your queue is clear'}</strong></div>
    <div><span>Overdue</span><strong>{rhythm.overdue}</strong></div>
    <div><span>Due today</span><strong>{rhythm.dueToday}</strong></div>
    <div><span>Without deadline</span><strong>{rhythm.withoutDeadline}</strong></div>
  </section>
}
```

- [ ] **Step 4: Adicionar CSS escopado e verificar**

```css
.tasks-atelier-summary { display:grid; grid-template-columns:2fr repeat(3,1fr); border:1px solid var(--line); border-radius:16px; overflow:hidden; }
.tasks-atelier-summary > div { display:grid; gap:5px; padding:16px 18px; border-right:1px solid var(--line); }
.tasks-atelier-summary span { color:var(--muted); font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; }
.tasks-atelier-summary strong { color:var(--ink); font-size:18px; }
@media (max-width:640px) { .tasks-atelier-summary { grid-template-columns:1fr 1fr; } }
```

Run: `npx vitest run src/ui/__tests__/data-bound-views.test.tsx && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/TasksAtelierSummary.tsx src/ui/tasks-atelier.css src/ui/__tests__/data-bound-views.test.tsx
git commit -m "feat: add task atelier summary"
```

### Task 3: Integrar estados de prazo em Tarefas

**Files:**
- Modify: `src/ui/TasksView.tsx`
- Modify: `src/ui/tasks-atelier.css`
- Modify: `src/ui/__tests__/data-bound-views.test.tsx`
- Create: `tests/e2e/tasks-atelier.spec.ts`

- [ ] **Step 1: Escrever teste falho de integração**

```tsx
it('mounts the task summary and exposes a textual deadline state per open task', () => {
  const markup = renderToStaticMarkup(<TasksView data={data} onEvent={onEvent} onTaskStatusChange={onEvent} />)
  expect(markup).toContain('Task execution summary')
  expect(markup).toContain('data-deadline-state=')
})
```

- [ ] **Step 2: Confirmar que o teste falha**

Run: `npx vitest run src/ui/__tests__/data-bound-views.test.tsx`

Expected: FAIL porque `TasksView` ainda não monta a síntese nem descreve o prazo da linha.

- [ ] **Step 3: Montar o seletor e enriquecer as linhas sem alterar callbacks**

```tsx
const today = todayKey()
const rhythm = deriveTaskRhythm(data.tasks, today)

<TasksAtelierSummary tasks={data.tasks} today={today} />

<div className="task-row" data-deadline-state={rhythm.deadlineStateById[task.id] ?? 'none'}>
  <div>
    <strong>{task.title}</strong>
    <span>{deadlineLabel(rhythm.deadlineStateById[task.id], task.deadline)}</span>
  </div>
</div>
```

`deadlineLabel` deverá produzir `Overdue · YYYY-MM-DD HH:mm`, `Due today · ...`, `Due YYYY-MM-DD HH:mm` ou `No deadline`. Não usar `Date.parse`, conversão UTC ou alteração de `task.deadline`.

- [ ] **Step 4: Criar teste e2e de manutenção de comportamento**

```ts
test('Tasks keeps its execution summary while completing a task', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Tarefas' }).click()
  await expect(page.getByRole('region', { name: 'Task execution summary' })).toBeVisible()
  await page.getByRole('button', { name: /Complete Kabrito Post 01/i }).click()
  await expect(page.getByRole('region', { name: 'Task execution summary' })).toBeVisible()
})
```

- [ ] **Step 5: Rodar, provar mutação e restaurar**

Run: `npx vitest run src/ui/__tests__/data-bound-views.test.tsx && HIBI_E2E_PORT=4380 npx playwright test tests/e2e/tasks-atelier.spec.ts`

Expected: PASS. Remover temporariamente `data-deadline-state` ou a montagem de `TasksAtelierSummary`; o teste de marcação ou e2e deve falhar. Restaurar e rodar novamente.

- [ ] **Step 6: Commit**

```bash
git add src/ui/TasksView.tsx src/ui/tasks-atelier.css src/ui/__tests__/data-bound-views.test.tsx tests/e2e/tasks-atelier.spec.ts
git commit -m "feat: orient tasks around next action"
```

### Task 4: Verificar e publicar a PR de Tarefas

**Files:**
- Verify: `src/ui/`, `tests/e2e/`

- [ ] **Step 1: Rodar a bateria completa e conferir saídas**

```bash
npm test
TZ=Pacific/Kiritimati npm test
npm run parity:check
npm run safety:renderer
npx tsc --noEmit
npm run build
HIBI_E2E_PORT=4380 npx playwright test
```

Expected: todos os comandos encerram com saída 0.

- [ ] **Step 2: Rebase, publicar e abrir PR**

```bash
git fetch origin main
git rebase origin/main
git push -u origin codex/tasks-atelier
gh pr create --base main --head codex/tasks-atelier --title "feat: redesign Tasks" --body "..."
```

O corpo deve listar o resumo, provas de mutação, números reais da bateria e confirmar que nenhum arquivo compartilhado foi tocado.
