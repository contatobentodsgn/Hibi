# Taby Conversations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Taby conversations across sessions, with a list, search, new chat and delete, without putting transcripts into the workspace backup.

**Architecture:** Pure rules in `src/domain/conversations.ts` (create, append, title, search, prune, sanitize). Persistence isolated in `src/data/conversation-store.ts`, reading and writing one `localStorage` key outside `StudyData`. **`src/ui/useConversations.ts` owns the state and is mounted once in `App.tsx`**, because the palette asks questions while `TabyView` is unmounted — a thread owned by the screen would lose them. `TabyView` and `CommandPalette` both consume that hook's active conversation. `ConversationList` renders the sidebar. All strings go through the i18n dictionary.

**Tech Stack:** React 19, TypeScript, Vitest (`renderToStaticMarkup`, no DOM environment), Playwright, `localStorage`.

**Design:** `docs/superpowers/specs/2026-09-11-taby-conversations-design.md`

---

## File structure

- Create `src/domain/conversations.ts` — types and pure rules. No storage, no React.
- Create `src/domain/__tests__/conversations.test.ts`.
- Create `src/data/conversation-store.ts` — load/save against an injected storage. No rules.
- Create `src/data/__tests__/conversation-store.test.ts`.
- Create `src/ui/useConversations.ts` — the single owner: loads on mount, records each turn, persists, exposes select/create/delete. Mounted once in `App.tsx`.
- Create `src/ui/__tests__/useConversations.test.ts`.
- Create `src/ui/ConversationList.tsx` — sidebar: list, search field, new/delete controls.
- Create `src/ui/__tests__/ConversationList.test.tsx`.
- Modify `src/i18n/dictionary.ts` — `taby.*` keys in `pt` then `en`.
- Modify `src/ui/TabyView.tsx` — hold conversations, persist, render the list.
- Modify `src/ui/__tests__/TabyView.test.tsx` if it exists; create it otherwise.
- Create `tests/e2e/taby-conversations.spec.ts`.
- Modify `src/data/__tests__/workspace-backup.test.ts` — prove a backup carries no transcript.

Conventions this repo already enforces: `pt` is the source of truth and `DictionaryKey = keyof typeof pt`, so adding a key to `pt` makes `tsc` demand it in `en`. Every `Storage` access is wrapped in `try/catch` (see `src/i18n/locale-storage.ts`). Tests build dates from local components, never `toISOString().slice(0,10)`.

---

## Task 1: Conversation shape, creation and appending

**Files:**
- Create: `src/domain/conversations.ts`
- Test: `src/domain/__tests__/conversations.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { appendMessage, createConversation, titleFor } from '../conversations'

const at = (hour: number) => new Date(2026, 8, 11, hour, 0).toISOString()

describe('conversations', () => {
  it('creates a conversation titled after the first message', () => {
    const conversation = createConversation('Quais tarefas vencem hoje?', at(9), 'c-1')

    expect(conversation).toMatchObject({ id: 'c-1', title: 'Quais tarefas vencem hoje?', createdAt: at(9), updatedAt: at(9) })
    expect(conversation.messages).toEqual([{ role: 'user', text: 'Quais tarefas vencem hoje?', at: at(9) }])
  })

  it('shortens a long first message into a title without cutting mid-word', () => {
    const longer = 'Preciso reorganizar a agenda da semana inteira considerando as reuniões novas'
    expect(titleFor(longer).length).toBeLessThanOrEqual(60)
    expect(titleFor(longer).endsWith('…')).toBe(true)
    expect(titleFor(longer)).not.toMatch(/\s…$/)
  })

  it('appends a message and moves updatedAt without touching createdAt', () => {
    const created = createConversation('oi', at(9), 'c-1')
    const replied = appendMessage(created, { role: 'assistant', text: 'Olá!', at: at(10), provenance: 'Hibi local tools' })

    expect(replied.messages).toHaveLength(2)
    expect(replied.messages[1]).toEqual({ role: 'assistant', text: 'Olá!', at: at(10), provenance: 'Hibi local tools' })
    expect(replied.updatedAt).toBe(at(10))
    expect(replied.createdAt).toBe(at(9))
    expect(created.messages).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `rtk proxy npx vitest run src/domain/__tests__/conversations.test.ts`
Expected: FAIL — `Failed to resolve import "../conversations"`.

- [ ] **Step 3: Write the minimal implementation**

```ts
export type ConversationMessage = Readonly<{ role: 'user' | 'assistant'; text: string; at: string; provenance?: string }>
export type Conversation = Readonly<{ id: string; title: string; createdAt: string; updatedAt: string; messages: readonly ConversationMessage[] }>

