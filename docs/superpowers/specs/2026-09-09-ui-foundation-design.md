# Nova UI do Hibi — Sub-projeto 1: Fundação

Data: 2026-09-09. Estado: aprovado em brainstorming, aguardando revisão da spec.

## Contexto

O Hibi deixa de ser réplica visual do Hey Taby e ganha interface própria, mantendo **todas** as funcionalidades atuais (16 rotas, runtime do assistente, companion no notch, integrações). A [auditoria dos kits UI8](../../ui-kit-audit.md) concluiu que só o vocabulário de tokens e a escala tipográfica deles valem importar; a estética escolhida é outra.

Decisões tomadas com o usuário, em ordem:

| Decisão | Escolha |
| --- | --- |
| Direção visual | **Papel evoluído** — serifa nos títulos, laranja como acento, superfícies opacas, escuro quente derivado do papel |
| Estrutura | **Sem moldura**, dock flutuante embaixo |
| Dock | Home · Tarefas · Agenda · Foco · Taby; `···` e `⌘K` para o resto |
| Agenda | Unifica Dia e Semana numa seção com alternância interna |
| Idioma | **Bilíngue real** `pt`/`en`, padrão `pt`, seletor de Ajustes funcionando |
| Taby | **Paleta unificada**: `⌘K` aceita comando ou frase e confirma no lugar |
| Tema | Segue o sistema por padrão; escolha manual claro/escuro/sistema em Ajustes |
| Estratégia | **Fundação primeiro, depois tela a tela**, cada etapa fechando verde |

A reconstrução é grande demais para um plano só. Este documento cobre apenas o **sub-projeto 1**: o que toda tela depende. As telas atuais passam a viver dentro do shell novo sem alteração — parecem deslocadas por um período, de propósito, em troca de feedback contínuo. Cada tela é reconstruída em sub-projeto próprio, na ordem do dock, com seus e2e reescritos no mesmo passo.

## Fora de escopo deste sub-projeto

- Redesenhar qualquer tela (Home, Tarefas, Agenda, Foco, Taby, e as de `···`).
- Empacotar fontes; migrar as respostas do runtime (`local-runtime.ts`) para o dicionário.
- Atalhos `⌘1–5`, animação do dock além de `motion.css`, testes visuais de captura.
- Estados vazios e onboarding (as ilustrações do kit entram aí, recoloridas para o papel).

## 1. Tokens e temas

**Arquivo novo `src/ui/tokens.css`**, formatado normalmente (não minificado), com vocabulário semântico:

| Grupo | Tokens |
| --- | --- |
| Fundo | `--bg-canvas`, `--bg-surface-1`, `--bg-surface-2`, `--bg-surface-3`, `--bg-subtle`, `--bg-highlight` |
| Texto | `--text-primary`, `--text-secondary`, `--text-tertiary`, `--text-hero`, `--text-on-accent` |
| Traço | `--stroke-subtle`, `--stroke-default`, `--stroke-focus` |
| Acento | `--accent`, `--accent-soft` |
| Categorias | `--cat-work`, `--cat-break`, `--cat-learning`, `--cat-important`, `--cat-wellbeing`, cada uma com `-soft` e `-text` |
| Profundidade | `--depth-card`, `--depth-float` (dock e paleta) |
| Escalas | `--space-1…12` em múltiplos de 4 px; `--radius-1…4` = 8/12/16/24; `--type-*` com os pares `12/16, 14/20, 16/24, 20/24, 24/28, 32/40, 40/48, 48/56` |
| Fontes | `--font-serif` Georgia, `--font-sans` Inter via pilha do sistema, `--font-mono` pilha `ui-monospace` |

**Valores.** Claro = a paleta atual mapeada: canvas `#f3f2ef`, superfície 1 `#ffffff`, texto primário `#151515`, secundário `#77746f`, traço `#dedbd4`, acento `#fb7017`, hero `#e86517`. Escuro = derivado quente: canvas `#1a1917`, superfície 1 `#232220`, texto primário `#f1efe9`, secundário `#9c978d`, traço `#33312c`; o acento permanece `#fb7017`. Todo par texto/fundo listado no §5 precisa atingir WCAG AA (4,5:1); onde o laranja falhar como texto, `--text-hero` escuro é ajustado, não o acento.

