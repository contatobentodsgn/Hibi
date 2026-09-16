# Home e Agenda Atelier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar Hoje e Agenda em superfícies calmas, acionáveis e orientadas ao tempo disponível usando somente dados locais existentes.

**Architecture:** Criar seletores puros para derivar prioridade, progresso e intervalos livres a partir de `StudyData`, sem mutar o workspace. Montar componentes de apresentação pequenos em `HomeView` e `AgendaView`; a Agenda conserva Day/Week como donas da grade e só recebe um resumo derivado acima delas.

**Tech Stack:** React 19, TypeScript, Vitest sem DOM, Playwright, CSS tokens existentes.

---

### Task 1: Seletores de ritmo do dia

**Files:**
- Create: `src/ui/day-rhythm.ts`
- Test: `src/ui/__tests__/day-rhythm.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { deriveDayRhythm } from '../day-rhythm'

const blocks = [
  { id: 'a', title: 'Write proposal', start: '2026-09-14T09:00:00', end: '2026-09-14T10:00:00', category: 'work' },
  { id: 'b', title: 'Review', start: '2026-09-14T11:00:00', end: '2026-09-14T12:00:00', category: 'work' },
] as const
const blocksWithInvalidRange = [...blocks, { id: 'bad', title: 'Broken', start: '2026-09-14T12:00:00', end: '2026-09-14T11:00:00', category: 'work' }] as const

it('selects the first valid work block as the next action and exposes its duration', () => {
  const rhythm = deriveDayRhythm(blocks, '2026-09-14', new Date(2026, 8, 14, 8, 30))
  expect(rhythm.now?.title).toBe('Write proposal')
  expect(rhythm.now?.minutes).toBe(60)
})

it('returns only gaps of at least thirty minutes and ignores invalid blocks', () => {
  expect(deriveDayRhythm(blocksWithInvalidRange, '2026-09-14', new Date(2026, 8, 14, 8, 30)).freeWindows)
    .toEqual([{ start: '10:00', end: '11:00', minutes: 60 }])
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ui/__tests__/day-rhythm.test.ts`

Expected: FAIL because `../day-rhythm` does not exist.

- [ ] **Step 3: Implement the minimal pure selector**

```ts
export type FreeWindow = Readonly<{ start: string; end: string; minutes: number }>
export type RhythmBlock = Readonly<{ id: string; title: string; start: string; end: string; category: ScheduleBlock['category']; minutes: number }>
export type DayRhythm = Readonly<{ now: RhythmBlock | null; later: readonly RhythmBlock[]; completed: readonly RhythmBlock[]; plannedMinutes: number; workCount: number; freeWindows: readonly FreeWindow[] }>

export const formatMinutes = (minutes: number): string => minutes >= 60 && minutes % 60 === 0 ? `${minutes / 60}h` : `${minutes}m`
export const formatWindow = (window?: FreeWindow): string => window ? `${window.start}–${window.end}` : 'No free window remaining'

export function deriveDayRhythm(blocks: readonly ScheduleBlock[], day: string, now: Date): DayRhythm {
  const valid = blocks.filter((block) => toDateKey(block.start) === day && durationMinutes(block) > 0).sort((a, b) => a.start.localeCompare(b.start))
  // Convert local wall-clock fields only; never derive the day from UTC ISO.
  // Return next/current work block, later blocks, planned minutes and >=30m gaps.
}
```

- [ ] **Step 4: Run the selector tests**

Run: `npx vitest run src/ui/__tests__/day-rhythm.test.ts`

Expected: PASS.

- [ ] **Step 5: Prove the test detects a mutation**

Temporarily change the free-window threshold from `30` to `90`, rerun the second test and confirm it fails; restore `30` and rerun to PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/day-rhythm.ts src/ui/__tests__/day-rhythm.test.ts
git commit -m "feat: derive daily rhythm from local blocks"
```

### Task 2: Rebuild Hoje around the next action

**Files:**
- Modify: `src/ui/HomeView.tsx`
- Modify: `src/ui/theme.css`
- Modify: `src/ui/__tests__/data-bound-views.test.tsx`
- Test: `tests/e2e/home-atelier.spec.ts`

- [ ] **Step 1: Write failing markup assertions**

```ts
it('renders the contextual now action, progress text, free time and companion', () => {
  const markup = renderToStaticMarkup(<HomeView data={agenda} onEvent={onEvent} onNavigate={onEvent} />)
  expect(markup).toContain('Now')
  expect(markup).toContain('Start focus')
  expect(markup).toContain('planned today')
  expect(markup).toContain('Next free window')
  expect(markup).toContain('Today companion')
})
```

- [ ] **Step 2: Verify the test is red**

Run: `npx vitest run src/ui/__tests__/data-bound-views.test.tsx`

Expected: FAIL because the labels and companion are not rendered.

- [ ] **Step 3: Add the Home composition**

```tsx
const rhythm = deriveDayRhythm(data.blocks, today, new Date())
const action = rhythm.now ? { label: 'Start focus', route: 'focus' as const } : { label: 'Open agenda', route: 'day' as const }

<section className="today-now" aria-labelledby="today-now-title">
  <CompanionAnimation state={rhythm.now ? 'working' : 'idle'} label="Today companion" />
  <p className="eyebrow">NOW</p>
  <h2 id="today-now-title">{rhythm.now?.title ?? 'Your day is clear.'}</h2>
  <button className="primary" onClick={() => onNavigate(action.route)}>{action.label}</button>
