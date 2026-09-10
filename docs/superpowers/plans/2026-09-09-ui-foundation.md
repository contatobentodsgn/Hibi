# Nova UI — Fundação (sub-projeto 1) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a base da nova interface — tokens claro/escuro, i18n real `pt`/`en`, shell sem moldura com dock, e paleta `⌘K` unificada com o Taby — mantendo todas as 16 rotas, o runtime do assistente, o notch e as integrações funcionando exatamente como hoje.

**Architecture:** Camadas novas e pequenas (`tokens.css` + `theme.ts`, `src/i18n/`, `src/ui/shell/`, `src/ai/assistant-turn.ts` + `useAssistantTurn`, `src/ui/palette/`) entram por baixo e por fora das telas existentes; as telas não são tocadas. O `theme.css` antigo continua importado e suas 8 variáveis viram aliases dos tokens, então as telas antigas ganham escuro parcial sem edição. A lógica do assistente vira um reducer puro consumido por dois hosts (página Taby e paleta).

**Tech Stack:** React 19, TypeScript 7, Vite 8, Vitest 5 (sem DOM: `renderToStaticMarkup` e funções puras), Playwright 1.63, Electron 44, `node:test` para o processo principal.

**Branch:** `feat/ui-foundation`, worktree `.worktrees/ui-foundation`, baseada em `feat/ai-production-integrations` (PR #1). Spec: [`docs/superpowers/specs/2026-09-09-ui-foundation-design.md`](../specs/2026-09-09-ui-foundation-design.md).

**Gate de cada task:** `npm test && npx tsc --noEmit && npx vite build && npx playwright test` verdes antes do commit. Playwright sobe o dev server sozinho (`playwright.config.ts`).

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `src/ui/tokens.css` (novo) | Tokens semânticos, valores claro/escuro, aliases das 8 variáveis antigas |
| `src/ui/theme.ts` (novo) | Preferência de tema: resolver, ler, aplicar, escutar o sistema (puro, testável) |
| `src/ui/theme-context.tsx` (novo) | `ThemeProvider` + `useThemePreference()` |
| `src/ui/__tests__/tokens.test.ts` (novo) | Paridade claro/escuro e contraste WCAG AA |
| `src/ui/__tests__/theme.test.ts` (novo) | `resolveTheme`, persistência, escuta do sistema |
| `src/i18n/dictionary.ts` (novo) | `pt` (fonte) e `en` tipado por `keyof typeof pt` |
| `src/i18n/format.ts` (novo) | `formatTime`, `formatDate`, `formatRange`, `formatWeekday` puros |
| `src/i18n/LocaleProvider.tsx` (novo) | Contexto: `useT()`, `useLocale()`, `useFormat()`; persiste `hibi-language` |
| `src/i18n/__tests__/format.test.ts`, `dictionary.test.ts` (novos) | Formatação por locale/hora; cobertura de chaves |
| `src/ai/assistant-turn.ts` (novo) | Reducer puro do turno do assistente e `dismissIntent` |
| `src/ai/__tests__/assistant-turn.test.ts` (novo) | Transições do reducer |
| `src/ui/useAssistantTurn.ts` (novo) | Hook que liga o reducer ao `AiTurnRuntime` e ao companion |
| `src/ui/TabyView.tsx` (modificado) | Passa a usar o hook; markup e comportamento inalterados |
| `src/ui/shell/routes.ts` (novo) | `NavKey`, `DOCK_ITEMS`, `MORE_ITEMS`, `isAgendaRoute` |
| `src/ui/shell/Dock.tsx` (novo) | Dock flutuante, menu `···`, botão `⌘K` |
| `src/ui/shell/AppShell.tsx` (novo) | Faixa do topo, região de conteúdo, `Dock` |
| `src/ui/shell/shell.css` (novo) | Estilos do shell em tokens |
| `src/ui/AgendaView.tsx` (novo) | Dia/Semana com alternância persistida em `hibi-agenda-view` |
| `src/ui/AppShell.tsx` (removido) | Substituído por `shell/AppShell.tsx` |
| `src/ui/palette/mode.ts` (novo) | `paletteModeFor(input)` |
| `src/ui/palette/commands.ts` (novo) | Lista de comandos (chaves do dicionário) |
| `src/ui/palette/CommandPalette.tsx` (novo) | Paleta unificada |
| `src/ui/palette/palette.css` (novo) | Estilos da paleta em tokens |
| `src/ui/CommandPalette.tsx` (removido) | Substituído por `palette/CommandPalette.tsx` |
| `src/App.tsx` (modificado) | Usa shell novo, `agenda`, paleta nova, provedores |
| `src/main.tsx` (modificado) | Importa `tokens.css`; envolve com `ThemeProvider` e `LocaleProvider` |
| `src/ui/SettingsView.tsx` (modificado) | Idioma vem do contexto; seletor de tema |
| `electron/main.cjs` (modificado) | `titleBarStyle: 'hiddenInset'` |
| `src/ui/__tests__/data-bound-views.test.tsx` (modificado) | Teste do shell antigo aponta para o dock |
| `tests/e2e/smoke.spec.ts` (modificado) | Navegação pelo dock em `pt` |
| `tests/e2e/integrations-*.spec.ts`, `connector-import.spec.ts` (modificados) | Helper `openIntegrations` pelo dock |
| `tests/e2e/foundation.spec.ts` (novo) | Dock, paleta+Taby, tema, idioma, agenda |

---

## Task 1: Tokens semânticos e mecanismo de tema

**Files:**
- Create: `src/ui/tokens.css`
- Create: `src/ui/theme.ts`
- Create: `src/ui/theme-context.tsx`
- Create: `src/ui/__tests__/tokens.test.ts`
- Create: `src/ui/__tests__/theme.test.ts`
- Modify: `src/main.tsx`

- [ ] **Step 1: Escrever o teste de tokens (falha: arquivo não existe)**

Crie `src/ui/__tests__/tokens.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../tokens.css', import.meta.url), 'utf8')

const block = (selector: string): Record<string, string> => {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`Bloco não encontrado: ${selector}`)
  const body = css.slice(start, css.indexOf('}', start))
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((match) => [match[1]!, match[2]!.trim()]))
}

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255).map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}
export const contrastRatio = (foreground: string, background: string) => {
  const [high, low] = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return (high! + 0.05) / (low! + 0.05)
}

const light = block(':root')
const dark = block(':root[data-theme="dark"]')
const semantic = Object.keys(light).filter((name) => /^--(bg|text|stroke|accent|cat|depth)-/.test(name))
const textTokens = ['--text-primary', '--text-secondary', '--text-tertiary']
const surfaceTokens = ['--bg-canvas', '--bg-surface-1', '--bg-surface-2', '--bg-surface-3']

describe('tokens.css', () => {
  it('define todo token semântico nos dois temas', () => {
    expect(semantic.length).toBeGreaterThan(20)
    for (const name of semantic) expect(dark, `${name} falta no escuro`).toHaveProperty(name)
  })

  it('usa hex de 6 dígitos nas cores de texto e fundo', () => {
    for (const theme of [light, dark]) for (const name of [...textTokens, ...surfaceTokens, '--accent', '--text-on-accent']) expect(theme[name]).toMatch(/^#[0-9a-f]{6}$/)
  })

  it.each([['claro', light], ['escuro', dark]])('atinge WCAG AA (4.5:1) para texto sobre superfícies no tema %s', (_label, theme) => {
    for (const text of textTokens) for (const surface of surfaceTokens) {
      expect(contrastRatio(theme[text]!, theme[surface]!), `${text} sobre ${surface}`).toBeGreaterThanOrEqual(4.5)
    }
    expect(contrastRatio(theme['--text-on-accent']!, theme['--accent']!), 'texto sobre acento').toBeGreaterThanOrEqual(4.5)
  })

  it('mantém as 8 variáveis antigas como aliases dos tokens', () => {
    const aliases = block(':root /* aliases */')
    expect(aliases['--paper']).toBe('var(--bg-canvas)')
    expect(aliases['--ink']).toBe('var(--text-primary)')
    expect(aliases['--muted']).toBe('var(--text-secondary)')
    expect(aliases['--line']).toBe('var(--stroke-default)')
    expect(aliases['--orange']).toBe('var(--accent)')
    expect(aliases['--green']).toBe('var(--cat-break-soft)')
    expect(aliases['--blue']).toBe('var(--cat-learning-soft)')
    expect(aliases['--amber']).toBe('var(--cat-important-soft)')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/ui/__tests__/tokens.test.ts --reporter=basic`
Expected: FAIL — `ENOENT ... tokens.css`.

- [ ] **Step 3: Criar `src/ui/tokens.css`**

```css
/* Tokens semânticos do Hibi. O claro é o padrão; o escuro sobrescreve em [data-theme="dark"].
   Nomes seguem o vocabulário do Bento Pro (Backgrounds/Text/Stroke/Depth); os valores são os do papel. */

:root {
  color-scheme: light;

  --font-serif: Georgia, "Times New Roman", serif;
  --font-sans: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono: ui-monospace, "SF Mono", Menlo, monospace;

  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-5: 20px; --space-6: 24px; --space-7: 28px; --space-8: 32px;
  --space-9: 36px; --space-10: 40px; --space-11: 44px; --space-12: 48px;

  --radius-1: 8px; --radius-2: 12px; --radius-3: 16px; --radius-4: 24px;

  --type-12: 12px; --leading-12: 16px;
  --type-14: 14px; --leading-14: 20px;
  --type-16: 16px; --leading-16: 24px;
  --type-20: 20px; --leading-20: 24px;
  --type-24: 24px; --leading-24: 28px;
  --type-32: 32px; --leading-32: 40px;
  --type-40: 40px; --leading-40: 48px;
  --type-48: 48px; --leading-48: 56px;

  --bg-canvas: #f3f2ef;
  --bg-surface-1: #ffffff;
  --bg-surface-2: #faf9f6;
  --bg-surface-3: #ebe9e3;
  --bg-subtle: #e6e3dc;
  --bg-highlight: #fff4dd;

  --text-primary: #151515;
  --text-secondary: #5f5c56;
  --text-tertiary: #6a675f;
  --text-hero: #c4520f;      /* só para display ≥ 24px: 4.1:1 no canvas, AA para texto grande */
  --text-on-accent: #151515; /* branco sobre o laranja fica em 2.8:1; tinta fica em 6.5:1 */

  --stroke-subtle: #ebe9e5;
  --stroke-default: #dedbd4;
  --stroke-focus: #fb7017;

  --accent: #fb7017;
  --accent-soft: #ffe0ca;

  --cat-work: #fb7017;      --cat-work-soft: #ffe0ca;      --cat-work-text: #99400e;
  --cat-break: #3e8752;     --cat-break-soft: #b9e7bd;     --cat-break-text: #276c3f;
  --cat-learning: #365f78;  --cat-learning-soft: #c9def0;  --cat-learning-text: #365f78;
  --cat-important: #b8861f; --cat-important-soft: #f2c26b; --cat-important-text: #8c5d08;
  --cat-wellbeing: #3e8752; --cat-wellbeing-soft: #d8f0da; --cat-wellbeing-text: #276c3f;

  --depth-card: 0 1px 2px rgba(20, 18, 14, 0.06);
  --depth-float: 0 24px 60px rgba(0, 0, 0, 0.28);
}

:root[data-theme="dark"] {
  color-scheme: dark;

  --bg-canvas: #1a1917;
  --bg-surface-1: #232220;
  --bg-surface-2: #2a2926;
  --bg-surface-3: #33312c;
  --bg-subtle: #2d2b27;
  --bg-highlight: #3a2f1a;

  --text-primary: #f1efe9;
  --text-secondary: #b5b0a6;
  --text-tertiary: #a19c92;
  --text-hero: #ff8a45;
  --text-on-accent: #151515;

  --stroke-subtle: #2d2b27;
  --stroke-default: #3a3833;
  --stroke-focus: #ff8a45;

  --accent: #fb7017;
  --accent-soft: #3a2416;

  --cat-work: #ff8a45;      --cat-work-soft: #3a2416;      --cat-work-text: #ffb287;
  --cat-break: #7fd493;     --cat-break-soft: #1f3a26;     --cat-break-text: #b9e7bd;
  --cat-learning: #8fb8d6;  --cat-learning-soft: #1f2f3a;  --cat-learning-text: #c9def0;
  --cat-important: #f2c26b; --cat-important-soft: #3a2e12; --cat-important-text: #ffe9ba;
  --cat-wellbeing: #7fd493; --cat-wellbeing-soft: #1f3a26; --cat-wellbeing-text: #d8f0da;

  --depth-card: 0 1px 2px rgba(0, 0, 0, 0.4);
  --depth-float: 0 24px 60px rgba(0, 0, 0, 0.6);
}

/* Ponte com theme.css: as 8 variáveis antigas seguem os tokens. Este arquivo é importado
   depois de theme.css, então estas definições vencem as de lá. Some quando a última tela migrar. */
:root /* aliases */ {
  --paper: var(--bg-canvas);
  --ink: var(--text-primary);
  --muted: var(--text-secondary);
  --line: var(--stroke-default);
  --orange: var(--accent);
  --green: var(--cat-break-soft);
  --blue: var(--cat-learning-soft);
  --amber: var(--cat-important-soft);
}
```

- [ ] **Step 4: Rodar o teste de tokens (passa)**

Run: `npx vitest run src/ui/__tests__/tokens.test.ts --reporter=basic`
Expected: 4 passed. Se o contraste falhar, escureça o token de texto que falhou (nunca clareie o fundo).

- [ ] **Step 5: Escrever o teste de tema (falha: módulo não existe)**

Crie `src/ui/__tests__/theme.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { applyThemePreference, readThemePreference, resolveTheme, THEME_STORAGE_KEY, type ThemeHost } from '../theme'

const host = (systemPrefersDark: boolean, stored: string | null = null): ThemeHost & { attributes: Record<string, string>; listeners: Array<(event: { matches: boolean }) => void>; store: Map<string, string> } => {
  const store = new Map<string, string>(stored === null ? [] : [[THEME_STORAGE_KEY, stored]])
  const attributes: Record<string, string> = {}
  const listeners: Array<(event: { matches: boolean }) => void> = []
  return {
    store, attributes, listeners,
    storage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => { store.set(key, value) } },
    root: { setAttribute: (name, value) => { attributes[name] = value } },
    media: { matches: systemPrefersDark, addEventListener: (_type, listener) => { listeners.push(listener) }, removeEventListener: (_type, listener) => { listeners.splice(listeners.indexOf(listener), 1) } },
  }
}

describe('tema', () => {
  it('resolve system pelo sistema e manual por si', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('light', true)).toBe('light')
  })

  it('lê a preferência guardada e cai em system para valores inválidos', () => {
    expect(readThemePreference(host(false, 'dark').storage)).toBe('dark')
    expect(readThemePreference(host(false, 'azul').storage)).toBe('system')
    expect(readThemePreference(host(false).storage)).toBe('system')
  })

  it('aplica o atributo, persiste e segue o sistema enquanto for system', () => {
    const fake = host(false)
    const stop = applyThemePreference('system', fake)
    expect(fake.attributes['data-theme']).toBe('light')
    expect(fake.store.get(THEME_STORAGE_KEY)).toBe('system')
    fake.listeners[0]!({ matches: true })
    expect(fake.attributes['data-theme']).toBe('dark')
    stop()
    expect(fake.listeners).toHaveLength(0)
  })

  it('não escuta o sistema quando a escolha é manual', () => {
    const fake = host(true)
    applyThemePreference('light', fake)
    expect(fake.attributes['data-theme']).toBe('light')
    expect(fake.listeners).toHaveLength(0)
  })
})
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `npx vitest run src/ui/__tests__/theme.test.ts --reporter=basic`
Expected: FAIL — `Cannot find module '../theme'`.

- [ ] **Step 7: Criar `src/ui/theme.ts`**

```ts
export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'hibi-theme'
export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark']

export type ThemeHost = Readonly<{
  storage: Pick<Storage, 'getItem' | 'setItem'>
  root: { setAttribute(name: string, value: string): void }
  media: { matches: boolean; addEventListener(type: 'change', listener: (event: { matches: boolean }) => void): void; removeEventListener(type: 'change', listener: (event: { matches: boolean }) => void): void }
}>

export const isThemePreference = (value: unknown): value is ThemePreference => value === 'system' || value === 'light' || value === 'dark'

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light'
  return preference
}