**Mecanismo.** `data-theme="light" | "dark"` no `<html>`. `src/ui/theme.ts` expõe `resolveTheme(preference, systemPrefersDark)` (puro) e `applyThemePreference(preference)`, que grava `hibi-theme` = `system | light | dark` em localStorage e, em `system`, escuta `matchMedia('(prefers-color-scheme: dark)')`. Ajustes › Geral ganha o seletor.

**Ponte com o CSS existente.** `theme.css` continua importado, mas suas 8 variáveis viram aliases: `--paper: var(--bg-canvas)`, `--ink: var(--text-primary)`, `--muted: var(--text-secondary)`, `--line: var(--stroke-default)`, `--orange: var(--accent)`, `--green: var(--cat-break-soft)`, `--blue: var(--cat-learning-soft)`, `--amber: var(--cat-important-soft)`. As telas antigas ganham escuro parcial sem edição. Cores fixas dentro de `theme.css` (ex.: `background:#fff` dos cards) ficam como estão até cada tela migrar. `notch-overlay.css` **não muda**: o overlay flutua sobre o notch físico, preto em qualquer tema, e suas cores fixas são deliberadas.

## 2. i18n

**Pasta `src/i18n/`:**

- `dictionary.ts` — `pt` é a fonte de verdade; `en` é declarado como `Record<keyof typeof pt, string>`, então chave faltante falha em `tsc`. Chaves por área: `nav.*`, `dock.*`, `palette.*`, `settings.language.*`, `settings.theme.*`, `agenda.*`.
- `LocaleProvider` e `useT()` — contexto no `App`; `t('nav.tasks')`. Sem biblioteca.
- `useFormat()` — `formatDate`, `formatTime`, `formatRange`, `formatWeekday` via `Intl.DateTimeFormat` com o locale ativo (`pt-BR` / `en-US`) e `hourCycle` derivado da preferência 24h existente (`hibi-time-format`).

**Persistência.** Mantém a chave `hibi-language` e a compatibilidade com `workspace-backup.ts`, que já valida `pt | en`. Padrão `pt`.

**Escopo.** O mecanismo, mais as strings do que este sub-projeto toca: dock, faixa do topo, paleta, seletores de idioma e tema. Telas não reconstruídas mantêm seu inglês fixo. O seletor de Ajustes passa a trocar o `LocaleProvider` imediatamente — hoje só grava a preferência.

## 3. Shell

**Pasta `src/ui/shell/`** substitui `AppShell.tsx` e a moldura em `App.tsx` (`.app-frame`, `.topbar`, `.content` são removidos):

- **`AppShell`** — canvas em papel ocupando a janela; **faixa do topo** fina com `HIBI › {seção}` (é o `<nav aria-label>` de orientação e a região arrastável, `-webkit-app-region: drag`); região de conteúdo; `Dock`.
- **`Dock`** — cinco itens primários, botão `···` que abre um menu com Lembretes, Notas, Hábitos, Metas, Revisão, Ajustes, Ajuda, Eventos, Feedback, Atualizações e Hardware, e o botão `⌘K`. `role="navigation"`, `aria-current="page"` no ativo, setas para mover o foco, `Home`/`End`. Rótulos do dicionário. Flutua com `--depth-float`.
- **Rotas** — `NavKey` mantém todas as chaves atuais e ganha `agenda`. `agenda` renderiza `DayView` ou `WeekView` com alternância interna persistida em `hibi-agenda-view` (`day | week`). Os comandos `/day` e `/week` continuam válidos e levam a `agenda` no modo correspondente. Nenhum comando ou rota existente deixa de funcionar.
- **Janela** — `electron/main.cjs` passa a criar a janela principal com `titleBarStyle: 'hiddenInset'` (só macOS; sem efeito nos outros). Os semáforos ficam sobre a faixa do topo.
- **Telas atuais** — entram na região de conteúdo sem alteração. O overlay do notch (`?overlay=notch`) não muda.

## 4. Paleta + Taby