const TITLE_LIMIT = 60

/** Um rótulo curto tirado da primeira mensagem: nunca custa uma chamada ao modelo. */
export function titleFor(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= TITLE_LIMIT) return clean || 'Conversa'
  const cut = clean.slice(0, TITLE_LIMIT - 1)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > TITLE_LIMIT / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

export function createConversation(firstMessage: string, at: string, id: string): Conversation {
  return { id, title: titleFor(firstMessage), createdAt: at, updatedAt: at, messages: [{ role: 'user', text: firstMessage, at }] }
}

export function appendMessage(conversation: Conversation, message: ConversationMessage): Conversation {
  return { ...conversation, updatedAt: message.at, messages: [...conversation.messages, message] }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `rtk proxy npx vitest run src/domain/__tests__/conversations.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/conversations.ts src/domain/__tests__/conversations.test.ts
git commit -m "feat: shape a saved Taby conversation

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Redaction and sanitizing what comes back from storage

**Files:**
- Modify: `src/domain/conversations.ts`
- Test: `src/domain/__tests__/conversations.test.ts`

- [ ] **Step 1: Write the failing test** (append inside the existing `describe`)

```ts
  it('redacts pasted credentials before a message is ever stored', () => {
    const conversation = createConversation('minha chave é sk-abcdef123456 ok?', at(9), 'c-1')
    expect(conversation.messages[0].text).toBe('minha chave é [redacted] ok?')

    const withHeader = appendMessage(conversation, { role: 'user', text: 'usei Authorization: Bearer gsk_live_9f8e7d', at: at(10) })
    expect(withHeader.messages[1].text).toContain('[redacted]')
    expect(withHeader.messages[1].text).not.toContain('gsk_live_9f8e7d')
  })

  it('drops malformed records and keeps the valid ones', () => {
    const valid = createConversation('oi', at(9), 'c-1')
    expect(sanitizeConversation(valid)).toEqual(valid)
    expect(sanitizeConversation({ id: 'c-2', title: 'sem mensagens', createdAt: at(9), updatedAt: at(9), messages: 'nope' })).toBeUndefined()
    expect(sanitizeConversation({ ...valid, messages: [{ role: 'ghost', text: 'x', at: at(9) }] })).toBeUndefined()
    expect(sanitizeConversation(null)).toBeUndefined()
  })
```

Add `sanitizeConversation` to the import at the top of the file.

- [ ] **Step 2: Run it and watch it fail**

Run: `rtk proxy npx vitest run src/domain/__tests__/conversations.test.ts`
Expected: FAIL — `sanitizeConversation is not a function`, and the redaction test fails with the raw key still present.

- [ ] **Step 3: Write the implementation**

Add to `src/domain/conversations.ts`, and call `redactSecrets` on every `text` inside `createConversation` and `appendMessage`:

```ts
// Mesma regra do histórico da IA (`src/ai/history.ts`): uma credencial colada por engano não
// chega ao armazenamento. A conversa é gravada inteira; só o segredo é substituído.
export const redactSecrets = (value: string): string => value
  .replace(/(?:Bearer\s+|sk-|gsk_)[^\s,;]+/gi, '[redacted]')
  .replace(/(?:api[_-]?key|token)\s*[:=]\s*[^\s,;]+/gi, '[redacted]')

const isRole = (value: unknown): value is ConversationMessage['role'] => value === 'user' || value === 'assistant'
const isIsoDate = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value))