export function readThemePreference(storage: Pick<Storage, 'getItem'>): ThemePreference {
  try { const saved = storage.getItem(THEME_STORAGE_KEY); return isThemePreference(saved) ? saved : 'system' } catch { return 'system' }
}

// Aplica o tema agora e, em `system`, segue o sistema até a função devolvida ser chamada.
export function applyThemePreference(preference: ThemePreference, host: ThemeHost): () => void {
  try { host.storage.setItem(THEME_STORAGE_KEY, preference) } catch { /* armazenamento indisponível */ }
  host.root.setAttribute('data-theme', resolveTheme(preference, host.media.matches))
  if (preference !== 'system') return () => undefined
  const listener = (event: { matches: boolean }) => host.root.setAttribute('data-theme', resolveTheme('system', event.matches))
  host.media.addEventListener('change', listener)
  return () => host.media.removeEventListener('change', listener)
}

export const browserThemeHost = (): ThemeHost => ({
  storage: window.localStorage,
  root: document.documentElement,
  media: window.matchMedia('(prefers-color-scheme: dark)'),
})
```

- [ ] **Step 8: Rodar o teste de tema (passa)**

Run: `npx vitest run src/ui/__tests__/theme.test.ts --reporter=basic`
Expected: 4 passed.

- [ ] **Step 9: Criar `src/ui/theme-context.tsx`**

```tsx
import React, { createContext, useContext, useEffect, useState } from 'react'
import { applyThemePreference, browserThemeHost, readThemePreference, type ThemePreference } from './theme'

type ThemeContextValue = Readonly<{ preference: ThemePreference; setPreference: (preference: ThemePreference) => void }>
const ThemeContext = createContext<ThemeContextValue>({ preference: 'system', setPreference: () => undefined })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(() => readThemePreference(window.localStorage))
  useEffect(() => applyThemePreference(preference, browserThemeHost()), [preference])
  return <ThemeContext.Provider value={{ preference, setPreference }}>{children}</ThemeContext.Provider>
}

export const useThemePreference = () => useContext(ThemeContext)
```

- [ ] **Step 10: Importar tokens e envolver o App em `src/main.tsx`**

Substitua o conteúdo de `src/main.tsx` por:

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './theme.css';
import './ui/tokens.css';
import { NotchOverlay } from './ui/NotchOverlay';
import { ThemeProvider } from './ui/theme-context';

const root = document.getElementById('root');

if (!root) throw new Error('Hibi renderer root was not found');

const isNotchOverlay = new URLSearchParams(window.location.search).get('overlay') === 'notch';
createRoot(root).render(
  <React.StrictMode>
    <ThemeProvider>{isNotchOverlay ? <NotchOverlay /> : <App />}</ThemeProvider>
  </React.StrictMode>,
);
```

Observação: `./theme.css` (raiz) importa `./ui/theme.css`; `tokens.css` precisa vir **depois** para os aliases vencerem.

`src/ui/notch-overlay.css` **não muda**: o overlay flutua sobre o notch físico, que é preto em qualquer tema, e suas cores fixas são deliberadas. Ligá-lo aos tokens o faria clarear no tema claro. Isso diverge da frase da spec ("passa a consumir tokens") de propósito; a spec foi corrigida junto com este plano.

- [ ] **Step 11: Gate e commit**

Run: `npm test && npx tsc --noEmit && npx vite build && npx playwright test`
Expected: tudo verde; visualmente nada muda no claro.

```bash
git add src/ui/tokens.css src/ui/theme.ts src/ui/theme-context.tsx src/ui/__tests__/tokens.test.ts src/ui/__tests__/theme.test.ts src/main.tsx
git commit -m "feat(ui): adicionar tokens semânticos claro/escuro e preferência de tema"
```

---

## Task 2: i18n — dicionário tipado, formatação e provedor

**Files:**
- Create: `src/i18n/dictionary.ts`
- Create: `src/i18n/format.ts`
- Create: `src/i18n/LocaleProvider.tsx`
- Create: `src/i18n/__tests__/dictionary.test.ts`
- Create: `src/i18n/__tests__/format.test.ts`
- Modify: `src/main.tsx`
- Modify: `src/ui/SettingsView.tsx:63`, `:69`, e o trecho `<Setting title="Language"` … `<Setting title="Time format"`

- [ ] **Step 1: Escrever o teste de formatação (falha: módulo não existe)**

Crie `src/i18n/__tests__/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatDate, formatRange, formatTime, formatWeekday } from '../format'

const at = '2026-09-07T09:00:00-03:00'
const end = '2026-09-07T10:30:00-03:00'

describe('formatação por locale', () => {
  it('formata hora em 24h e 12h', () => {
    expect(formatTime(at, { locale: 'pt', twentyFourHour: true })).toBe('09:00')
    expect(formatTime(at, { locale: 'en', twentyFourHour: false })).toBe('9:00 AM')
    expect(formatTime(at, { locale: 'en', twentyFourHour: true })).toBe('09:00')
  })

  it('formata data longa no idioma certo', () => {
    expect(formatDate(at, { locale: 'pt', twentyFourHour: true })).toBe('segunda-feira, 7 de setembro de 2026')
    expect(formatDate(at, { locale: 'en', twentyFourHour: true })).toBe('Monday, September 7, 2026')
  })

  it('formata dia da semana curto', () => {
    expect(formatWeekday(at, { locale: 'pt', twentyFourHour: true })).toBe('seg.')
    expect(formatWeekday(at, { locale: 'en', twentyFourHour: true })).toBe('Mon')
  })

  it('formata intervalos com o mesmo relógio', () => {
    expect(formatRange(at, end, { locale: 'pt', twentyFourHour: true })).toBe('09:00 – 10:30')
    expect(formatRange(at, end, { locale: 'en', twentyFourHour: false })).toBe('9:00 AM – 10:30 AM')
  })

  it('respeita o fuso fixo do workspace, não o da máquina', () => {
    expect(formatTime('2026-09-07T12:00:00Z', { locale: 'pt', twentyFourHour: true })).toBe('09:00')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/i18n/__tests__/format.test.ts --reporter=basic`
Expected: FAIL — `Cannot find module '../format'`.

- [ ] **Step 3: Criar `src/i18n/format.ts`**

```ts
export type Locale = 'pt' | 'en'
export type FormatOptions = Readonly<{ locale: Locale; twentyFourHour: boolean }>

// O workspace inteiro usa o deslocamento -03:00 (ver OFFSET em DayView/WeekView).
export const HIBI_TIME_ZONE = 'America/Sao_Paulo'

const tagFor = (locale: Locale) => locale === 'pt' ? 'pt-BR' : 'en-US'
const clock = (options: FormatOptions): Intl.DateTimeFormatOptions => ({ hour: options.twentyFourHour ? '2-digit' : 'numeric', minute: '2-digit', hourCycle: options.twentyFourHour ? 'h23' : 'h12', timeZone: HIBI_TIME_ZONE })

export const formatTime = (iso: string, options: FormatOptions) => new Intl.DateTimeFormat(tagFor(options.locale), clock(options)).format(new Date(iso))

export const formatDate = (iso: string, options: FormatOptions) => new Intl.DateTimeFormat(tagFor(options.locale), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: HIBI_TIME_ZONE }).format(new Date(iso))

export const formatWeekday = (iso: string, options: FormatOptions) => new Intl.DateTimeFormat(tagFor(options.locale), { weekday: 'short', timeZone: HIBI_TIME_ZONE }).format(new Date(iso))

export const formatRange = (startIso: string, endIso: string, options: FormatOptions) => `${formatTime(startIso, options)} – ${formatTime(endIso, options)}`
```

- [ ] **Step 4: Rodar o teste de formatação (passa)**

Run: `npx vitest run src/i18n/__tests__/format.test.ts --reporter=basic`
Expected: 5 passed. Se `seg.`/`Mon` divergirem por versão do ICU, ajuste a asserção para o valor real de `Intl` — o objetivo é o locale, não a abreviação.

- [ ] **Step 5: Escrever o teste do dicionário (falha: módulo não existe)**

Crie `src/i18n/__tests__/dictionary.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { dictionary, translate } from '../dictionary'

describe('dicionário', () => {
  it('tem as mesmas chaves em pt e en, sem strings vazias', () => {
    const pt = Object.keys(dictionary.pt).sort()
    const en = Object.keys(dictionary.en).sort()
    expect(en).toEqual(pt)
    for (const locale of ['pt', 'en'] as const) for (const [key, value] of Object.entries(dictionary[locale])) expect(value, `${locale}.${key}`).not.toBe('')
  })

  it('traduz pelo locale e usa pt como padrão', () => {
    expect(translate('pt', 'nav.tasks')).toBe('Tarefas')
    expect(translate('en', 'nav.tasks')).toBe('Tasks')
    expect(translate('pt', 'palette.title')).toBe('Paleta de comandos')
  })
})
```

- [ ] **Step 6: Criar `src/i18n/dictionary.ts`**

```ts
import type { Locale } from './format'

// `pt` é a fonte de verdade. `en` é tipado pelas chaves de `pt`: chave faltando falha no tsc.
const pt = {
  'nav.home': 'Home',
  'nav.tasks': 'Tarefas',
  'nav.agenda': 'Agenda',
  'nav.focus': 'Foco',
  'nav.taby': 'Taby',
  'nav.reminders': 'Lembretes',
  'nav.notes': 'Notas',
  'nav.habits': 'Hábitos',
  'nav.goals': 'Metas',
  'nav.review': 'Revisão',
  'nav.settings': 'Ajustes',
  'nav.help': 'Ajuda',
  'nav.instrumentation': 'Eventos',
  'nav.feedback': 'Feedback',
  'nav.updates': 'Atualizações',
  'nav.hardware': 'Hardware',

  'shell.brand': 'HIBI',
  'shell.navigation': 'Navegação principal',
  'shell.more': 'Mais seções',
  'shell.moreButton': 'Mais',
  'shell.commands': 'Comandos',
  'shell.commandsHint': '⌘K',

  'agenda.day': 'Dia',
  'agenda.week': 'Semana',
  'agenda.toggle': 'Visualização da agenda',

  'palette.title': 'Paleta de comandos',
  'palette.placeholder': 'Digite um comando ou pergunte ao Taby',
  'palette.empty': 'Nenhum comando encontrado. Tente /semana ou /foco.',
  'palette.group.navigate': 'Navegar',
  'palette.group.work': 'Trabalho',
  'palette.group.system': 'Sistema',
  'palette.footer.select': '↑↓ selecionar',
  'palette.footer.open': '↵ abrir',
  'palette.footer.ask': '↵ perguntar',
  'palette.footer.confirm': '↵ confirmar',
  'palette.footer.cancel': 'esc cancelar',
  'palette.footer.close': 'esc fechar',
  'palette.taby': 'taby',
  'palette.you': 'você',
  'palette.thinking': 'Gerando resposta…',
  'palette.cancelling': 'Cancelando…',
  'palette.stop': 'Parar',
  'palette.confirm': 'Confirmar',
  'palette.cancel': 'Cancelar',
  'palette.confirmHint': 'Confirme para continuar.',
  'palette.confirmation': 'confirmação',
  'palette.retry': 'Tentar novamente',
  'palette.useLocal': 'Usar assistente local',

  'command.day': 'Abrir agenda de hoje',
  'command.week': 'Abrir agenda da semana',
  'command.tasks': 'Ver tarefas',
  'command.reminders': 'Ver lembretes',
  'command.habits': 'Acompanhar hábitos',
  'command.goals': 'Revisar metas',
  'command.notes': 'Ver notas',
  'command.review': 'Revisar o workspace',
  'command.stats': 'Abrir estatísticas do workspace',
  'command.taby': 'Abrir o assistente local',
  'command.help': 'Mostrar todos os comandos',
  'command.feedback': 'Guardar feedback localmente',
  'command.bug': 'Reportar um bug localmente',
  'command.idea': 'Sugerir uma ideia localmente',
  'command.focus': 'Iniciar uma sessão de foco',
  'command.settings': 'Abrir ajustes',
  'command.tools': 'Abrir ferramentas locais e integrações',
  'command.events': 'Inspecionar instrumentação',
  'command.updates': 'Verificar atualizações',
  'command.hardware': 'Inspecionar superfícies de hardware',

  'settings.language.title': 'Idioma',
  'settings.language.detail': 'Idioma da interface',
  'settings.theme.title': 'Tema',
  'settings.theme.detail': 'Seguir o sistema ou escolher claro/escuro',
  'settings.theme.system': 'Sistema',
  'settings.theme.light': 'Claro',
  'settings.theme.dark': 'Escuro',
} as const

export type DictionaryKey = keyof typeof pt

const en: Record<DictionaryKey, string> = {
  'nav.home': 'Home',
  'nav.tasks': 'Tasks',
  'nav.agenda': 'Agenda',
  'nav.focus': 'Focus',
  'nav.taby': 'Taby',
  'nav.reminders': 'Reminders',
  'nav.notes': 'Notes',
  'nav.habits': 'Habits',
  'nav.goals': 'Goals',
  'nav.review': 'Review',
  'nav.settings': 'Settings',
  'nav.help': 'Help',
  'nav.instrumentation': 'Events',
  'nav.feedback': 'Feedback',
  'nav.updates': 'Updates',
  'nav.hardware': 'Hardware',

  'shell.brand': 'HIBI',
  'shell.navigation': 'Primary navigation',
  'shell.more': 'More sections',
  'shell.moreButton': 'More',
  'shell.commands': 'Commands',
  'shell.commandsHint': '⌘K',

  'agenda.day': 'Day',
  'agenda.week': 'Week',
  'agenda.toggle': 'Agenda view',

  'palette.title': 'Command palette',
  'palette.placeholder': 'Type a command or ask Taby',
  'palette.empty': 'No command found. Try /week or /focus.',
  'palette.group.navigate': 'Navigate',
  'palette.group.work': 'Work',
  'palette.group.system': 'System',
  'palette.footer.select': '↑↓ select',
  'palette.footer.open': '↵ open',
  'palette.footer.ask': '↵ ask',
  'palette.footer.confirm': '↵ confirm',
  'palette.footer.cancel': 'esc cancel',
  'palette.footer.close': 'esc close',
  'palette.taby': 'taby',
  'palette.you': 'you',
  'palette.thinking': 'Generating reply…',
  'palette.cancelling': 'Cancelling…',
  'palette.stop': 'Stop',
  'palette.confirm': 'Confirm',
  'palette.cancel': 'Cancel',
  'palette.confirmHint': 'Confirm to continue.',
  'palette.confirmation': 'confirmation',
  'palette.retry': 'Try again',
  'palette.useLocal': 'Use local assistant',

  'command.day': 'Open today schedule',
  'command.week': 'Open weekly schedule',
  'command.tasks': 'Browse tasks',
  'command.reminders': 'Browse reminders',
  'command.habits': 'Track habits',
  'command.goals': 'Review goals',
  'command.notes': 'Browse notes',
  'command.review': 'Review workspace',
  'command.stats': 'Open workspace statistics',
  'command.taby': 'Open local assistant',
  'command.help': 'Show all available commands',
  'command.feedback': 'Save feedback locally',
  'command.bug': 'Report a bug locally',
  'command.idea': 'Suggest an idea locally',
  'command.focus': 'Start a focus session',
  'command.settings': 'Open settings',
  'command.tools': 'Open local tools and integrations',
  'command.events': 'Inspect instrumentation',
  'command.updates': 'Check available updates',
  'command.hardware': 'Inspect hardware surfaces',

  'settings.language.title': 'Language',
  'settings.language.detail': 'Interface language',
  'settings.theme.title': 'Theme',
  'settings.theme.detail': 'Follow the system or choose light/dark',
  'settings.theme.system': 'System',
  'settings.theme.light': 'Light',
  'settings.theme.dark': 'Dark',
}

export const dictionary: Record<Locale, Record<DictionaryKey, string>> = { pt, en }

export const translate = (locale: Locale, key: DictionaryKey): string => dictionary[locale][key]
```