**Extração.** A lógica do assistente sai de `TabyView.tsx` para `src/ai/assistant-turn.ts` (reducer puro `assistantTurnReducer` + tipos de estado) e `src/ui/useAssistantTurn.ts` (hook que liga o reducer ao `AiTurnRuntime`: `runTurn`, stream, `confirm`, `cancelConfirmation`, `cancel`, eventos do companion via `companionEventFor`). Estados: `idle → streaming → (replied | confirmation | failure) → (executed | cancelled)`. `TabyView` passa a usar o hook; **não é redesenhada**.

**`CommandPalette` reconstruída** em `src/ui/palette/`, um campo só:

- Entrada começando com `/` → **modo comando**: a lista determinística existente, filtrada; `↑↓` e `↵`.
- Qualquer outra entrada + `↵` → **modo Taby**: `runTurn({ surface: 'desktop' })`; resposta em stream dentro da paleta com proveniência (provedor · modelo · tokens); botão Parar durante a geração.
- `confirmation` presente → **cartão Confirmar/Cancelar** abaixo da resposta; `↵` confirma, `Esc` cancela via `cancelConfirmation`. Os eventos do companion são os mesmos da página, então o notch espelha.
- Falha do provedor → `failurePresentationFor` com "Tentar novamente" e "Usar assistente local".
- `paletteModeFor(input)` é uma função pura.

**Comportamento.** Abre por `⌘K`, por `/` fora de campos de texto e pelo botão do dock. `role="dialog"` com nome do dicionário, foco preso, `Esc` fecha — com confirmação pendente, o primeiro `Esc` cancela a confirmação e o segundo fecha. Fechar a paleta nunca executa nada.

**Invariantes preservados.** `AiToolPolicy`, digest vinculado, expiração de 60 s, `onAudit`/`onUsage`. A paleta é uma segunda superfície sobre o mesmo runtime.

## 5. Testes

Gate por passo: `npm test && npx tsc --noEmit && npx vite build && npx playwright test`.

**Vitest (sem DOM):**

- `tokens.test.ts` — lê `tokens.css`; todo token semântico definido em `:root` e em `[data-theme="dark"]`; contraste WCAG AA ≥ 4,5:1 para `text-primary|secondary|tertiary` × `bg-canvas|surface-1|surface-2|surface-3` e `text-on-accent` × `accent`, nos dois temas.
- `i18n.test.ts` — `useFormat` para `pt`/`en` × 12h/24h; `en` cobre todas as chaves (redundante ao `tsc`, mas explícito).
- `theme.test.ts` — `resolveTheme` e persistência com `matchMedia` falso.
- `palette-mode.test.ts` — `paletteModeFor`.
- `assistant-turn.test.ts` — transições do reducer, inclusive falha, cancelamento durante stream e `Esc` com confirmação pendente.

**Playwright:**

- `smoke.spec.ts` — navegação reescrita para o dock com rótulos `pt`; testes de conteúdo de tela permanecem.
- Specs de integrações — só o helper `openIntegrations` muda (dock `···` › Ajustes › Integrações).
- Novos: `···` abre o restante; `⌘K` comando; `⌘K` frase → resposta → Confirmar executa e Cancelar não; `Esc` em dois tempos; tema manual persiste após reload; trocar idioma troca o dock na hora; Agenda lembra Dia/Semana.

## Ordem de execução sugerida

1. Tokens + `theme.ts` + aliases + seletor de tema (fecha verde: nada visível muda no claro).
2. i18n + seletores de idioma (fecha verde: strings antigas intactas).
3. Reducer e hook do assistente; `TabyView` migra (fecha verde: comportamento idêntico).
4. Shell + dock + `agenda` + `hiddenInset`; `smoke.spec.ts` reescrito (o passo visível).
5. Paleta unificada + e2e novos.

## Critério de conclusão

O app abre sem moldura, com dock, paleta que conversa com o Taby e confirma no lugar, claro/escuro seguindo o sistema ou a escolha manual, dock e paleta em `pt`/`en` trocáveis ao vivo — e **todas** as 16 rotas, comandos, integrações e o notch funcionando como antes. Suíte completa verde.