const sanitizeMessage = (value: unknown): ConversationMessage | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  if (!isRole(record.role) || typeof record.text !== 'string' || !isIsoDate(record.at)) return undefined
  const provenance = typeof record.provenance === 'string' && record.provenance ? record.provenance.slice(0, 240) : undefined
  return { role: record.role, text: redactSecrets(record.text), at: record.at, ...(provenance ? { provenance } : {}) }
}

/** Um registro corrompido é descartado sozinho; os demais sobrevivem. */
export function sanitizeConversation(value: unknown): Conversation | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || !record.id || typeof record.title !== 'string') return undefined
  if (!isIsoDate(record.createdAt) || !isIsoDate(record.updatedAt) || !Array.isArray(record.messages)) return undefined
  const messages = record.messages.map(sanitizeMessage)
  if (messages.some((message) => message === undefined)) return undefined
  return { id: record.id, title: record.title.slice(0, 120), createdAt: record.createdAt, updatedAt: record.updatedAt, messages: messages as ConversationMessage[] }
}
```

In `createConversation` use `redactSecrets(firstMessage)` for both the title source and the message text; in `appendMessage` use `{ ...message, text: redactSecrets(message.text) }`.

- [ ] **Step 4: Run it and watch it pass**

Run: `rtk proxy npx vitest run src/domain/__tests__/conversations.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/conversations.ts src/domain/__tests__/conversations.test.ts
git commit -m "feat: redact credentials and reject malformed conversations

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Search and pruning

**Files:**
- Modify: `src/domain/conversations.ts`
- Test: `src/domain/__tests__/conversations.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
  it('searches the text of messages, not only titles', () => {
    const first = appendMessage(createConversation('agenda da semana', at(9), 'c-1'), { role: 'assistant', text: 'Reunião com o cliente Kabrito', at: at(9) })
    const second = createConversation('lista de compras', at(10), 'c-2')

    expect(searchConversations([first, second], 'kabrito').map((item) => item.id)).toEqual(['c-1'])
    expect(searchConversations([first, second], 'LISTA').map((item) => item.id)).toEqual(['c-2'])
    expect(searchConversations([first, second], '   ').map((item) => item.id)).toEqual(['c-1', 'c-2'])
  })

  it('prunes the oldest conversation once the cap is reached', () => {
    const many = Array.from({ length: 51 }, (_, index) => createConversation(`pergunta ${index}`, new Date(2026, 8, 11, 9, index).toISOString(), `c-${index}`))
    const pruned = pruneConversations(many, { maxConversations: 50 })

    expect(pruned).toHaveLength(50)
    expect(pruned.some((item) => item.id === 'c-0')).toBe(false)
    expect(pruned[0].id).toBe('c-50')
  })
```

- [ ] **Step 2: Run it and watch it fail**

Run: `rtk proxy npx vitest run src/domain/__tests__/conversations.test.ts`
Expected: FAIL — `searchConversations is not a function`.

- [ ] **Step 3: Write the implementation**

```ts
export const MAX_CONVERSATIONS = 50

/** Busca no que foi dito: procurar só no título esconderia a conversa que interessa. */
export function searchConversations(conversations: readonly Conversation[], query: string): readonly Conversation[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return conversations
  return conversations.filter((conversation) =>
    conversation.title.toLowerCase().includes(needle) || conversation.messages.some((message) => message.text.toLowerCase().includes(needle)))
}

/** Mais recente primeiro; a mais antiga cai ao estourar o teto. */
export function pruneConversations(conversations: readonly Conversation[], { maxConversations = MAX_CONVERSATIONS } = {}): readonly Conversation[] {
  return [...conversations].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, maxConversations)
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `rtk proxy npx vitest run src/domain/__tests__/conversations.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/conversations.ts src/domain/__tests__/conversations.test.ts
git commit -m "feat: search conversation text and prune the oldest

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Persistence in its own storage key