- [ ] **Step 7: Rodar o teste do dicionário (passa)**

Run: `npx vitest run src/i18n/__tests__/dictionary.test.ts --reporter=basic`
Expected: 2 passed.

- [ ] **Step 8: Criar `src/i18n/LocaleProvider.tsx`**

```tsx
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { translate, type DictionaryKey } from './dictionary'
import { formatDate, formatRange, formatTime, formatWeekday, type FormatOptions, type Locale } from './format'

export const LANGUAGE_STORAGE_KEY = 'hibi-language'
export const TIME_FORMAT_STORAGE_KEY = 'hibi-twenty-four-hour'

type LocaleContextValue = Readonly<{ language: Locale; setLanguage: (language: Locale) => void }>
const LocaleContext = createContext<LocaleContextValue>({ language: 'pt', setLanguage: () => undefined })

const readLanguage = (): Locale => { try { const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY); return saved === 'en' ? 'en' : 'pt' } catch { return 'pt' } }
const readTwentyFourHour = () => { try { return window.localStorage.getItem(TIME_FORMAT_STORAGE_KEY) !== 'false' } catch { return true } }

export function LocaleProvider({ children, initialLanguage }: { children: React.ReactNode; initialLanguage?: Locale }) {
  const [language, setLanguageState] = useState<Locale>(() => initialLanguage ?? readLanguage())
  const setLanguage = (next: Locale) => { setLanguageState(next); try { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next) } catch { /* armazenamento indisponível */ } }
  useEffect(() => { document.documentElement.lang = language === 'pt' ? 'pt-BR' : 'en' }, [language])
  const value = useMemo(() => ({ language, setLanguage }), [language])
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export const useLocale = () => useContext(LocaleContext)

export function useT() {
  const { language } = useLocale()
  return (key: DictionaryKey) => translate(language, key)
}

// Lê a preferência de 24h a cada render: quem a grava é Ajustes, fora deste contexto.
export function useFormat() {
  const { language } = useLocale()
  const options: FormatOptions = { locale: language, twentyFourHour: readTwentyFourHour() }
  return {
    time: (iso: string) => formatTime(iso, options),
    date: (iso: string) => formatDate(iso, options),
    weekday: (iso: string) => formatWeekday(iso, options),
    range: (start: string, end: string) => formatRange(start, end, options),
  }
}
```

- [ ] **Step 9: Envolver o App com `LocaleProvider` em `src/main.tsx`**

Substitua a linha do `render` por:

```tsx
createRoot(root).render(
  <React.StrictMode>
    <ThemeProvider><LocaleProvider>{isNotchOverlay ? <NotchOverlay /> : <App />}</LocaleProvider></ThemeProvider>
  </React.StrictMode>,
);
```

e adicione o import: `import { LocaleProvider } from './i18n/LocaleProvider';`

- [ ] **Step 10: Ligar o seletor de idioma ao contexto e adicionar o seletor de tema em `src/ui/SettingsView.tsx`**

Adicione aos imports (após a linha 7):

```ts
import { useLocale, useT } from '../i18n/LocaleProvider';
import { useThemePreference } from './theme-context';
import { isThemePreference } from './theme';
```

Substitua a linha 63 (`const [language, setLanguage] = useState<Language>('pt');`) por:

```ts
  const { language, setLanguage } = useLocale();
  const { preference: themePreference, setPreference: setThemePreference } = useThemePreference();
  const t = useT();
```

Substitua a linha 69 inteira (o `useEffect` que lê `savedLanguage` e `savedTimeFormat`) por:

```ts
  useEffect(() => { try { const savedTimeFormat = window.localStorage.getItem(TIME_FORMAT_STORAGE_KEY); if (savedTimeFormat === 'true' || savedTimeFormat === 'false') setTwentyFour(savedTimeFormat === 'true'); } catch { /* unavailable storage */ } }, []);
```

No JSX, substitua exatamente:

```
setLanguage(next); try { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next); } catch { /* unavailable storage */ } onEvent('edit', 'Language', next);
```

por:

```
setLanguage(next); onEvent('edit', 'Language', next);
```

Substitua `<select value={language} onChange` por `<select aria-label="Language" value={language} onChange` — o e2e de idioma localiza o campo por esse nome.

E insira, imediatamente antes de `<Setting title="Time format"`:

```tsx
<Setting title={t('settings.theme.title')} detail={t('settings.theme.detail')}><select aria-label={t('settings.theme.title')} value={themePreference} onChange={(event) => { const next = event.target.value; if (isThemePreference(next)) { setThemePreference(next); onEvent('edit', 'Theme', next); } }}><option value="system">{t('settings.theme.system')}</option><option value="light">{t('settings.theme.light')}</option><option value="dark">{t('settings.theme.dark')}</option></select></Setting>
```

`LANGUAGE_STORAGE_KEY` continua declarado em `SettingsView.tsx` porque `importWorkspace` ainda o grava; isso é redundante com o provedor e inofensivo.

- [ ] **Step 11: Corrigir o teste estático de Settings**

`src/ui/__tests__/data-bound-views.test.tsx` renderiza `<SettingsView>` fora dos provedores; os contextos têm valores padrão, então continua passando. Confirme:

Run: `npx vitest run src/ui/__tests__/data-bound-views.test.tsx --reporter=basic`
Expected: todos passam.

- [ ] **Step 12: Gate e commit**

Run: `npm test && npx tsc --noEmit && npx vite build && npx playwright test`
Expected: verde. O `select` de idioma continua com as mesmas opções; o de tema é novo em Ajustes › General.

```bash
git add src/i18n src/main.tsx src/ui/SettingsView.tsx
git commit -m "feat(i18n): adicionar dicionário tipado pt/en, formatação por locale e seletor de tema"
```

---

## Task 3: Reducer do turno do assistente e hook compartilhado

**Files:**
- Create: `src/ai/assistant-turn.ts`
- Create: `src/ai/__tests__/assistant-turn.test.ts`
- Create: `src/ui/assistant-presentation.ts`
- Create: `src/ui/useAssistantTurn.ts`
- Modify: `src/ui/TabyView.tsx` (reescrito; markup preservado)

- [ ] **Step 1: Escrever o teste do reducer (falha: módulo não existe)**

Crie `src/ai/__tests__/assistant-turn.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { assistantTurnReducer, dismissIntent, initialAssistantTurnState, provenanceLabel, type AssistantTurnState } from '../assistant-turn'

const confirmation = { id: 'c-1', digest: 'd', calls: [{ name: 'task.create', arguments: { title: 'x' } }], expiresAtMs: 10 }
const started = (): AssistantTurnState => assistantTurnReducer(initialAssistantTurnState, { type: 'turn.started', requestId: 'r-1' })

describe('assistantTurnReducer', () => {
  it('acumula o stream do pedido ativo e ignora pedidos antigos', () => {
    let state = started()
    state = assistantTurnReducer(state, { type: 'stream.started', requestId: 'r-1', provider: 'OpenAI-compatible', model: 'gpt-test' })
    state = assistantTurnReducer(state, { type: 'stream.delta', requestId: 'r-1', delta: 'Olá' })
    state = assistantTurnReducer(state, { type: 'stream.delta', requestId: 'r-0', delta: ' antigo' })
    state = assistantTurnReducer(state, { type: 'stream.usage', requestId: 'r-1', totalTokens: 17 })
    expect(state).toEqual({ status: 'streaming', requestId: 'r-1', text: 'Olá', provenance: { provider: 'OpenAI-compatible', model: 'gpt-test', totalTokens: 17 }, cancelRequested: false })
  })

  it('vai para confirmação e só sai dela por executar ou cancelar', () => {
    let state = assistantTurnReducer(started(), { type: 'turn.confirmation', requestId: 'r-1', confirmation, text: 'Confirme.', provenance: {} })
    expect(state.status).toBe('confirmation')
    expect(assistantTurnReducer(state, { type: 'turn.replied', requestId: 'r-1', text: 'x', provenance: {} })).toBe(state)
    state = assistantTurnReducer(state, { type: 'confirmation.executed', requestId: 'r-1', summary: 'Tarefa criada: x', partialFailure: false })
    expect(state).toEqual({ status: 'executed', requestId: 'r-1', summary: 'Tarefa criada: x', partialFailure: false })
  })

  it('registra falha e cancelamento apenas do pedido ativo', () => {
    const failure = { code: 'rate_limited' as const, retryable: true }
    expect(assistantTurnReducer(started(), { type: 'turn.failed', requestId: 'r-1', message: 'oi', failure })).toEqual({ status: 'failure', requestId: 'r-1', message: 'oi', failure })
    expect(assistantTurnReducer(started(), { type: 'turn.failed', requestId: 'r-9', message: 'oi', failure }).status).toBe('streaming')
    const cancelling = assistantTurnReducer(started(), { type: 'cancel.requested', requestId: 'r-1' })
    expect(cancelling).toMatchObject({ status: 'streaming', cancelRequested: true })
    expect(assistantTurnReducer(cancelling, { type: 'turn.cancelled', requestId: 'r-1', text: 'Cancelado.' })).toEqual({ status: 'cancelled', requestId: 'r-1', text: 'Cancelado.' })
  })

  it('decide o que Esc faz pelo estado', () => {
    expect(dismissIntent(initialAssistantTurnState)).toBe('close')
    expect(dismissIntent(started())).toBe('stop-stream')
    expect(dismissIntent(assistantTurnReducer(started(), { type: 'turn.confirmation', requestId: 'r-1', confirmation, text: 't', provenance: {} }))).toBe('cancel-confirmation')
  })

  it('monta o rótulo de proveniência sem partes vazias', () => {
    expect(provenanceLabel({ provider: 'Hibi local tools', model: 'local-tool-provider' })).toBe('Hibi local tools · local-tool-provider')
    expect(provenanceLabel({ provider: 'OpenAI-compatible', model: 'gpt-test', totalTokens: 17, fallback: true })).toBe('OpenAI-compatible · gpt-test · 17 tokens · local fallback')
    expect(provenanceLabel({})).toBe('')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/ai/__tests__/assistant-turn.test.ts --reporter=basic`
Expected: FAIL — `Cannot find module '../assistant-turn'`.

- [ ] **Step 3: Criar `src/ai/assistant-turn.ts`**