</section>
```

Render `role="progressbar"` with `aria-valuetext` and text such as `3 of 5 planned today`; show a labelled free window or an explicit `No free window remaining today` state. Use existing `CompanionAnimation`, not a new asset/runtime.

- [ ] **Step 4: Add layout styles**

Add scoped rules for `.today-now`, `.today-summary`, `.today-rhythm` and responsive stacking. Reuse `--accent`, `--paper`, `--line`, `--ink` and existing radius/spacing; do not hard-code a new brand palette.

- [ ] **Step 5: Run unit tests**

Run: `npx vitest run src/ui/__tests__/data-bound-views.test.tsx src/ui/__tests__/CompanionAnimation.test.ts`

Expected: PASS.

- [ ] **Step 6: Add the e2e behavior test**

```ts
test('Today starts focus from the contextual action', async ({ page }) => {
  await page.getByRole('button', { name: 'Start focus' }).click()
  await expect(page.getByRole('heading', { name: /Focus/i })).toBeVisible()
})
```

- [ ] **Step 7: Run e2e and prove mutation**

Run: `HIBI_E2E_PORT=4380 npx playwright test tests/e2e/home-atelier.spec.ts`

Expected: PASS. Temporarily route the button to `day`, confirm this test fails, restore `focus`, then rerun to PASS.

- [ ] **Step 8: Commit**

```bash
git add src/ui/HomeView.tsx src/ui/theme.css src/ui/__tests__/data-bound-views.test.tsx tests/e2e/home-atelier.spec.ts
git commit -m "feat: redesign today around the next action"
```

### Task 3: Add agenda availability summary

**Files:**
- Create: `src/ui/AgendaAvailability.tsx`
- Modify: `src/ui/AgendaView.tsx`
- Modify: `src/ui/theme.css`
- Create: `src/ui/__tests__/AgendaAvailability.test.tsx`

- [ ] **Step 1: Write the failing component test**

```tsx
it('describes occupied time, protected focus and the next free window without color-only meaning', () => {
  const markup = renderToStaticMarkup(<AgendaAvailability data={data} mode="day" />)
  expect(markup).toContain('Time available')
  expect(markup).toContain('Focus blocks')
  expect(markup).toContain('Next free window')
  expect(markup).toContain('aria-label="Agenda availability"')
})
```

- [ ] **Step 2: Verify it fails**

Run: `npx vitest run src/ui/__tests__/AgendaAvailability.test.tsx`

Expected: FAIL because `AgendaAvailability` does not exist.

- [ ] **Step 3: Implement the summary component**

```tsx
export function AgendaAvailability({ data, mode }: Readonly<{ data: StudyData; mode: AgendaMode }>) {
  const today = todayKey()
  const rhythm = deriveDayRhythm(data.blocks, today, new Date())
  return <section className="agenda-availability" aria-label="Agenda availability">
    <div><span>Time planned</span><strong>{formatMinutes(rhythm.plannedMinutes)}</strong></div>
    <div><span>Focus blocks</span><strong>{rhythm.workCount}</strong></div>
    <div><span>Next free window</span><strong>{formatWindow(rhythm.freeWindows[0])}</strong></div>
  </section>
}
```

For week mode, aggregate each local day in the displayed seven-day range with the same selector. Do not add an external-calendar claim, fake conflict, or nonfunctional control.

- [ ] **Step 4: Mount it above DayView/WeekView**

```tsx
<div className="agenda-view">
  <AgendaAvailability data={data} mode={current} />
  <div className="filter-row" role="tablist" aria-label={t('agenda.toggle')}>
    <button type="button" role="tab" aria-selected={current === 'day'}>Day</button>
    <button type="button" role="tab" aria-selected={current === 'week'}>Week</button>
  </div>
  {current === 'day'
    ? <DayView data={data} onEvent={onEvent} onCreateBlock={onCreateBlock} onDeleteBlock={onDeleteBlock} />
    : <WeekView data={data} onEvent={onEvent} onCreateBlock={onCreateBlock} onDeleteBlock={onDeleteBlock} />}
</div>
```

- [ ] **Step 5: Run component tests**

Run: `npx vitest run src/ui/__tests__/AgendaAvailability.test.tsx src/ui/__tests__/agenda-storage.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/AgendaAvailability.tsx src/ui/AgendaView.tsx src/ui/theme.css src/ui/__tests__/AgendaAvailability.test.tsx
git commit -m "feat: surface agenda availability"
```

### Task 4: Verify the complete redesign

**Files:**
- Test: `src/ui/__tests__/data-bound-views.test.tsx`
- Test: `tests/e2e/home-atelier.spec.ts`
- Test: `tests/e2e/smoke.spec.ts`

- [ ] **Step 1: Run the complete required verification suite**

Run each command in the foreground and check its exit code:

```bash
npm test
TZ=Pacific/Kiritimati npm test
npm run parity:check
npm run safety:renderer
npx tsc --noEmit
npm run build
HIBI_E2E_PORT=4380 npx playwright test
```

Expected: every command exits 0.

- [ ] **Step 2: Review visual and interaction invariants**

Confirm via the e2e suite that Today opens Focus from the primary action; Agenda remembers Day/Week; add/delete behavior survives; and no UI claims an external calendar conflict before the IPC provides one.

- [ ] **Step 3: Rebase and publish**

```bash
git fetch origin main
git rebase origin/main
git push -u origin codex/home-agenda-atelier
gh pr create --base main --head codex/home-agenda-atelier --title "feat: redesign Home and Agenda" --fill
```