**Files:**
- Create: `src/data/conversation-store.ts`
- Test: `src/data/__tests__/conversation-store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest'
import { createConversation } from '../../domain/conversations'
import { CONVERSATIONS_STORAGE_KEY, loadConversations, saveConversations } from '../conversation-store'

const at = (hour: number) => new Date(2026, 8, 11, hour, 0).toISOString()
const fakeStorage = (initial: string | null = null) => {
  let value = initial
  return { getItem: () => value, setItem: (_key: string, next: string) => { value = next }, read: () => value }
}

describe('conversation store', () => {
  it('writes to its own key, outside the workspace data', () => {
    const storage = fakeStorage()
    expect(saveConversations(storage, [createConversation('oi', at(9), 'c-1')])).toBe(true)
    expect(CONVERSATIONS_STORAGE_KEY).toBe('hibi-conversations')
    expect(JSON.parse(storage.read() ?? '[]')).toHaveLength(1)
  })

  it('reports a failed write instead of throwing', () => {
    const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError') } }
    expect(saveConversations(full, [createConversation('oi', at(9), 'c-1')])).toBe(false)
  })

  it('keeps valid conversations when one stored record is corrupt', () => {
    const valid = createConversation('oi', at(9), 'c-1')
    const storage = fakeStorage(JSON.stringify([valid, { id: 'c-2', messages: 'nope' }]))
    expect(loadConversations(storage).map((item) => item.id)).toEqual(['c-1'])
  })

  it('degrades to an empty list when storage is unreadable', () => {
    expect(loadConversations({ getItem: () => { throw new Error('blocked') } })).toEqual([])
    expect(loadConversations(fakeStorage('not json'))).toEqual([])
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `rtk proxy npx vitest run src/data/__tests__/conversation-store.test.ts`
Expected: FAIL — `Failed to resolve import "../conversation-store"`.

- [ ] **Step 3: Write the implementation**

```ts
import { pruneConversations, sanitizeConversation, type Conversation } from '../domain/conversations'

export const CONVERSATIONS_STORAGE_KEY = 'hibi-conversations'

/** Fora do `StudyData` de propósito: o backup do workspace serializa o StudyData inteiro. */
export function loadConversations(storage: Pick<Storage, 'getItem'>): readonly Conversation[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(CONVERSATIONS_STORAGE_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return pruneConversations(parsed.map(sanitizeConversation).filter((item): item is Conversation => Boolean(item)))
  } catch { return [] }
}