```ts
import type { AiProviderFailure } from './contracts'
import type { Confirmation } from './policy'

export type AssistantProvenance = Readonly<{ provider?: string; model?: string; totalTokens?: number; fallback?: boolean }>

export type AssistantTurnState =
  | Readonly<{ status: 'idle' }>
  | Readonly<{ status: 'streaming'; requestId: string; text: string; provenance: AssistantProvenance; cancelRequested: boolean }>
  | Readonly<{ status: 'replied'; requestId: string; text: string; provenance: AssistantProvenance }>
  | Readonly<{ status: 'confirmation'; requestId: string; confirmation: Confirmation; text: string; provenance: AssistantProvenance }>
  | Readonly<{ status: 'failure'; requestId: string; message: string; failure: AiProviderFailure }>
  | Readonly<{ status: 'executed'; requestId: string; summary: string; partialFailure: boolean }>
  | Readonly<{ status: 'cancelled'; requestId: string; text: string }>

export type AssistantTurnAction =
  | Readonly<{ type: 'reset' }>
  | Readonly<{ type: 'turn.started'; requestId: string }>
  | Readonly<{ type: 'stream.started'; requestId: string; provider?: string; model?: string }>
  | Readonly<{ type: 'stream.delta'; requestId: string; delta: string }>
  | Readonly<{ type: 'stream.usage'; requestId: string; totalTokens: number }>
  | Readonly<{ type: 'cancel.requested'; requestId: string }>
  | Readonly<{ type: 'turn.replied'; requestId: string; text: string; provenance: AssistantProvenance }>
  | Readonly<{ type: 'turn.confirmation'; requestId: string; confirmation: Confirmation; text: string; provenance: AssistantProvenance }>
  | Readonly<{ type: 'turn.failed'; requestId: string; message: string; failure: AiProviderFailure }>
  | Readonly<{ type: 'turn.cancelled'; requestId: string; text: string }>
  | Readonly<{ type: 'confirmation.executed'; requestId: string; summary: string; partialFailure: boolean }>
  | Readonly<{ type: 'confirmation.cancelled'; requestId: string; text: string }>

export type DismissIntent = 'close' | 'stop-stream' | 'cancel-confirmation'

export const initialAssistantTurnState: AssistantTurnState = { status: 'idle' }

// Transições fora de ordem (stream de um pedido antigo, resposta depois de confirmação) são ignoradas:
// devolver o mesmo estado é o que impede a paleta e a página de divergirem.
export function assistantTurnReducer(state: AssistantTurnState, action: AssistantTurnAction): AssistantTurnState {
  const streaming = state.status === 'streaming' && 'requestId' in action && state.requestId === action.requestId
  const confirming = state.status === 'confirmation' && 'requestId' in action && state.requestId === action.requestId
  switch (action.type) {
    case 'reset': return initialAssistantTurnState
    case 'turn.started': return { status: 'streaming', requestId: action.requestId, text: '', provenance: {}, cancelRequested: false }
    case 'stream.started': return streaming && state.status === 'streaming' ? { ...state, provenance: { ...state.provenance, ...(action.provider === undefined ? {} : { provider: action.provider }), ...(action.model === undefined ? {} : { model: action.model }) } } : state
    case 'stream.delta': return streaming && state.status === 'streaming' ? { ...state, text: `${state.text}${action.delta}` } : state
    case 'stream.usage': return streaming && state.status === 'streaming' ? { ...state, provenance: { ...state.provenance, totalTokens: action.totalTokens } } : state
    case 'cancel.requested': return streaming && state.status === 'streaming' ? { ...state, cancelRequested: true } : state
    case 'turn.replied': return streaming ? { status: 'replied', requestId: action.requestId, text: action.text, provenance: action.provenance } : state
    case 'turn.confirmation': return streaming ? { status: 'confirmation', requestId: action.requestId, confirmation: action.confirmation, text: action.text, provenance: action.provenance } : state
    case 'turn.failed': return streaming ? { status: 'failure', requestId: action.requestId, message: action.message, failure: action.failure } : state
    case 'turn.cancelled': return streaming ? { status: 'cancelled', requestId: action.requestId, text: action.text } : state
    case 'confirmation.executed': return confirming ? { status: 'executed', requestId: action.requestId, summary: action.summary, partialFailure: action.partialFailure } : state
    case 'confirmation.cancelled': return confirming ? { status: 'cancelled', requestId: action.requestId, text: action.text } : state
  }
}

export function dismissIntent(state: AssistantTurnState): DismissIntent {
  if (state.status === 'confirmation') return 'cancel-confirmation'
  if (state.status === 'streaming') return 'stop-stream'
  return 'close'
}

export const provenanceLabel = (provenance: AssistantProvenance): string => [provenance.provider, provenance.model, provenance.totalTokens === undefined ? undefined : `${provenance.totalTokens} tokens`, provenance.fallback ? 'local fallback' : undefined].filter((value): value is string => Boolean(value)).join(' · ')
```

- [ ] **Step 4: Rodar o teste do reducer (passa)**

Run: `npx vitest run src/ai/__tests__/assistant-turn.test.ts --reporter=basic`
Expected: 5 passed.

- [ ] **Step 5: Mover os helpers puros de `TabyView` para `src/ui/assistant-presentation.ts`**

Crie `src/ui/assistant-presentation.ts` com o conteúdo hoje nas linhas 16–20 e 30–36 de `TabyView.tsx` (idêntico, só muda o arquivo):

```ts
import type { AiProviderFailure } from '../ai/contracts';
import type { CompanionEvent } from '../companion/contracts';

export const confirmationPresentationFor = (requestId: string, text: string) => ({ requestId, kind: 'confirmation', text, interaction: 'capture' as const, actions: [{ id: 'confirm', label: 'Confirmar' }, { id: 'cancel', label: 'Cancelar' }] });
export const modelLabelFor = (result: { providerLabel: string; proposal: { providerMetadata?: { model?: string } } }) => result.proposal.providerMetadata?.model ?? result.providerLabel;
export const provenanceLabelFor = (result: { provider: { label: string; model?: string; usage?: { inputTokens?: number; outputTokens?: number; totalTokens: number }; fallback: boolean } }) => [result.provider.label, result.provider.model, result.provider.usage ? `${result.provider.usage.totalTokens} tokens` : undefined, result.provider.fallback ? 'local fallback' : undefined].filter((value): value is string => Boolean(value)).join(' · ');
export const failurePresentationFor = (failure: AiProviderFailure) => {
  if (failure.code === 'invalid_credentials') return { title: 'Check the API key', detail: 'The configured provider rejected its credentials. Your key remains in Keychain.', canRetry: false, canUseLocalFallback: true };
  if (failure.code === 'rate_limited') return { title: 'Rate limit reached', detail: `The provider is temporarily limiting requests.${failure.retryAfterMs ? ` Try again in about ${Math.max(1, Math.ceil(failure.retryAfterMs / 1_000))} seconds.` : ''}`, canRetry: true, canUseLocalFallback: true };
  if (failure.code === 'unavailable') return { title: 'Provider unavailable', detail: 'The provider is temporarily unavailable. You can retry or continue locally.', canRetry: true, canUseLocalFallback: true };
  if (failure.code === 'cancelled') return { title: 'Request cancelled', detail: 'No action was performed.', canRetry: true, canUseLocalFallback: false };
  return { title: 'Invalid provider response', detail: 'The provider returned an invalid response. No action was performed.', canRetry: true, canUseLocalFallback: true };
};
export const companionEventFor = (kind: 'listening' | 'thinking' | 'acting' | 'confirmation' | 'result' | 'error', requestId: string, text: string, nowMs: number): CompanionEvent => {
  if (kind === 'confirmation') return { type: 'confirmation.requested', requestId, text, nowMs, expiresInMs: 60_000, actions: confirmationPresentationFor(requestId, text).actions };
  if (kind === 'result') return { type: 'ai.result', requestId, text, nowMs, expiresInMs: 4_000 };
  if (kind === 'error') return { type: 'error.raised', requestId, text, nowMs, expiresInMs: 5_000 };
  return { type: 'ai.stage', requestId, stage: kind, text, nowMs };
};
```

- [ ] **Step 6: Criar o hook `src/ui/useAssistantTurn.ts`**

```ts
import { useEffect, useReducer, useRef } from 'react';
import { assistantTurnReducer, dismissIntent, initialAssistantTurnState, type AssistantProvenance, type AssistantTurnState, type DismissIntent } from '../ai/assistant-turn';
import type { AiProviderFailure } from '../ai/contracts';
import { classifyProviderFailure } from '../ai/production';
import type { AiRuntimeResult, AiTurnRuntime } from '../ai/runtime';
import type { CompanionEvent } from '../companion/contracts';
import { referenceDate } from '../domain/date-context';
import type { StudyData } from '../domain/models';
import { companionEventFor, failurePresentationFor } from './assistant-presentation';

export type AssistantHost = Readonly<{
  runtime: AiTurnRuntime;
  data: StudyData;
  onEvent: (action: string, detail: string, result?: string) => void;
  onCompanionEvent?: (event: CompanionEvent) => void;
  onCompanionError?: (text: string) => void;
}>;

export type AssistantTurnControls = Readonly<{
  state: AssistantTurnState;
  ask: (message: string, options?: { useLocalFallback?: boolean }) => Promise<void>;
  confirm: () => Promise<void>;
  cancelConfirmation: () => Promise<void>;
  stop: () => void;
  retry: () => Promise<void>;
  useLocalFallback: () => Promise<void>;
  dismiss: () => DismissIntent;
  reset: () => void;
}>;

const failureFor = (error: unknown): AiProviderFailure => {
  if (typeof error === 'object' && error !== null && 'failure' in error) {
    const failure = (error as { failure?: unknown }).failure;
    if (typeof failure === 'object' && failure !== null && 'code' in failure && 'retryable' in failure) return failure as AiProviderFailure;
  }
  return classifyProviderFailure(error);
};
const provenanceOf = (result: AiRuntimeResult): AssistantProvenance => ({ provider: result.provider.label, ...(result.provider.model === undefined ? {} : { model: result.provider.model }), ...(result.provider.usage ? { totalTokens: result.provider.usage.totalTokens } : {}), ...(result.provider.fallback ? { fallback: true } : {}) });
const assistantRequestId = () => `assistant-${crypto.randomUUID().replace(/[^A-Za-z0-9_-]/g, '')}`;

// Um turno do assistente, do pedido à execução confirmada. A página Taby e a paleta usam o mesmo hook:
// o reducer decide as transições; aqui só se conversa com o runtime, o companion e a instrumentação.
export function useAssistantTurn({ runtime, data, onEvent, onCompanionEvent, onCompanionError }: AssistantHost): AssistantTurnControls {
  const [state, dispatch] = useReducer(assistantTurnReducer, initialAssistantTurnState);
  const activeRequestId = useRef<string | null>(null);
  const lastMessage = useRef('');
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => runtime.subscribeToStream(({ requestId, event }) => {
    if (activeRequestId.current !== requestId) return;
    if (event.type === 'started') dispatch({ type: 'stream.started', requestId, ...(event.provider === undefined ? {} : { provider: event.provider }), ...(event.model === undefined ? {} : { model: event.model }) });
    if (event.type === 'delta') dispatch({ type: 'stream.delta', requestId, delta: event.delta });
    if (event.type === 'usage') dispatch({ type: 'stream.usage', requestId, totalTokens: event.usage.totalTokens });
  }), [runtime]);

  const resolve = async (actionId: 'confirm' | 'cancel') => {
    const current = stateRef.current;
    if (current.status !== 'confirmation') return;
    const { confirmation, requestId } = current;
    void window.hibiDesktop?.hideNotch?.(confirmation.id);
    if (actionId === 'cancel') {
      runtime.cancelConfirmation(confirmation);
      const text = 'Ação cancelada.';
      dispatch({ type: 'confirmation.cancelled', requestId, text });
      onEvent('assistant-action', 'confirmation-cancelled', 'cancelled');
      onCompanionEvent?.(companionEventFor('result', confirmation.id, text, Date.now()));
      return;
    }
    try {
      const result = await runtime.confirm(confirmation);
      const summary = result.partialFailure ?? (result.toolResults.map((item) => item.summary).join('\n') || 'Ação executada com sucesso.');
      dispatch({ type: 'confirmation.executed', requestId, summary, partialFailure: Boolean(result.partialFailure) });
      onEvent('assistant-action', summary, result.partialFailure ? 'partial-failure' : 'executed');
      onCompanionEvent?.(companionEventFor(result.partialFailure ? 'error' : 'result', confirmation.id, summary, Date.now()));
    } catch (error) {
      const text = error instanceof Error ? error.message : 'A ação não pôde ser executada.';
      dispatch({ type: 'confirmation.executed', requestId, summary: text, partialFailure: true });
      onEvent('assistant-action', text, 'blocked');
      onCompanionError?.(text);
      onCompanionEvent?.(companionEventFor('error', confirmation.id, text, Date.now()));
    }
  };

  useEffect(() => window.hibiDesktop?.onCompanionAction?.((action) => { if (state.status === 'confirmation' && action.requestId === state.confirmation.id) void resolve(action.actionId); }) ?? (() => undefined), [state]);

  const ask = async (message: string, options: { useLocalFallback?: boolean } = {}) => {
    const trimmed = message.trim();
    if (!trimmed || stateRef.current.status === 'streaming') return;
    const useLocalFallback = options.useLocalFallback === true;
    const requestId = assistantRequestId();
    activeRequestId.current = requestId;
    lastMessage.current = trimmed;
    dispatch({ type: 'turn.started', requestId });
    onEvent('assistant-query', trimmed, useLocalFallback ? 'local-fallback' : 'requested');
    onCompanionEvent?.(companionEventFor('listening', requestId, 'Ouvindo…', Date.now()));
    try {
      const result = await runtime.runTurn({ message: trimmed, surface: 'desktop', requestId, useLocalFallback, now: new Date(`${referenceDate(data)}T09:00:00-03:00`) });
      if (activeRequestId.current !== requestId) return;
      if (result.confirmation) {
        const text = `${result.reply}\n\nConfirme para continuar.`;
        dispatch({ type: 'turn.confirmation', requestId, confirmation: result.confirmation, text, provenance: provenanceOf(result) });
        onCompanionEvent?.(companionEventFor('confirmation', result.confirmation.id, text, Date.now()));
        onEvent('assistant-action', result.confirmation.calls.map((call) => call.name).join(', '), 'confirmation-required');
        return;
      }
      const details = result.toolResults.map((item) => item.summary).join('\n') || result.reply;
      dispatch({ type: 'turn.replied', requestId, text: details, provenance: provenanceOf(result) });
      onEvent('assistant-query', result.providerLabel, 'completed');
      onCompanionEvent?.(companionEventFor('result', result.requestId, details, Date.now()));
    } catch (error) {
      if (activeRequestId.current !== requestId) return;
      const failure = failureFor(error);
      if (failure.code === 'cancelled') {
        const text = 'Solicitação cancelada. Nenhuma ação foi executada.';
        dispatch({ type: 'turn.cancelled', requestId, text });
        onEvent('assistant-query', text, 'cancelled');
        onCompanionEvent?.(companionEventFor('result', requestId, text, Date.now()));
        return;
      }
      dispatch({ type: 'turn.failed', requestId, message: trimmed, failure });
      onEvent('assistant-query', failure.code, 'failed');
      const presentation = failurePresentationFor(failure);
      onCompanionError?.(presentation.title);
      onCompanionEvent?.(companionEventFor('error', requestId, presentation.title, Date.now()));
    } finally {
      if (activeRequestId.current === requestId) activeRequestId.current = null;
    }
  };

  const stop = () => { const current = stateRef.current; if (current.status !== 'streaming') return; dispatch({ type: 'cancel.requested', requestId: current.requestId }); runtime.cancel(); };
  const dismiss = (): DismissIntent => { const intent = dismissIntent(stateRef.current); if (intent === 'cancel-confirmation') void resolve('cancel'); if (intent === 'stop-stream') stop(); return intent; };
  const retry = () => stateRef.current.status === 'failure' ? ask(lastMessage.current) : Promise.resolve();
  const useLocalFallback = () => stateRef.current.status === 'failure' ? ask(lastMessage.current, { useLocalFallback: true }) : Promise.resolve();

  return { state, ask, confirm: () => resolve('confirm'), cancelConfirmation: () => resolve('cancel'), stop, retry, useLocalFallback, dismiss, reset: () => dispatch({ type: 'reset' }) };
}
```

- [ ] **Step 7: Reescrever `src/ui/TabyView.tsx` sobre o hook, preservando o markup**

Substitua o arquivo inteiro por:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { LOCAL_CAPABILITIES } from '../domain/capabilities';
import type { StudyData } from '../domain/models';
import { AiTurnRuntime } from '../ai/runtime';
import { provenanceLabel } from '../ai/assistant-turn';
import type { CompanionEvent } from '../companion/contracts';
import { failurePresentationFor } from './assistant-presentation';
import { useAssistantTurn } from './useAssistantTurn';

export { companionEventFor, confirmationPresentationFor, failurePresentationFor, modelLabelFor, provenanceLabelFor } from './assistant-presentation';

type Props = { data: StudyData; runtime: AiTurnRuntime; onEvent: (action: string, detail: string, result?: string) => void; onCompanionError?: (text: string) => void; onCompanionEvent?: (event: CompanionEvent) => void };
type Message = Readonly<{ role: 'user' | 'assistant'; text: string; provenance?: string }>;

export function TabyView({ data, runtime, onEvent, onCompanionError, onCompanionEvent }: Props) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([{ role: 'assistant', text: 'Olá! Sou o assistente local do Hibi. Posso consultar e organizar seu espaço de trabalho.', provenance: 'Hibi local tools · local-tool-provider' }]);
  const turn = useAssistantTurn({ runtime, data, onEvent, onCompanionEvent, onCompanionError });
  const { state } = turn;
  const handled = useRef('');

  // Cada transição terminal vira uma mensagem no histórico da página, uma vez só.
  useEffect(() => {
    if (state.status === 'idle' || state.status === 'streaming' || state.status === 'failure') return;
    const key = `${state.status}:${state.requestId}`;
    if (handled.current === key) return;
    handled.current = key;
    if (state.status === 'replied') setMessages((current) => [...current, { role: 'assistant', text: state.text, provenance: provenanceLabel(state.provenance) }]);
    if (state.status === 'confirmation') setMessages((current) => [...current, { role: 'assistant', text: state.text, provenance: provenanceLabel(state.provenance) }]);
    if (state.status === 'executed') setMessages((current) => [...current, { role: 'assistant', text: state.summary }]);
    if (state.status === 'cancelled') setMessages((current) => [...current, { role: 'assistant', text: state.text }]);
  }, [state]);

  const send = () => { const message = input.trim(); if (!message || state.status === 'streaming') return; setMessages((current) => [...current, { role: 'user', text: message }]); setInput(''); void turn.ask(message); };
  const isRunning = state.status === 'streaming';
  const failure = state.status === 'failure' ? failurePresentationFor(state.failure) : null;

  return <div className="view"><div className="view-heading"><div><p className="eyebrow">TABY · LOCAL TOOLS</p><h1>Local assistant</h1><p className="muted">Ações usam ferramentas locais validadas e confirmações explícitas. O modo local não usa rede; um provedor configurado pode usar seu endpoint.</p></div></div><section className="list-card" aria-label="Assistant capabilities"><div className="task-row"><span className="tag orange">status</span><div><strong>What I can access</strong><p className="muted">Only the local workspace data and controls listed here.</p></div></div>{LOCAL_CAPABILITIES.map((capability) => <div className="task-row" key={capability.id}><span className={`tag ${capability.status === 'available' ? 'green' : 'muted'}`}>{capability.status}</span><div><strong>{capability.label}</strong><p className="muted">{capability.description}</p></div></div>)}</section><section className="list-card" aria-live="polite">{messages.map((message, index) => <div className="task-row" key={`${message.role}-${index}`}><span className="tag orange">{message.role}</span><div><span>{message.text}</span>{message.provenance && <small className="muted" style={{ display: 'block', marginTop: 4 }}>{message.provenance}</small>}</div></div>)}{state.status === 'streaming' && <div className="task-row" role="status"><span className="tag orange">streaming</span><div><strong>{state.text || (state.cancelRequested ? 'Cancelando…' : 'Gerando resposta…')}</strong>{provenanceLabel(state.provenance) && <small className="muted" style={{ display: 'block', marginTop: 4 }}>{provenanceLabel(state.provenance)}</small>}</div></div>}{state.status === 'confirmation' && <div className="task-row" role="alert"><span className="tag amber">confirmation</span><div><strong>{state.text}</strong><div style={{ display: 'flex', gap: 8, marginTop: 10 }}><button className="primary" onClick={() => void turn.confirm()}>Confirmar</button><button className="outline" onClick={() => void turn.cancelConfirmation()}>Cancelar</button></div></div></div>}{failure && <div className="task-row" role="alert"><span className="tag amber">provider</span><div><strong>{failure.title}</strong><p className="muted">{failure.detail}</p><div style={{ display: 'flex', gap: 8, marginTop: 10 }}>{failure.canRetry && <button className="outline" onClick={() => void turn.retry()}>Tentar novamente</button>}{failure.canUseLocalFallback && <button className="primary" onClick={() => void turn.useLocalFallback()}>Usar assistente local</button>}</div></div></div>}</section><div className="quick-input"><input disabled={isRunning} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') send(); }} placeholder="Pergunte ou peça uma ação" aria-label="Pergunte ou peça uma ação" /><button className="primary" disabled={isRunning} onClick={send}>Send</button>{isRunning && <button className="outline" onClick={turn.stop}>Parar</button>}</div></div>;
}
```

- [ ] **Step 8: Confirmar que os testes existentes do Taby continuam verdes**

Run: `npx vitest run src/ui/__tests__/TabyView.test.tsx src/ai --reporter=basic`
Expected: todos passam (os helpers continuam exportados de `TabyView`).

- [ ] **Step 9: Gate e commit**

Run: `npm test && npx tsc --noEmit && npx vite build && npx playwright test`
Expected: verde — inclusive `assistant-integration-action.spec.ts` e o fluxo "assistente confirma uma mudança" do `smoke.spec.ts`, que exercitam exatamente o caminho migrado.

```bash
git add src/ai/assistant-turn.ts src/ai/__tests__/assistant-turn.test.ts src/ui/assistant-presentation.ts src/ui/useAssistantTurn.ts src/ui/TabyView.tsx
git commit -m "refactor(ai): extrair o turno do assistente para um reducer puro e um hook compartilhado"
```

---

## Task 4: Shell sem moldura, dock e Agenda

**Files:**
- Create: `src/ui/shell/routes.ts`
- Create: `src/ui/shell/Dock.tsx`
- Create: `src/ui/shell/AppShell.tsx`
- Create: `src/ui/shell/shell.css`
- Create: `src/ui/AgendaView.tsx`
- Create: `src/ui/__tests__/shell.test.tsx`
- Delete: `src/ui/AppShell.tsx`
- Modify: `src/App.tsx:7`, `:241-242`, `:253`
- Modify: `src/ui/CommandPalette.tsx:2`, `src/ui/HelpView.tsx:2`, `src/ui/AvailabilityView.tsx:2`
- Modify: `src/ui/__tests__/data-bound-views.test.tsx`
- Modify: `electron/main.cjs:75-79`
- Modify: `tests/e2e/smoke.spec.ts`, `tests/e2e/integrations-webhook.spec.ts`, `tests/e2e/integrations-connectors.spec.ts`, `tests/e2e/connector-import.spec.ts`

- [ ] **Step 1: Escrever o teste estático do shell (falha: módulos não existem)**

Crie `src/ui/__tests__/shell.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LocaleProvider } from '../../i18n/LocaleProvider'
import { AppShell } from '../shell/AppShell'
import { Dock, DockMoreMenu } from '../shell/Dock'
import { dockKeyFor, DOCK_ITEMS, MORE_ITEMS, sectionLabelKey } from '../shell/routes'

const noop = () => undefined