// Devolve `false` em vez de lançar: perder a gravação não pode derrubar a conversa em andamento,
// mas também não pode passar em silêncio — quem chama avisa uma vez.
export function saveConversations(storage: Pick<Storage, 'setItem'>, conversations: readonly Conversation[]): boolean {
  try {
    storage.setItem(CONVERSATIONS_STORAGE_KEY, JSON.stringify(pruneConversations(conversations)))
    return true
  } catch { return false }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `rtk proxy npx vitest run src/data/__tests__/conversation-store.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/data/conversation-store.ts src/data/__tests__/conversation-store.test.ts
git commit -m "feat: persist conversations outside the workspace data

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Prove the backup carries no transcript

**Files:**
- Modify: `src/data/__tests__/workspace-backup.test.ts`

This is the test that keeps the privacy decision honest. Without it, "conversations stay out of the backup" is only a sentence in a document.

- [ ] **Step 1: Write the failing test** (append to the existing `describe`)

```ts
  it('carries no conversation text, because conversations live outside StudyData', () => {
    const data = createSeedData()
    const backup = createWorkspaceBackup(data, { language: 'pt', twentyFourHour: true })

    expect(JSON.stringify(backup)).not.toContain('hibi-conversations')
    expect(Object.keys(backup.data)).not.toContain('conversations')
  })
```

Use whatever `createSeedData` / `createWorkspaceBackup` imports the file already has; do not add new ones.

- [ ] **Step 2: Run it**

Run: `rtk proxy npx vitest run src/data/__tests__/workspace-backup.test.ts`
Expected: PASS immediately — it pins a property that already holds. If it FAILS, stop: something put conversations into `StudyData` and the design was violated.

- [ ] **Step 3: Commit**

```bash
git add src/data/__tests__/workspace-backup.test.ts
git commit -m "test: pin conversations out of the workspace backup

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Dictionary keys

**Files:**
- Modify: `src/i18n/dictionary.ts`

- [ ] **Step 1: Add the keys to `pt`** (next to the other `taby.*` keys, or after the `stats.*` block if none exist)

```ts
  'taby.greeting': 'Olá! Sou o assistente local do Hibi. Posso consultar e organizar seu espaço de trabalho.',
  'taby.conversations': 'Conversas',
  'taby.newConversation': 'Nova conversa',
  'taby.searchPlaceholder': 'Buscar nas conversas',
  'taby.searchLabel': 'Buscar nas conversas',
  'taby.empty': 'Nenhuma conversa salva ainda.',
  'taby.noMatches': 'Nenhuma conversa encontrada.',
  'taby.delete': 'Apagar conversa',
  'taby.deleteAll': 'Apagar todas',
  'taby.deleteAllConfirm': 'Apagar todas as conversas salvas? Isto não pode ser desfeito.',
  'taby.saveFailed': 'Não foi possível salvar a conversa.',
  'taby.localOnly': 'As conversas ficam neste Mac e não entram no backup do workspace.',
```

- [ ] **Step 2: Run the typecheck and watch it fail**

Run: `npx tsc --noEmit`
Expected: FAIL — `en` is missing the twelve new keys, because `DictionaryKey = keyof typeof pt`. This is the safety net working.

- [ ] **Step 3: Add the same keys to `en`**

```ts
  'taby.greeting': "Hi! I'm Hibi's local assistant. I can look things up and organise your workspace.",
  'taby.conversations': 'Conversations',
  'taby.newConversation': 'New conversation',
  'taby.searchPlaceholder': 'Search conversations',
  'taby.searchLabel': 'Search conversations',
  'taby.empty': 'No saved conversations yet.',
  'taby.noMatches': 'No conversation found.',
  'taby.delete': 'Delete conversation',
  'taby.deleteAll': 'Delete all',
  'taby.deleteAllConfirm': 'Delete every saved conversation? This cannot be undone.',
  'taby.saveFailed': 'The conversation could not be saved.',
  'taby.localOnly': 'Conversations stay on this Mac and are not included in the workspace backup.',
```

- [ ] **Step 4: Run the typecheck and watch it pass**

Run: `npx tsc --noEmit`
Expected: `No errors found`.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/dictionary.ts
git commit -m "feat: add conversation strings in pt and en

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: The conversation list

**Files:**
- Create: `src/ui/ConversationList.tsx`
- Test: `src/ui/__tests__/ConversationList.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { appendMessage, createConversation } from '../../domain/conversations'
import { LocaleProvider } from '../../i18n/LocaleProvider'
import { ConversationList } from '../ConversationList'

const at = (hour: number) => new Date(2026, 8, 11, hour, 0).toISOString()
const noop = () => undefined
const host = { storage: { getItem: () => null, setItem: noop } }
const first = appendMessage(createConversation('agenda da semana', at(9), 'c-1'), { role: 'assistant', text: 'Reunião com Kabrito', at: at(9) })
const second = createConversation('lista de compras', at(10), 'c-2')

const render = (props: Partial<React.ComponentProps<typeof ConversationList>> = {}) => renderToStaticMarkup(
  <LocaleProvider initialLanguage="pt" host={host}>
    <ConversationList conversations={[second, first]} activeId="c-2" query="" onSelect={noop} onSearch={noop} onCreate={noop} onDelete={noop} onDeleteAll={noop} {...props} />
  </LocaleProvider>,
)

describe('ConversationList', () => {
  it('lists conversations and marks the active one', () => {
    const markup = render()
    expect(markup).toContain('lista de compras')
    expect(markup).toContain('agenda da semana')
    expect(markup).toMatch(/aria-current="true"[^>]*>[^<]*lista de compras/)
  })

  it('shows only the matches for a query', () => {
    const markup = render({ query: 'kabrito' })
    expect(markup).toContain('agenda da semana')
    expect(markup).not.toContain('lista de compras')
  })

  it('explains an empty list and a search with no match', () => {
    expect(render({ conversations: [] })).toContain('Nenhuma conversa salva ainda.')
    expect(render({ query: 'zzz' })).toContain('Nenhuma conversa encontrada.')
  })

  it('says conversations are not in the backup', () => {
    expect(render()).toContain('não entram no backup')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `rtk proxy npx vitest run src/ui/__tests__/ConversationList.test.tsx`
Expected: FAIL — `Failed to resolve import "../ConversationList"`.

- [ ] **Step 3: Write the component**

```tsx
import { searchConversations, type Conversation } from '../domain/conversations'
import { useT } from '../i18n/LocaleProvider'

export type ConversationListProps = {
  conversations: readonly Conversation[]
  activeId: string | null
  query: string
  onSelect: (id: string) => void
  onSearch: (query: string) => void
  onCreate: () => void
  onDelete: (id: string) => void
  onDeleteAll: () => void
}

export function ConversationList({ conversations, activeId, query, onSelect, onSearch, onCreate, onDelete, onDeleteAll }: ConversationListProps) {
  const t = useT()
  const visible = searchConversations(conversations, query)
  return <section className="list-card" aria-label={t('taby.conversations')}>
    <div className="view-heading"><div><strong>{t('taby.conversations')}</strong><p className="muted">{t('taby.localOnly')}</p></div><div className="heading-actions"><button className="primary" onClick={onCreate}>{t('taby.newConversation')}</button>{conversations.length > 0 && <button className="outline" onClick={onDeleteAll}>{t('taby.deleteAll')}</button>}</div></div>
    <input type="search" value={query} aria-label={t('taby.searchLabel')} placeholder={t('taby.searchPlaceholder')} onChange={(event) => onSearch(event.target.value)} />
    {conversations.length === 0 && <p className="muted">{t('taby.empty')}</p>}
    {conversations.length > 0 && visible.length === 0 && <p className="muted">{t('taby.noMatches')}</p>}
    <ul>{visible.map((conversation) => <li key={conversation.id}><button className="task-row" aria-current={conversation.id === activeId ? 'true' : undefined} onClick={() => onSelect(conversation.id)}>{conversation.title}</button><button className="outline" aria-label={`${t('taby.delete')}: ${conversation.title}`} onClick={() => onDelete(conversation.id)}>×</button></li>)}</ul>
  </section>
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `rtk proxy npx vitest run src/ui/__tests__/ConversationList.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/ConversationList.tsx src/ui/__tests__/ConversationList.test.tsx
git commit -m "feat: render the saved conversation list

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: One owner for the thread, mounted above both surfaces

**Files:**
- Create: `src/ui/useConversations.ts`
- Test: `src/ui/__tests__/useConversations.test.ts`

The palette calls `turn.ask(...)` at `src/ui/palette/CommandPalette.tsx:110` while `TabyView` is unmounted. Recording inside the screen would drop those questions, so the recorder lives in a hook mounted once in `App.tsx`. `TabyView` today turns terminal transitions of `turn.state` into messages inside a `useEffect` guarded by a `handled` ref; that logic moves here so there is exactly one writer.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest'
import { recordTurn } from '../useConversations'
import { createConversation } from '../../domain/conversations'

const at = (hour: number) => new Date(2026, 8, 11, hour, 0).toISOString()

describe('recordTurn', () => {
  it('starts a conversation on the first question, from any surface', () => {
    const next = recordTurn({ conversations: [], activeId: null }, { role: 'user', text: 'oi', at: at(9) }, 'c-1')
    expect(next.activeId).toBe('c-1')
    expect(next.conversations[0].messages).toHaveLength(1)
  })

  it('appends to the active conversation instead of starting another', () => {
    const state = { conversations: [createConversation('oi', at(9), 'c-1')], activeId: 'c-1' }
    const next = recordTurn(state, { role: 'assistant', text: 'Olá!', at: at(10) }, 'c-2')
    expect(next.conversations).toHaveLength(1)
    expect(next.conversations[0].messages).toHaveLength(2)
    expect(next.activeId).toBe('c-1')
  })

  it('never records the same assistant transition twice', () => {
    const state = { conversations: [createConversation('oi', at(9), 'c-1')], activeId: 'c-1' }
    const message = { role: 'assistant' as const, text: 'Olá!', at: at(10) }
    const once = recordTurn(state, message, 'c-2')
    expect(recordTurn(once, message, 'c-3')).toBe(once)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `rtk proxy npx vitest run src/ui/__tests__/useConversations.test.ts`
Expected: FAIL — `Failed to resolve import "../useConversations"`.

- [ ] **Step 3: Write the pure reducer plus the hook around it**

```ts
import { useCallback, useMemo, useState } from 'react'
import { loadConversations, saveConversations } from '../data/conversation-store'
import { appendMessage, createConversation, type Conversation, type ConversationMessage } from '../domain/conversations'

export type ConversationState = Readonly<{ conversations: readonly Conversation[]; activeId: string | null }>

const sameMessage = (left: ConversationMessage, right: ConversationMessage) =>
  left.role === right.role && left.at === right.at && left.text === right.text

/** Escrita única: a mesma transição chegando duas vezes devolve o estado intocado. */
export function recordTurn(state: ConversationState, message: ConversationMessage, nextId: string): ConversationState {
  const active = state.conversations.find((conversation) => conversation.id === state.activeId)
  if (!active) return { conversations: [createConversation(message.text, message.at, nextId), ...state.conversations], activeId: nextId }
  const last = active.messages[active.messages.length - 1]
  if (last && sameMessage(last, message)) return state
  const updated = appendMessage(active, message)
  return { ...state, conversations: state.conversations.map((conversation) => conversation.id === active.id ? updated : conversation) }
}
```

Then the hook: `useConversations({ storage, onEvent })` holds `ConversationState` seeded with `loadConversations(storage)`, exposes `record(message)`, `select(id)`, `create()`, `remove(id)`, `removeAll()` and `search(query)`, and persists after every mutation. When `saveConversations` returns `false`, call `onEvent('taby', 'conversation', 'fail')` once per conversation (guard with a ref) and expose `saveFailed: true` so the surfaces can show `t('taby.saveFailed')`.

- [ ] **Step 4: Run it and watch it pass**

Run: `rtk proxy npx vitest run src/ui/__tests__/useConversations.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/useConversations.ts src/ui/__tests__/useConversations.test.ts
git commit -m "feat: own the conversation thread above both Taby surfaces

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: Wire TabyView, the palette and App

**Files:**
- Modify: `src/ui/TabyView.tsx`, `src/App.tsx`
- Test: `src/ui/__tests__/TabyView.test.tsx` (create if absent)

Read `src/ui/TabyView.tsx` fully first: the whole view is one dense JSX expression and the message list is rebuilt from `turn.state`. Keep that structure; do not reformat.

- [ ] **Step 1: Write the failing test**

```tsx
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createSeedData } from '../../data/seed-data'
import { appendMessage, createConversation } from '../../domain/conversations'
import { LocaleProvider } from '../../i18n/LocaleProvider'
import { TabyView } from '../TabyView'

const at = (hour: number) => new Date(2026, 8, 11, hour, 0).toISOString()
const noop = () => undefined
const idleTurn = { state: { status: 'idle' as const }, ask: async () => undefined, confirm: async () => undefined, cancelConfirmation: async () => undefined, stop: noop, retry: async () => undefined, useLocalFallback: async () => undefined, dismiss: () => 'none' as const, reset: noop }
const host = { storage: { getItem: () => null, setItem: noop } }
const saved = [appendMessage(createConversation('agenda da semana', at(9), 'c-1'), { role: 'assistant', text: 'Reunião com Kabrito', at: at(9) })]

const conversations = { conversations: saved, activeId: 'c-1', query: '', saveFailed: false, record: noop, select: noop, create: noop, remove: noop, removeAll: noop, search: noop }

describe('TabyView', () => {
  it('renders the conversations it is given', () => {
    const markup = renderToStaticMarkup(
      <LocaleProvider initialLanguage="pt" host={host}>
        <TabyView data={createSeedData()} turn={idleTurn} conversations={conversations} />
      </LocaleProvider>,
    )
    expect(markup).toContain('agenda da semana')
    expect(markup).toContain('Conversas')
  })

  it('greets through the dictionary instead of a hardcoded string', () => {
    const source = readFileSync(new URL('../TabyView.tsx', import.meta.url), 'utf8')
    expect(source).not.toContain('Olá! Sou o assistente local do Hibi')
    expect(source).toContain("t('taby.greeting')")
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `rtk proxy npx vitest run src/ui/__tests__/TabyView.test.tsx`
Expected: FAIL — `TabyView` does not accept `conversations`, and the greeting is still hardcoded.

- [ ] **Step 3: Implement**

1. `TabyView` takes `conversations: ReturnType<typeof useConversations>` as a prop, renders `<ConversationList …/>` beside the thread, and shows `t('taby.saveFailed')` when `conversations.saveFailed`.
2. `const t = useT()`; the hardcoded greeting becomes `t('taby.greeting')`.
3. The thread shown is the active conversation's messages; the local `messages` state and its `handled` ref are deleted, since `useConversations` is now the single writer.
4. In `src/App.tsx`, mount the hook once and pass it to both surfaces:

```tsx
  const conversations = useConversations({ onEvent: log });
```

```tsx
      case 'taby': return <TabyView data={data} turn={assistantTurn} conversations={conversations} />;
```

```tsx
      {paletteOpen && <CommandPalette data={data} onClose={() => setPaletteOpen(false)} onNavigate={(next, options) => { setPaletteOpen(false); navigate(next, 'command', options); }} onEvent={log} onRenameFolder={renameFolder} turn={assistantTurn} conversations={conversations} />}
```

5. In `src/ui/palette/CommandPalette.tsx`, accept `conversations` and call `conversations.record({ role: 'user', text: message, at: new Date().toISOString() })` inside `send` (line 110), so a question asked at `⌘K` lands in the same thread. Record assistant transitions from the hook, not from the palette.

- [ ] **Step 4: Run it and watch it pass**

Run: `rtk proxy npx vitest run src/ui/__tests__/TabyView.test.tsx src/ui/__tests__/palette.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `rtk proxy npm test` then `npx tsc --noEmit`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/ui/TabyView.tsx src/ui/palette/CommandPalette.tsx src/App.tsx src/ui/__tests__/TabyView.test.tsx
git commit -m "feat: record Taby conversations from the screen and the palette

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 10: End-to-end round trip

**Files:**
- Create: `tests/e2e/taby-conversations.spec.ts`

- [ ] **Step 1: Write the test**

```ts
import { test, expect } from '@playwright/test';

test('uma conversa do Taby sobrevive ao recarregar e pode ser apagada', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: 'Taby', exact: true }).click();
  await page.getByRole('textbox', { name: 'Pergunte ou peça uma ação' }).fill('quais tarefas vencem hoje?');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Conversas' })).toContainText('quais tarefas vencem hoje?');

  await page.reload();
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: 'Taby', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Conversas' })).toContainText('quais tarefas vencem hoje?');

  await page.keyboard.press('Meta+K');
  await page.getByRole('dialog', { name: 'Paleta de comandos' }).getByRole('combobox').fill('e amanhã?');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'Conversas' })).toContainText('quais tarefas vencem hoje?');

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Apagar todas', exact: true }).click();
  await expect(page.getByText('Nenhuma conversa salva ainda.')).toBeVisible();
});
```

- [ ] **Step 2: Run it**

Run: `rtk proxy npx playwright test tests/e2e/taby-conversations.spec.ts`
Expected: PASS. If the assistant reply takes longer than the default timeout, assert on the user's own message only — it is written to the conversation before the model answers.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/taby-conversations.spec.ts
git commit -m "test: verify a conversation survives a reload

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 11: Full gate and documentation

- [ ] **Step 1: Run every gate**

```bash
rtk proxy npm test
npx tsc --noEmit
npm run build
rtk proxy npx playwright test
```

Expected: all pass. Record the exact counts.

- [ ] **Step 2: Update the status document**

In `docs/IMPLEMENTATION_STATUS_AND_PLAN.md`: tick item 2 of Fase 5; move "Tela de chats do Taby" out of the "Falta" table into "Já coberto", stating that conversations stay on the machine and are not in the backup; refresh the header battery counts.

- [ ] **Step 3: Commit**

```bash
git add docs/IMPLEMENTATION_STATUS_AND_PLAN.md
git commit -m "docs: record saved Taby conversations

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