describe('shell', () => {
  it('mostra os cinco itens do dock, o botão de mais e o atalho de comandos', () => {
    const markup = renderToStaticMarkup(<Dock active="home" onNavigate={noop} onOpenCommands={noop} />)
    for (const label of ['Home', 'Tarefas', 'Agenda', 'Foco', 'Taby']) expect(markup).toContain(`>${label}</button>`)
    expect(markup).toContain('aria-label="Mais seções"')
    expect(markup).toContain('aria-label="Comandos"')
    expect(markup).toContain('aria-current="page"')
  })

  it('lista o restante das seções no menu de mais', () => {
    const markup = renderToStaticMarkup(<DockMoreMenu active="settings" onSelect={noop} />)
    for (const label of ['Lembretes', 'Notas', 'Hábitos', 'Metas', 'Revisão', 'Ajustes', 'Ajuda', 'Eventos', 'Feedback', 'Atualizações', 'Hardware']) expect(markup).toContain(label)
    expect(markup).toContain('role="menuitem"')
    expect(markup).toMatch(/aria-current="page"[^>]*>Ajustes</)
  })

  it('traduz o dock ao vivo pelo provedor de locale', () => {
    const markup = renderToStaticMarkup(<LocaleProvider initialLanguage="en"><Dock active="tasks" onNavigate={noop} onOpenCommands={noop} /></LocaleProvider>)
    expect(markup).toContain('>Tasks</button>')
    expect(markup).toContain('aria-label="More sections"')
  })

  it('agrupa dia, semana e agenda no mesmo item do dock', () => {
    expect(dockKeyFor('day')).toBe('agenda')
    expect(dockKeyFor('week')).toBe('agenda')
    expect(dockKeyFor('agenda')).toBe('agenda')
    expect(dockKeyFor('settings')).toBe('settings')
    expect(sectionLabelKey('week')).toBe('nav.agenda')
    expect(sectionLabelKey('instrumentation')).toBe('nav.instrumentation')
    expect(DOCK_ITEMS.map((item) => item.key)).toEqual(['home', 'tasks', 'agenda', 'focus', 'taby'])
    expect(MORE_ITEMS).toHaveLength(11)
  })

  it('envolve o conteúdo com a faixa do topo e a seção atual', () => {
    const markup = renderToStaticMarkup(<AppShell active="week" onNavigate={noop} onOpenCommands={noop}><p>conteúdo</p></AppShell>)
    expect(markup).toContain('HIBI')
    expect(markup).toContain('>Agenda</span>')
    expect(markup).toContain('<main class="shell-content"><p>conteúdo</p></main>')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/ui/__tests__/shell.test.tsx --reporter=basic`
Expected: FAIL — `Cannot find module '../shell/AppShell'`.

- [ ] **Step 3: Criar `src/ui/shell/routes.ts`**

```ts
import type { DictionaryKey } from '../../i18n/dictionary'

export type NavKey = 'home' | 'tasks' | 'agenda' | 'day' | 'week' | 'focus' | 'taby' | 'notes' | 'reminders' | 'habits' | 'goals' | 'review' | 'settings' | 'help' | 'feedback' | 'instrumentation' | 'updates' | 'hardware'

export type NavItem = Readonly<{ key: NavKey; label: DictionaryKey }>

export const DOCK_ITEMS: readonly NavItem[] = [
  { key: 'home', label: 'nav.home' },
  { key: 'tasks', label: 'nav.tasks' },
  { key: 'agenda', label: 'nav.agenda' },
  { key: 'focus', label: 'nav.focus' },
  { key: 'taby', label: 'nav.taby' },
]

export const MORE_ITEMS: readonly NavItem[] = [
  { key: 'reminders', label: 'nav.reminders' },
  { key: 'notes', label: 'nav.notes' },
  { key: 'habits', label: 'nav.habits' },
  { key: 'goals', label: 'nav.goals' },
  { key: 'review', label: 'nav.review' },
  { key: 'settings', label: 'nav.settings' },
  { key: 'help', label: 'nav.help' },
  { key: 'instrumentation', label: 'nav.instrumentation' },
  { key: 'feedback', label: 'nav.feedback' },
  { key: 'updates', label: 'nav.updates' },
  { key: 'hardware', label: 'nav.hardware' },
]

export const isAgendaRoute = (key: NavKey) => key === 'agenda' || key === 'day' || key === 'week'

// Dia e Semana são a mesma seção para o dock.
export const dockKeyFor = (route: NavKey): NavKey => isAgendaRoute(route) ? 'agenda' : route

export const sectionLabelKey = (route: NavKey): DictionaryKey => isAgendaRoute(route) ? 'nav.agenda' : `nav.${route}`
```

- [ ] **Step 4: Criar `src/ui/shell/Dock.tsx`**

```tsx
import React, { useEffect, useRef, useState } from 'react'
import { useT } from '../../i18n/LocaleProvider'
import { dockKeyFor, DOCK_ITEMS, MORE_ITEMS, type NavKey } from './routes'

type DockProps = Readonly<{ active: NavKey; onNavigate: (key: NavKey) => void; onOpenCommands: () => void }>

export function DockMoreMenu({ active, onSelect }: Readonly<{ active: NavKey; onSelect: (key: NavKey) => void }>) {
  const t = useT()
  return <div role="menu" className="dock-menu" aria-label={t('shell.more')}>{MORE_ITEMS.map((item) => <button type="button" role="menuitem" key={item.key} aria-current={active === item.key ? 'page' : undefined} onClick={() => onSelect(item.key)}>{t(item.label)}</button>)}</div>
}

export function Dock({ active, onNavigate, onOpenCommands }: DockProps) {
  const t = useT()
  const [moreOpen, setMoreOpen] = useState(false)
  const navRef = useRef<HTMLElement>(null)
  const activeKey = dockKeyFor(active)

  useEffect(() => {
    if (!moreOpen) return
    const close = (event: MouseEvent) => { if (!navRef.current?.contains(event.target as Node)) setMoreOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [moreOpen])

  // Setas movem o foco entre os botões do dock; Escape fecha o menu.
  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') { setMoreOpen(false); return }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    const buttons = Array.from(navRef.current?.querySelectorAll<HTMLButtonElement>('.dock-item') ?? [])
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (index < 0) return
    event.preventDefault()
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length
    buttons[next]?.focus()
  }

  return <nav ref={navRef} className="dock" aria-label={t('shell.navigation')} onKeyDown={onKeyDown}>
    {DOCK_ITEMS.map((item) => <button type="button" className="dock-item" key={item.key} aria-current={activeKey === item.key ? 'page' : undefined} onClick={() => onNavigate(item.key)}>{t(item.label)}</button>)}
    <div className="dock-more">
      <button type="button" className="dock-item" aria-haspopup="menu" aria-expanded={moreOpen} aria-label={t('shell.more')} data-active={!DOCK_ITEMS.some((item) => item.key === activeKey)} onClick={() => setMoreOpen((open) => !open)}>···</button>
      {moreOpen && <DockMoreMenu active={active} onSelect={(key) => { setMoreOpen(false); onNavigate(key) }} />}
    </div>
    <button type="button" className="dock-item dock-commands" aria-label={t('shell.commands')} onClick={onOpenCommands}><kbd>{t('shell.commandsHint')}</kbd></button>
  </nav>
}
```

- [ ] **Step 5: Criar `src/ui/shell/AppShell.tsx` e `src/ui/shell/shell.css`**

`src/ui/shell/AppShell.tsx`:

```tsx
import React from 'react'
import { useT } from '../../i18n/LocaleProvider'
import { Dock } from './Dock'
import { sectionLabelKey, type NavKey } from './routes'
import './shell.css'

export type { NavKey } from './routes'

type Props = Readonly<{ active: NavKey; onNavigate: (key: NavKey) => void; onOpenCommands: () => void; children: React.ReactNode }>

export function AppShell({ active, onNavigate, onOpenCommands, children }: Props) {
  const t = useT()
  return <div className="shell">
    <header className="shell-topbar">
      <button type="button" className="shell-brand" onClick={() => onNavigate('home')}>{t('shell.brand')}</button>
      <span className="shell-crumb" aria-hidden="true">›</span>
      <span className="shell-section">{t(sectionLabelKey(active))}</span>
    </header>
    <main className="shell-content">{children}</main>
    <Dock active={active} onNavigate={onNavigate} onOpenCommands={onOpenCommands} />
  </div>
}
```

`src/ui/shell/shell.css`:

```css
/* Shell sem moldura: canvas em papel, faixa fina no topo, dock flutuante. Só tokens. */
body:has(.shell) { background: var(--bg-canvas); min-width: 960px; }

.shell { min-height: 100vh; background: var(--bg-canvas); color: var(--text-primary); font-family: var(--font-sans); display: grid; grid-template-rows: auto 1fr; }

/* A faixa do topo é a região arrastável da janela; os semáforos do macOS ficam à esquerda (hiddenInset). */
.shell-topbar { position: sticky; top: 0; z-index: 3; display: flex; align-items: center; gap: var(--space-2); height: 38px; padding: 0 var(--space-4) 0 84px; font-size: var(--type-12); letter-spacing: .14em; font-weight: 800; color: var(--text-tertiary); background: color-mix(in srgb, var(--bg-canvas) 88%, transparent); backdrop-filter: blur(8px); -webkit-app-region: drag; }
.shell-brand { -webkit-app-region: no-drag; font: inherit; letter-spacing: .18em; background: none; border: 0; color: var(--text-primary); cursor: pointer; }
.shell-brand:focus-visible, .dock-item:focus-visible, .dock-menu button:focus-visible { outline: 2px solid var(--stroke-focus); outline-offset: 2px; }

.shell-content { padding: var(--space-6) clamp(24px, 6vw, 96px) 120px; }

.dock { position: fixed; left: 50%; bottom: var(--space-5); transform: translateX(-50%); z-index: 4; display: flex; align-items: center; gap: var(--space-1); padding: var(--space-1); border-radius: var(--radius-3); background: #0c0c0c; color: #f4f3ef; box-shadow: var(--depth-float); -webkit-app-region: no-drag; }
.dock-item { font: 800 var(--type-12) / 1 var(--font-sans); letter-spacing: .06em; background: none; border: 0; color: #9a9791; padding: 10px 12px; border-radius: var(--radius-2); cursor: pointer; }
.dock-item[aria-current="page"], .dock-item[data-active="true"] { background: #f2f0ea; color: #111; }
.dock-more { position: relative; }
.dock-menu { position: absolute; bottom: calc(100% + var(--space-2)); left: 50%; transform: translateX(-50%); min-width: 180px; display: grid; padding: var(--space-1); border-radius: var(--radius-2); background: #161616; box-shadow: var(--depth-float); }
.dock-menu button { text-align: left; font: 600 var(--type-14) / var(--leading-14) var(--font-sans); background: none; border: 0; color: #d8d5cd; padding: 8px 10px; border-radius: var(--radius-1); cursor: pointer; }
.dock-menu button:hover, .dock-menu button:focus-visible { background: #2a2a2a; color: #fff; }
.dock-menu button[aria-current="page"] { color: var(--accent); }
.dock-commands kbd { font: inherit; color: #fff; background: #2d2d2d; border-radius: 6px; padding: 3px 6px; }

@media (prefers-reduced-motion: no-preference) { .dock-item { transition: background-color 140ms ease, color 140ms ease; } }
```

`body:has(.shell)` limita o fundo à janela principal: o overlay do notch compartilha o bundle de CSS em produção e precisa continuar transparente.

- [ ] **Step 6: Rodar o teste do shell (passa)**

Run: `npx vitest run src/ui/__tests__/shell.test.tsx --reporter=basic`
Expected: 5 passed.

- [ ] **Step 7: Criar `src/ui/AgendaView.tsx`**

```tsx
import React, { useEffect, useState } from 'react'
import { useT } from '../i18n/LocaleProvider'
import type { ScheduleBlock, StudyData } from '../domain/models'
import { DayView } from './DayView'
import { WeekView } from './WeekView'

export type AgendaMode = 'day' | 'week'
export const AGENDA_VIEW_STORAGE_KEY = 'hibi-agenda-view'

export const readAgendaMode = (): AgendaMode => { try { return window.localStorage.getItem(AGENDA_VIEW_STORAGE_KEY) === 'week' ? 'week' : 'day' } catch { return 'day' } }

type Props = Readonly<{
  data: StudyData
  mode?: AgendaMode
  onEvent: (action: string, detail: string, result?: string) => void
  onCreateBlock: (input: Omit<ScheduleBlock, 'id'>) => void
  onDeleteBlock?: (id: string) => void
  onModeChange?: (mode: AgendaMode) => void
}>

// Dia e Semana numa seção só. Sem `mode` explícito, lembra a última escolha.
export function AgendaView({ data, mode, onEvent, onCreateBlock, onDeleteBlock, onModeChange }: Props) {
  const t = useT()
  const [current, setCurrent] = useState<AgendaMode>(() => mode ?? readAgendaMode())
  useEffect(() => { if (mode) setCurrent(mode) }, [mode])
  const select = (next: AgendaMode) => { setCurrent(next); try { window.localStorage.setItem(AGENDA_VIEW_STORAGE_KEY, next) } catch { /* armazenamento indisponível */ } onEvent('navigation', `Agenda · ${next}`); onModeChange?.(next) }
  return <div className="agenda-view">
    <div className="filter-row" role="tablist" aria-label={t('agenda.toggle')}>
      <button type="button" role="tab" className={`filter${current === 'day' ? ' active' : ''}`} aria-selected={current === 'day'} onClick={() => select('day')}>{t('agenda.day')}</button>
      <button type="button" role="tab" className={`filter${current === 'week' ? ' active' : ''}`} aria-selected={current === 'week'} onClick={() => select('week')}>{t('agenda.week')}</button>
    </div>
    {current === 'day' ? <DayView data={data} onEvent={onEvent} onCreateBlock={onCreateBlock} onDeleteBlock={onDeleteBlock} /> : <WeekView data={data} onEvent={onEvent} onCreateBlock={onCreateBlock} onDeleteBlock={onDeleteBlock} />}
  </div>
}
```

- [ ] **Step 8: Trocar o shell e as rotas em `src/App.tsx`**

Substitua a linha 7 (`import { AppShell, NavKey } from './ui/AppShell';`) por:

```ts
import { AppShell } from './ui/shell/AppShell';
import type { NavKey } from './ui/shell/routes';
import { AgendaView } from './ui/AgendaView';
```

Substitua as duas linhas `case 'day': …` e `case 'week': …` do `switch` por:

```tsx
      case 'agenda': case 'day': case 'week': return <AgendaView {...props} data={data} mode={route === 'agenda' ? undefined : route} onCreateBlock={createBlock} onDeleteBlock={deleteBlock} onModeChange={(mode) => setRoute(mode)} />;
```

Substitua a linha de abertura `<AppShell active={route} taskCount={…} … onNavigate={navigate} onOpenCommands={() => setPaletteOpen(true)}>` por:

```tsx
    <AppShell active={route} onNavigate={navigate} onOpenCommands={() => setPaletteOpen(true)}>
```

Em `src/ui/CommandPalette.tsx`, substitua a linha 2 (`import { NavKey } from './AppShell';`) por `import type { NavKey } from './shell/routes';`. Em `src/ui/HelpView.tsx` e `src/ui/AvailabilityView.tsx`, substitua a linha 2 (`import type { NavKey } from './AppShell';`) por `import type { NavKey } from './shell/routes';`. Só então apague `src/ui/AppShell.tsx` — `tsc` acusa qualquer importador esquecido.

- [ ] **Step 9: Atualizar o teste estático que usava o shell antigo**

Em `src/ui/__tests__/data-bound-views.test.tsx`, substitua `import { AppShell } from '../AppShell';` por `import { DockMoreMenu } from '../shell/Dock';` e o teste `exposes habits and goals through primary navigation and commands` por:

```tsx
  it('exposes habits and goals through the dock menu and commands', () => {
    const menu = renderToStaticMarkup(<DockMoreMenu active="home" onSelect={onEvent} />);
    const palette = renderToStaticMarkup(<CommandPalette onClose={onEvent} onNavigate={onEvent} onEvent={onEvent} />);

    expect(menu).toContain('Hábitos');
    expect(menu).toContain('Metas');
    expect(palette).toContain('Track habits');
    expect(palette).toContain('Review goals');
  });
```

- [ ] **Step 10: Janela sem barra de título em `electron/main.cjs`**

Substitua o bloco `mainWindow = new BrowserWindow({ … });` (linhas 75–79) por:

```js
  mainWindow = new BrowserWindow({
    width: 1280, height: 820, minWidth: 960, minHeight: 620,
    title: "Hibi", backgroundColor: "#f3f2ef",
    titleBarStyle: "hiddenInset", trafficLightPosition: { x: 14, y: 12 },
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
```

`titleBarStyle` só tem efeito no macOS; nos demais sistemas a janela fica como antes.

- [ ] **Step 11: Reescrever `tests/e2e/smoke.spec.ts` para o dock**

Substitua o arquivo inteiro por:

```ts
import { test, expect, type Page } from '@playwright/test';

const dock = (page: Page) => page.getByRole('navigation', { name: 'Navegação principal' });
const go = (page: Page, name: string) => dock(page).getByRole('button', { name, exact: true }).click();
const goMore = async (page: Page, name: string) => { await dock(page).getByRole('button', { name: 'Mais seções' }).click(); await page.getByRole('menuitem', { name, exact: true }).click(); };
const goWeek = async (page: Page) => { await go(page, 'Agenda'); await page.getByRole('tab', { name: 'Semana' }).click(); };
const goDay = async (page: Page) => { await go(page, 'Agenda'); await page.getByRole('tab', { name: 'Dia' }).click(); };
const openCommands = (page: Page) => dock(page).getByRole('button', { name: 'Comandos' }).click();

test('navega pelo calendário e abre comandos', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Make room for')).toBeVisible();
  await goWeek(page);
  await expect(page.getByText('Mon 07 — Sun 13')).toBeVisible();
  await page.keyboard.press('Meta+K');
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
});

test('todas as seções principais são navegáveis', async ({ page }) => {
  await page.goto('/');
  for (const section of ['Tarefas', 'Agenda', 'Foco', 'Taby', 'Home']) {
    await go(page, section);
    await expect(page.locator('main')).toBeVisible();
  }
  for (const section of ['Lembretes', 'Notas', 'Hábitos', 'Metas', 'Revisão', 'Ajustes', 'Ajuda', 'Eventos', 'Feedback', 'Atualizações', 'Hardware']) {
    await goMore(page, section);
    await expect(page.locator('main')).toBeVisible();
  }
});

test('paleta de comandos permite navegação por teclado', async ({ page }) => {
  await page.goto('/');
  await openCommands(page);
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await expect(palette).toBeVisible();
  const input = palette.locator('input');
  await input.fill('/week');
  await expect(palette.getByRole('button', { name: /Open weekly schedule/ })).toHaveAttribute('data-selected', 'true');
  await input.press('Enter');
  await expect(page.getByText('Mon 07 — Sun 13')).toBeVisible();
});

test('atalho barra abre comandos fora de campos de texto', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true })));
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
});

test('captura rápida da Home abre a paleta de comandos', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open quick capture' }).click();
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
});

test('filtro Bento funciona em Tasks e Notes', async ({ page }) => {
  await page.goto('/');
  await go(page, 'Tarefas');
  await page.getByRole('button', { name: 'Folder · Bento' }).click();
  await expect(page.getByText('Kabrito Post 01')).toBeVisible();
  await goMore(page, 'Notas');
  await page.getByRole('button', { name: 'Folder · Bento' }).click();
  await expect(page.locator('main')).toBeVisible();
});

test('abas de Settings alternam conteúdo funcional', async ({ page }) => {
  await page.goto('/');
  await goMore(page, 'Ajustes');
  await expect(page.getByRole('heading', { name: 'General' })).toBeVisible();
  await page.getByRole('button', { name: 'Notifications', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send test notification' })).toBeVisible();
  await page.getByRole('button', { name: 'Data', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Data' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset study data' })).toBeVisible();
});

test('restaura um backup completo pela interface sem incluir dados do Keychain', async ({ page }) => {
  await page.goto('/');
  const backup = await page.evaluate(() => {
    const data = JSON.parse(window.localStorage.getItem('hibi-study-data') ?? '{}');
    data.tasks.push({ id: 'backup-task', title: 'Tarefa restaurada', durationMinutes: 45, category: 'important', folder: 'Bento' });
    data.notes.push({ id: 'backup-note', title: 'Nota restaurada', content: 'Contexto preservado', folder: 'Bento', createdAt: '2026-09-08T12:00:00.000Z', updatedAt: '2026-09-08T12:00:00.000Z' });
    data.blocks.push({ id: 'backup-block', title: 'Bloco restaurado', start: '2026-09-07T08:00:00-03:00', end: '2026-09-07T09:00:00-03:00', category: 'important' });
    return JSON.stringify({ app: 'Hibi', version: 1, exportedAt: '2026-09-08T12:00:00.000Z', data, preferences: { language: 'pt', twentyFourHour: true } });
  });
  await goMore(page, 'Ajustes');
  await page.getByRole('button', { name: 'Data', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByLabel('Choose Hibi workspace backup').setInputFiles({ name: 'hibi-workspace-backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
  await expect(page.getByText('Workspace restored from hibi-workspace-backup.json.')).toBeVisible();
  await go(page, 'Tarefas');
  await expect(page.getByText('Tarefa restaurada')).toBeVisible();
  await goMore(page, 'Notas');
  await expect(page.getByText('Nota restaurada')).toBeVisible();
  await goDay(page);
  await expect(page.getByText('Bloco restaurado')).toBeVisible();
});

test('navegação diária e semanal atualiza o período', async ({ page }) => {
  await page.goto('/');
  await goDay(page);
  await expect(page.getByText('MONDAY · 07 SEPTEMBER 2026')).toBeVisible();
  await page.getByRole('button', { name: 'Next day' }).click();
  await expect(page.getByText('TUESDAY · 08 SEPTEMBER 2026')).toBeVisible();
  await page.getByRole('tab', { name: 'Semana' }).click();
  await expect(page.getByText('Mon 07 — Sun 13')).toBeVisible();
  await page.getByRole('button', { name: 'Next week' }).click();
  await expect(page.getByText('Mon 14 — Sun 20')).toBeVisible();
});

test('filtros de lembretes alteram a lista', async ({ page }) => {
  await page.goto('/');
  await goMore(page, 'Lembretes');
  await expect(page.getByText('vaga/inglês - Horizontes')).toBeVisible();
  await page.getByRole('button', { name: /Wellbeing 0/ }).click();
  await expect(page.getByText('No reminders match this filter.')).toBeVisible();
  await page.getByRole('button', { name: /All 1/ }).click();
  await expect(page.getByText('vaga/inglês - Horizontes')).toBeVisible();
});

test('criação de lembrete diário preserva a recorrência', async ({ page }) => {
  await page.goto('/');
  await goMore(page, 'Lembretes');
  await page.getByRole('button', { name: '+ New reminder' }).click();
  const form = page.getByRole('dialog', { name: 'Create reminder' });
  await form.getByRole('textbox', { name: 'Title' }).fill('Revisar agenda');
  await form.getByRole('combobox', { name: 'Schedule type' }).selectOption('daily');
  await form.getByRole('textbox', { name: 'Time' }).fill('08:30');
  await form.getByRole('button', { name: 'Create reminder' }).click();
  await expect(page.getByText('Revisar agenda')).toBeVisible();
  await expect(page.getByText('Every day · 08:30')).toBeVisible();
});

test('criação semanal preseleciona o dia do início e permite escolher categoria', async ({ page }) => {
  await page.goto('/');
  await goMore(page, 'Lembretes');
  await page.getByRole('button', { name: '+ New reminder' }).click();
  const form = page.getByRole('dialog', { name: 'Create reminder' });
  await form.getByRole('textbox', { name: 'Title' }).fill('Caminhar');
  await form.getByRole('radio', { name: 'Wellbeing' }).check();
  await form.getByRole('combobox', { name: 'Schedule type' }).selectOption('weekly');
  await expect(form.getByRole('checkbox', { name: 'Mon' })).toBeChecked();
  await form.getByRole('textbox', { name: 'Time' }).fill('19:00');
  await form.getByRole('button', { name: 'Create reminder' }).click();
  await expect(page.getByText('Caminhar')).toBeVisible();
  await expect(page.getByText('Mon 19:00')).toBeVisible();
});

test('edição de lembrete semanal mantém dias e horários configurados', async ({ page }) => {
  await page.goto('/');
  await goMore(page, 'Lembretes');
  await page.getByRole('button', { name: 'Edit vaga/inglês - Horizontes' }).click();
  const form = page.getByRole('form', { name: 'Edit vaga/inglês - Horizontes' });
  await form.getByRole('combobox', { name: 'Type' }).selectOption('weekly');
  await form.getByRole('textbox', { name: 'Time' }).fill('20:00');
  await form.getByRole('checkbox', { name: 'Tue' }).uncheck();
  await form.getByRole('checkbox', { name: 'Wed' }).check();
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Wed 20:00')).toBeVisible();
});

test('edição de lembrete pelo formulário persiste o novo horário', async ({ page }) => {
  await page.goto('/');
  await goMore(page, 'Lembretes');
  await page.getByRole('button', { name: 'Edit vaga/inglês - Horizontes' }).click();
  const form = page.getByRole('form', { name: 'Edit vaga/inglês - Horizontes' });
  await form.getByRole('textbox', { name: 'Time' }).fill('10:30');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/10:30/)).toBeVisible();
});

test('filtros e ordenação de Tasks são interativos', async ({ page }) => {
  await page.goto('/');
  await go(page, 'Tarefas');
  await page.getByRole('button', { name: /All 8/ }).click();
  await expect(page.getByRole('button', { name: /All 8/ })).toHaveClass(/active/);
  await page.getByRole('button', { name: /Deadline/ }).click();
  await expect(page.getByRole('button', { name: /Deadline/ })).toHaveClass(/active/);
});

test('edita deadline de uma task por formulário acessível e permite remover', async ({ page }) => {
  await page.goto('/');
  await go(page, 'Tarefas');
  await page.getByRole('button', { name: 'Deadline for Kabrito Post 01' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit task deadline' });
  await expect(dialog).toBeVisible();
  const deadline = dialog.getByRole('textbox', { name: 'Deadline' });
  await deadline.fill('2026-09-10 14:30');
  await dialog.getByRole('button', { name: 'Save deadline' }).click();
  await expect(page.getByText(/deadline 2026-09-10 14:30/)).toBeVisible();

  await page.getByRole('button', { name: 'Deadline for Kabrito Post 01' }).click();
  await page.getByRole('dialog', { name: 'Edit task deadline' }).getByRole('button', { name: 'Remove deadline' }).click();
  await expect(page.getByText(/Kabrito Post 01/).locator('..').getByText('sem deadline')).toBeVisible();
});

test('filtros do calendário usam as categorias reais dos blocos', async ({ page }) => {
  await page.goto('/');
  await goWeek(page);
  await page.getByRole('button', { name: 'Wellbeing', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete Almoço' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Important', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete Aula de inglês' }).first()).toBeVisible();
});

test('Focus aplica a duração escolhida antes de iniciar', async ({ page }) => {
  await page.goto('/');
  await go(page, 'Foco');
  await page.getByRole('button', { name: '5m break', exact: true }).click();
  await expect(page.getByText('Pick a task — 5m on the clock.')).toBeVisible();
  await expect(page.getByText('05:00')).toBeVisible();
  await page.getByRole('button', { name: 'Start focus' }).click();
  await expect(page.getByRole('button', { name: 'Pause session' })).toBeVisible();
});

test('filtros do Day exibem blocos fixos e pausas', async ({ page }) => {
  await page.goto('/');
  await goDay(page);
  await page.getByRole('button', { name: 'Wellbeing', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete Almoço' })).toBeVisible();
  await page.getByRole('button', { name: 'Important', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete Almoço' })).toBeVisible();
});

test('updates e hardware são acessíveis pela paleta', async ({ page }) => {
  await page.goto('/');
  await openCommands(page);
  await page.getByRole('textbox', { name: 'Type a command' }).fill('/hardware');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Hardware' })).toBeVisible();
  await openCommands(page);
  await page.getByRole('textbox', { name: 'Type a command' }).fill('/events');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Instrumentation' })).toBeVisible();
  await openCommands(page);
  await page.getByRole('textbox', { name: 'Type a command' }).fill('/updates');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Updates' })).toBeVisible();
});

test('assistente local responde sobre a agenda', async ({ page }) => {
  await page.goto('/');
  await go(page, 'Taby');
  const input = page.getByRole('textbox', { name: 'Pergunte ou peça uma ação' });
  await input.fill('qual a agenda de hoje?');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(/\d+ blocos na agenda/)).toBeVisible();
});

test('assistente confirma uma mudança antes de criar uma tarefa local', async ({ page }) => {
  await page.goto('/');
  await go(page, 'Taby');
  const input = page.getByRole('textbox', { name: 'Pergunte ou peça uma ação' });
  await input.fill('crie uma tarefa: Revisar briefing');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('button', { name: 'Confirmar' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText('Tarefa criada: Revisar briefing')).toBeVisible();
  await go(page, 'Tarefas');
  await expect(page.getByText('Revisar briefing')).toBeVisible();
});
```

- [ ] **Step 12: Ajustar os helpers dos specs de integrações**

Em `tests/e2e/integrations-webhook.spec.ts`, `tests/e2e/integrations-connectors.spec.ts` e `tests/e2e/connector-import.spec.ts`, substitua o corpo de `openIntegrations` por:

```ts
async function openIntegrations(page: Page) {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: 'Mais seções' }).click();
  await page.getByRole('menuitem', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('button', { name: 'Integrations', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Integrations' })).toBeVisible();
}
```

Em `tests/e2e/connector-import.spec.ts`, substitua as duas ocorrências de `await page.getByRole('button', { name: 'Tasks', exact: true }).click();` por `await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: 'Tarefas', exact: true }).click();` e a ocorrência de `await page.getByRole('button', { name: 'Settings', exact: true }).click();\n  await page.getByRole('button', { name: 'Integrations', exact: true }).click();` por:

```ts
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: 'Mais seções' }).click();
  await page.getByRole('menuitem', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('button', { name: 'Integrations', exact: true }).click();
```

`tests/e2e/assistant-integration-action.spec.ts` clica em `Taby` pelo nome exato; o botão do dock chama-se `Taby` — sem alteração.

- [ ] **Step 13: Gate e commit**

Run: `npm test && npx tsc --noEmit && npx vite build && npx playwright test`
Expected: verde. É o primeiro passo visível: sem moldura, dock embaixo, telas antigas dentro.

```bash
git add src/ui/shell src/ui/AgendaView.tsx src/ui/__tests__/shell.test.tsx src/ui/__tests__/data-bound-views.test.tsx src/App.tsx src/ui/CommandPalette.tsx src/ui/HelpView.tsx src/ui/AvailabilityView.tsx electron/main.cjs tests/e2e
git rm src/ui/AppShell.tsx
git commit -m "feat(ui): substituir a moldura por shell sem cromo com dock e agenda unificada"
```

---

## Task 5: Paleta unificada com o Taby

**Files:**
- Create: `src/ui/palette/mode.ts`
- Create: `src/ui/palette/commands.ts`
- Create: `src/ui/palette/CommandPalette.tsx`
- Create: `src/ui/palette/palette.css`
- Create: `src/ui/__tests__/palette.test.tsx`
- Delete: `src/ui/CommandPalette.tsx`
- Modify: `src/App.tsx:8`, linha do `{paletteOpen && <CommandPalette …/>}`
- Modify: `src/ui/__tests__/data-bound-views.test.tsx`
- Modify: `tests/e2e/smoke.spec.ts`

- [ ] **Step 1: Escrever o teste da paleta (falha: módulos não existem)**

Crie `src/ui/__tests__/palette.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createLocalHibiRuntime } from '../../ai/local-runtime'
import { LocalRepository } from '../../data/local-repository'
import { createSeedData } from '../../data/seed-data'
import { translate } from '../../i18n/dictionary'
import { CommandPalette } from '../palette/CommandPalette'
import { filterCommands, PALETTE_COMMANDS } from '../palette/commands'
import { paletteModeFor } from '../palette/mode'

const noop = () => undefined
const data = createSeedData()
const assistant = { runtime: createLocalHibiRuntime(new LocalRepository(data)), data, onEvent: noop }

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
    const markup = renderToStaticMarkup(<CommandPalette onClose={noop} onNavigate={noop} onEvent={noop} assistant={assistant} />)
    expect(markup).toContain('aria-label="Paleta de comandos"')
    expect(markup).toContain('placeholder="Digite um comando ou pergunte ao Taby"')
    expect(markup).toContain('Abrir agenda da semana')
    expect(markup).toContain('Acompanhar hábitos')
    expect(markup).not.toContain('role="alert"')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/ui/__tests__/palette.test.tsx --reporter=basic`
Expected: FAIL — `Cannot find module '../palette/CommandPalette'`.

- [ ] **Step 3: Criar `src/ui/palette/mode.ts` e `src/ui/palette/commands.ts`**

`src/ui/palette/mode.ts`:

```ts
export type PaletteMode = 'command' | 'assistant'

// Vazio ou começando com "/" é comando; qualquer outra coisa é uma frase para o Taby.
export const paletteModeFor = (input: string): PaletteMode => { const trimmed = input.trimStart(); return trimmed === '' || trimmed.startsWith('/') ? 'command' : 'assistant' }
```

`src/ui/palette/commands.ts`:

```ts
import type { DictionaryKey } from '../../i18n/dictionary'
import type { NavKey } from '../shell/routes'

export type PaletteCommand = Readonly<{ key: string; label: DictionaryKey; group: 'palette.group.navigate' | 'palette.group.work' | 'palette.group.system'; route: NavKey }>

export const PALETTE_COMMANDS: readonly PaletteCommand[] = [
  { key: '/day', label: 'command.day', group: 'palette.group.navigate', route: 'day' },
  { key: '/week', label: 'command.week', group: 'palette.group.navigate', route: 'week' },
  { key: '/tasks', label: 'command.tasks', group: 'palette.group.navigate', route: 'tasks' },
  { key: '/reminders', label: 'command.reminders', group: 'palette.group.navigate', route: 'reminders' },
  { key: '/habits', label: 'command.habits', group: 'palette.group.navigate', route: 'habits' },
  { key: '/goals', label: 'command.goals', group: 'palette.group.navigate', route: 'goals' },
  { key: '/notes', label: 'command.notes', group: 'palette.group.navigate', route: 'notes' },
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

- [ ] **Step 4: Criar `src/ui/palette/CommandPalette.tsx`**

```tsx
import React, { useEffect, useRef, useState } from 'react'
import { provenanceLabel } from '../../ai/assistant-turn'
import { useT } from '../../i18n/LocaleProvider'
import { failurePresentationFor } from '../assistant-presentation'
import type { NavKey } from '../shell/routes'
import { useAssistantTurn, type AssistantHost } from '../useAssistantTurn'
import { filterCommands } from './commands'
import { paletteModeFor } from './mode'
import './palette.css'

type Props = Readonly<{ onClose: () => void; onNavigate: (key: NavKey) => void; onEvent: (action: string, detail: string) => void; assistant: AssistantHost }>

// Um campo, dois modos: "/" filtra comandos; qualquer outra coisa vai para o Taby e confirma aqui mesmo.
export function CommandPalette({ onClose, onNavigate, onEvent, assistant }: Props) {
  const t = useT()
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const paletteRef = useRef<HTMLElement>(null)
  const turn = useAssistantTurn(assistant)
  const turnRef = useRef(turn)
  turnRef.current = turn
  const mode = paletteModeFor(query)
  const matches = filterCommands(query, t)
  const { state } = turn
  const settled = state.status === 'replied' || state.status === 'executed' || state.status === 'cancelled' || state.status === 'failure'

  useEffect(() => { setSelectedIndex(0) }, [query])
  // Fechar nunca executa nada: uma confirmação pendente é cancelada e um stream é parado.
  useEffect(() => () => { turnRef.current.dismiss() }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); if (turnRef.current.dismiss() === 'close') onClose(); return }
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

  const openCommand = (index: number) => { const item = matches[index]; if (!item) return; onEvent('command', item.key); onNavigate(item.route) }
  const send = () => { const message = query.trim(); if (!message) return; setSubmitted(message); setQuery(''); void turn.ask(message) }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (mode === 'command') {
      if (!matches.length) return
      if (event.key === 'ArrowDown') { event.preventDefault(); setSelectedIndex((index) => (index + 1) % matches.length) }
      if (event.key === 'ArrowUp') { event.preventDefault(); setSelectedIndex((index) => (index - 1 + matches.length) % matches.length) }
      if (event.key === 'Enter') { event.preventDefault(); if (query.trim() === '' && settled) onClose(); else openCommand(selectedIndex) }
      return
    }
    if (event.key === 'Enter') { event.preventDefault(); if (state.status === 'confirmation') void turn.confirm(); else if (state.status !== 'streaming') send() }
  }

  const footer = state.status === 'confirmation' ? [t('palette.footer.confirm'), t('palette.footer.cancel')] : state.status === 'streaming' ? [t('palette.footer.cancel')] : mode === 'assistant' ? [t('palette.footer.ask'), t('palette.footer.close')] : [t('palette.footer.select'), t('palette.footer.open'), t('palette.footer.close')]
  const failure = state.status === 'failure' ? failurePresentationFor(state.failure) : null
  const provenance = state.status === 'streaming' || state.status === 'replied' || state.status === 'confirmation' ? provenanceLabel(state.provenance) : ''

  return <div className="overlay" onMouseDown={onClose}><section ref={paletteRef} className="palette" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={t('palette.title')}>
    <div className="palette-search"><span>{mode === 'command' ? '/' : '✦'}</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={handleKeyDown} placeholder={t('palette.placeholder')} aria-label={t('palette.placeholder')} aria-activedescendant={mode === 'command' && matches[selectedIndex] ? `command-${matches[selectedIndex].key.slice(1)}` : undefined} /></div>
    {mode === 'command' && matches.map((item, index) => <button type="button" className="command-row" id={`command-${item.key.slice(1)}`} data-selected={index === selectedIndex} key={item.key} onMouseEnter={() => setSelectedIndex(index)} onClick={() => openCommand(index)}><kbd>{item.key}</kbd><span>{t(item.label)}</span><small>{t(item.group)}</small></button>)}
    {mode === 'command' && !matches.length && <p className="empty">{t('palette.empty')}</p>}
    {submitted !== null && <div className="palette-turn" aria-live="polite">
      <div className="palette-line"><span className="tag orange">{t('palette.you')}</span><span>{submitted}</span></div>
      {state.status === 'streaming' && <div className="palette-line" role="status"><span className="tag orange">{t('palette.taby')}</span><div><strong>{state.text || (state.cancelRequested ? t('palette.cancelling') : t('palette.thinking'))}</strong>{provenance && <small className="palette-provenance">{provenance}</small>}<div className="palette-actions"><button type="button" className="outline" onClick={turn.stop}>{t('palette.stop')}</button></div></div></div>}
      {state.status === 'replied' && <div className="palette-line"><span className="tag orange">{t('palette.taby')}</span><div><span className="palette-reply">{state.text}</span>{provenance && <small className="palette-provenance">{provenance}</small>}</div></div>}
      {state.status === 'confirmation' && <div className="palette-line" role="alert"><span className="tag amber">{t('palette.confirmation')}</span><div><strong className="palette-reply">{state.text}</strong>{provenance && <small className="palette-provenance">{provenance}</small>}<div className="palette-actions"><button type="button" className="primary" onClick={() => void turn.confirm()}>{t('palette.confirm')}</button><button type="button" className="outline" onClick={() => void turn.cancelConfirmation()}>{t('palette.cancel')}</button></div></div></div>}
      {state.status === 'executed' && <div className="palette-line"><span className={`tag ${state.partialFailure ? 'amber' : 'green'}`}>{t('palette.taby')}</span><span className="palette-reply">{state.summary}</span></div>}
      {state.status === 'cancelled' && <div className="palette-line"><span className="tag amber">{t('palette.taby')}</span><span>{state.text}</span></div>}
      {failure && <div className="palette-line" role="alert"><span className="tag amber">{t('palette.taby')}</span><div><strong>{failure.title}</strong><p className="muted">{failure.detail}</p><div className="palette-actions">{failure.canRetry && <button type="button" className="outline" onClick={() => void turn.retry()}>{t('palette.retry')}</button>}{failure.canUseLocalFallback && <button type="button" className="primary" onClick={() => void turn.useLocalFallback()}>{t('palette.useLocal')}</button>}</div></div></div>}
    </div>}
    <div className="palette-footer">{footer.map((hint) => <span key={hint}>{hint}</span>)}</div>
  </section></div>
}
```

- [ ] **Step 5: Criar `src/ui/palette/palette.css`**

```css
/* Só o que a paleta unificada acrescenta; a lista de comandos reaproveita .command-row de theme.css. */
.palette { background: var(--bg-surface-2); color: var(--text-primary); }
.palette-search input { color: var(--text-primary); font-family: var(--font-serif); }
.palette-search input::placeholder { color: var(--text-tertiary); }
.palette .command-row { color: var(--text-primary); }
.palette .command-row:hover, .palette .command-row[data-selected="true"] { background: var(--bg-subtle); }
.palette .empty { color: var(--text-secondary); }

.palette-turn { display: grid; gap: var(--space-2); padding: var(--space-3) var(--space-5) var(--space-4); border-top: 1px solid var(--stroke-subtle); }
.palette-line { display: flex; gap: var(--space-3); align-items: flex-start; font-size: var(--type-14); line-height: var(--leading-14); }
.palette-line > .tag { flex: none; margin-top: 2px; }
.palette-line > div { display: grid; gap: var(--space-1); }
.palette-reply { white-space: pre-line; }
.palette-provenance { display: block; color: var(--text-tertiary); font-size: var(--type-12); line-height: var(--leading-12); }
.palette-actions { display: flex; gap: var(--space-2); margin-top: var(--space-1); }
.palette-actions .primary { background: var(--text-primary); color: var(--bg-canvas); }
.palette-actions .outline { border-color: var(--stroke-default); color: var(--text-primary); }
```

- [ ] **Step 6: Rodar o teste da paleta (passa)**

Run: `npx vitest run src/ui/__tests__/palette.test.tsx --reporter=basic`
Expected: 3 passed.

- [ ] **Step 7: Ligar a paleta nova em `src/App.tsx` e apagar a antiga**

Substitua a linha 8 (`import { CommandPalette } from './ui/CommandPalette';`) por `import { CommandPalette } from './ui/palette/CommandPalette';`.

Substitua a linha `{paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} onNavigate={(next) => { setPaletteOpen(false); navigate(next, 'command'); }} onEvent={log} />}` por:

```tsx
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} onNavigate={(next) => { setPaletteOpen(false); navigate(next, 'command'); }} onEvent={log} assistant={{ runtime: aiRuntime, data, onEvent: log, onCompanionEvent: dispatchCompanion, onCompanionError: (text) => dispatchCompanion({ type: 'error.raised', requestId: companionId('error'), text, nowMs: Date.now(), expiresInMs: 5_000 }) }} />}
```

Apague `src/ui/CommandPalette.tsx`.

Em `src/ui/__tests__/data-bound-views.test.tsx`, substitua `import { CommandPalette } from '../CommandPalette';` por:

```tsx
import { CommandPalette } from '../palette/CommandPalette';
import { createLocalHibiRuntime } from '../../ai/local-runtime';
import { LocalRepository } from '../../data/local-repository';
```

e, no teste `exposes habits and goals through the dock menu and commands`, substitua a linha da paleta e as duas asserções por:

```tsx
    const palette = renderToStaticMarkup(<CommandPalette onClose={onEvent} onNavigate={onEvent} onEvent={onEvent} assistant={{ runtime: createLocalHibiRuntime(new LocalRepository(data)), data, onEvent }} />);
    expect(palette).toContain('Acompanhar hábitos');
    expect(palette).toContain('Revisar metas');
```

- [ ] **Step 8: Atualizar os rótulos da paleta em `tests/e2e/smoke.spec.ts`**

Substitua todas as ocorrências de `'Command palette'` por `'Paleta de comandos'` (quatro), todas as de `'Type a command'` por `'Digite um comando ou pergunte ao Taby'` (três) e `/Open weekly schedule/` por `/Abrir agenda da semana/` (uma).

- [ ] **Step 9: Gate e commit**

Run: `npm test && npx tsc --noEmit && npx vite build && npx playwright test`
Expected: verde.

```bash
git add src/ui/palette src/ui/__tests__/palette.test.tsx src/ui/__tests__/data-bound-views.test.tsx src/App.tsx tests/e2e/smoke.spec.ts
git rm src/ui/CommandPalette.tsx
git commit -m "feat(ui): unificar a paleta de comandos com o Taby e confirmar no lugar"
```

---

## Task 6: E2E da fundação e fechamento

**Files:**
- Create: `tests/e2e/foundation.spec.ts`
- Modify: `docs/IMPLEMENTATION_STATUS_AND_PLAN.md`

- [ ] **Step 1: Escrever `tests/e2e/foundation.spec.ts`**

```ts
import { test, expect, type Page } from '@playwright/test';

const dock = (page: Page) => page.getByRole('navigation', { name: 'Navegação principal' });
const palette = (page: Page) => page.getByRole('dialog', { name: 'Paleta de comandos' });
const askTaby = async (page: Page, phrase: string) => {
  await page.goto('/');
  await page.keyboard.press('Meta+K');
  await palette(page).getByRole('textbox').fill(phrase);
  await page.keyboard.press('Enter');
};
const openSettings = async (page: Page) => {
  await dock(page).getByRole('button', { name: 'Mais seções' }).click();
  await page.getByRole('menuitem', { name: 'Ajustes', exact: true }).click();
};

test('⌘K com frase pede confirmação e Confirmar executa no lugar', async ({ page }) => {
  await askTaby(page, 'crie uma tarefa: Revisar briefing');
  const alert = palette(page).getByRole('alert');
  await expect(alert.getByRole('button', { name: 'Confirmar' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(palette(page).getByText('Tarefa criada: Revisar briefing')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(palette(page)).toHaveCount(0);
  await dock(page).getByRole('button', { name: 'Tarefas', exact: true }).click();
  await expect(page.getByText('Revisar briefing')).toBeVisible();
});

test('Cancelar no cartão da paleta não cria nada', async ({ page }) => {
  await askTaby(page, 'crie uma tarefa: Revisar briefing');
  await palette(page).getByRole('alert').getByRole('button', { name: 'Cancelar' }).click();
  await expect(palette(page).getByText('Ação cancelada.')).toBeVisible();
  await page.keyboard.press('Escape');
  await dock(page).getByRole('button', { name: 'Tarefas', exact: true }).click();
  await expect(page.getByText('Revisar briefing')).toHaveCount(0);
});

test('Esc em dois tempos: primeiro cancela a confirmação, depois fecha', async ({ page }) => {
  await askTaby(page, 'crie uma tarefa: Revisar briefing');
  await expect(palette(page).getByRole('alert')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(palette(page)).toBeVisible();
  await expect(palette(page).getByText('Ação cancelada.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(palette(page)).toHaveCount(0);
});

test('fechar a paleta com confirmação pendente cancela em vez de executar', async ({ page }) => {
  await askTaby(page, 'crie uma tarefa: Revisar briefing');
  await expect(palette(page).getByRole('alert')).toBeVisible();
  await page.mouse.click(10, 10);
  await expect(palette(page)).toHaveCount(0);
  await dock(page).getByRole('button', { name: 'Tarefas', exact: true }).click();
  await expect(page.getByText('Revisar briefing')).toHaveCount(0);
});

test('⌘K responde consultas sem sair da tela', async ({ page }) => {
  await askTaby(page, 'qual a agenda de hoje?');
  await expect(palette(page).getByText(/\d+ blocos na agenda/)).toBeVisible();
  await expect(page.getByText('Make room for')).toBeVisible();
});

test('tema manual sobrevive ao reload e o sistema volta a mandar em "Sistema"', async ({ page }) => {
  await page.goto('/');
  await openSettings(page);
  await page.getByRole('combobox', { name: 'Tema' }).selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await openSettings(page);
  await page.getByRole('combobox', { name: 'Tema' }).selectOption('system');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('trocar o idioma troca o dock na hora e persiste', async ({ page }) => {
  await page.goto('/');
  await openSettings(page);
  await page.getByRole('combobox', { name: 'Language' }).selectOption('en');
  await expect(page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('button', { name: 'Tasks', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('a Agenda lembra a última visualização', async ({ page }) => {
  await page.goto('/');
  await dock(page).getByRole('button', { name: 'Agenda', exact: true }).click();
  await page.getByRole('tab', { name: 'Semana' }).click();
  await expect(page.getByText('Mon 07 — Sun 13')).toBeVisible();
  await dock(page).getByRole('button', { name: 'Home', exact: true }).click();
  await dock(page).getByRole('button', { name: 'Agenda', exact: true }).click();
  await expect(page.getByText('Mon 07 — Sun 13')).toBeVisible();
  await page.reload();
  await dock(page).getByRole('button', { name: 'Agenda', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Semana' })).toHaveAttribute('aria-selected', 'true');
});

test('o dock navega por teclado com setas', async ({ page }) => {
  await page.goto('/');
  await dock(page).getByRole('button', { name: 'Home', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(dock(page).getByRole('button', { name: 'Tarefas', exact: true })).toBeFocused();
  await page.keyboard.press('End');
  await expect(dock(page).getByRole('button', { name: 'Comandos' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(palette(page)).toBeVisible();
});
```

- [ ] **Step 2: Rodar só este spec**

Run: `npx playwright test tests/e2e/foundation.spec.ts --reporter=line`
Expected: 9 passed. Se "tema manual" falhar porque a máquina de CI prefere escuro, a asserção final (`light` em `system`) deve virar `page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')`.

- [ ] **Step 3: Registrar no plano de status**

Em `docs/IMPLEMENTATION_STATUS_AND_PLAN.md`, adicione à tabela "Status atual", após a linha de Compartilhamento:

```
| Nova UI — fundação | Implementado localmente | Tokens claro/escuro com contraste testado, i18n `pt`/`en` ao vivo, shell sem moldura com dock, paleta `⌘K` unificada com o Taby; telas ainda com o visual anterior dentro do shell novo. |
```

- [ ] **Step 4: Gate final e commit**

Run: `npm test && npx tsc --noEmit && npx vite build && npx playwright test`
Expected: verde, com 9 e2e a mais.

```bash
git add tests/e2e/foundation.spec.ts docs/IMPLEMENTATION_STATUS_AND_PLAN.md
git commit -m "test(ui): cobrir dock, paleta com Taby, tema, idioma e agenda de ponta a ponta"
```

---

## Notas de integração

- A branch parte de `feat/ai-production-integrations`. Quando o PR #1 entrar em `main`, o PR desta branch aponta para `main`; até lá, aponta para `feat/ai-production-integrations`. Não há trabalho de merge além disso, porque nada desta branch existe na outra.
- `.superpowers/` (mockups do brainstorming) está no `.gitignore`; não entra no commit.
- Os `.fig` em `/Volumes/Games/Projetos/Hibi/UI` ficam fora do repositório.
- O que fica explicitamente para os sub-projetos seguintes: redesenhar cada tela na ordem do dock (Home, Tarefas, Agenda, Foco, Taby, depois as de `···`), migrar as strings de cada uma para o dicionário, e apagar `theme.css` quando a última migrar.
