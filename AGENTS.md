# AGENTS.md — como trabalhar no Hibi

Hibi é um app macOS local-first (Electron + React 19 + TypeScript) com assistente (Taby), notch nativo e integrações. A fonte operacional do status é [`docs/IMPLEMENTATION_STATUS_AND_PLAN.md`](docs/IMPLEMENTATION_STATUS_AND_PLAN.md).

Duas IAs implementam o projeto em paralelo: **Claude** (Claude Code, no Mac do usuário) e **Codex**. Este arquivo é o contrato entre as duas. Leia inteiro antes de começar.

## 1. Quem está com o quê

A reserva de itens é feita na issue **[Quem está com o quê](https://github.com/contatobentodsgn/Hibi/issues/48)**. Antes de começar um item, reserve-o lá. Não comece um item reservado pela outra IA.

### Territórios

| | Claude | Codex |
|---|---|---|
| Caminhos | `electron/`, `native/`, `src/data/`, `scripts/` | `src/ui/` (telas, componentes, CSS), `src/domain/review*`, tokens de tema |
| Itens | Fase 5.5 SQLite + restore points · 5.6 atalho global, tamanho e local do Taby · Fase 4 atualizador e crash recovery | Fase 5.4 Review com sugestões · 5.7 visual novo das telas · 5.6 tint |

Os itens do Codex se verificam inteiros com Vitest, `tsc`, build web e Playwright, que rodam também em Linux. Os do Claude precisam do Mac: addon nativo, Electron real e Keychain.

Fora do seu território, **não edite**. Se precisar de algo de lá, peça na issue ou no corpo do PR.

### Reservado ao usuário

Nenhuma IA começa estes itens sem decisão explícita do usuário:
- conta, nuvem e backup remoto;
- Google Calendar e iCloud;
- voz e modelo local;
- webhook propondo alterações;
- "atividade de apps" (rastrear app em uso, domínio ou URL);
- assinatura e notarização;
- validação manual do notch;
- dispositivo físico Taby.

## 2. Arquivos compartilhados: protocolo

Estes arquivos aparecem em quase toda mudança. Sem protocolo, cada PR conflita.

| Arquivo | Regra |
|---|---|
| `docs/IMPLEMENTATION_STATUS_AND_PLAN.md` | **Só o Claude edita.** Descreva o que fez no corpo do PR; o Claude registra no documento. |
| `electron/preload.cjs`, `src/global.d.ts`, handlers IPC em `electron/main.cjs`, `EXPECTED_CHANNELS` em `electron/main.test.cjs` | **Contrato do IPC: só o Claude.** Precisa de um canal novo? Peça no PR ou na issue, com o formato do payload. |
| `package.json`, `.github/workflows/ci.yml` | **Só o Claude.** Dependência nova, script ou passo de CI: peça. |
| `src/i18n/dictionary.ts` | Os dois editam, mas **só acrescentam**, cada um no seu bloco e com prefixo próprio (ex.: `review.*` para o Codex; `data.*` e `shortcut.*` para o Claude). Nunca reordene nem reformate chaves existentes. `pt` é a fonte e o `tsc` exige a mesma chave em `en`. |
| `src/App.tsx`, `src/ui/SettingsView.tsx` | Funcionalidade nova entra num **arquivo novo**. No arquivo quente, só a linha que o monta. As Configurações recebem o visual novo por último. |

## 3. Fluxo de trabalho

1. **Nunca use o mesmo diretório que a outra IA.**
   - O Codex, se rodar neste Mac, usa um clone próprio fora do repositório do Claude (ex.: `/Volumes/Games/Projetos/Hibi/Hibi-codex`).
   - O Claude trabalha em `.worktrees/<nome>` e remove esses worktrees depois do merge. Não crie nada seu ali.
2. **Branches com prefixo:** `claude/...` ou `codex/...`. Não mexa em branch com o prefixo da outra IA.
3. **Um item por PR**, pequeno. Antes de abrir, `git fetch origin main && git rebase origin/main`.
4. **Merge só com a CI verde e mergeabilidade `CLEAN`, um PR de cada vez.** Quem mergeia depois rebaseia de novo e espera a CI outra vez.
5. **O corpo do PR diz:**
   - o que mudou e por quê;
   - as provas (item 5);
   - os números reais das suítes;
   - quais arquivos compartilhados foram tocados, e em que linha.
6. **E2E com duas IAs no mesmo Mac:** o Playwright sobe o próprio servidor na porta 4273 e **falha** se ela estiver ocupada. O Codex roda com `HIBI_E2E_PORT=4380`.

## 4. Regras técnicas (cada uma veio de um defeito real)

- **Clone ou worktree novo:** rode `npm --prefix native/notch install` antes de qualquer teste ou build. As dependências nativas são gitignored; sem elas o build quebra e o `node --test` roda menos testes.
- **Confira o código de saída real de cada verificação.** `cmd | tail` devolve o status do `tail`. Use `if ! cmd > saida.txt 2>&1; then echo FALHOU; fi`. Nunca afirme que algo passou sem ter lido a saída.
- **Rode verificações em primeiro plano e espere terminar.** Não encerre o trabalho esperando um processo em segundo plano.
- **Fuso:**
  - nunca `toISOString().slice(0,10)` para dia de calendário;
  - use `src/domain/date-context.ts` (`todayKey`, `localDateKey`, `localNoon`);
  - horários de bloco e lembrete são hora de parede flutuante, sem offset (ver `docs/superpowers/specs/2026-09-11-floating-local-time-design.md`);
  - a suíte precisa passar em `America/Sao_Paulo` e em `Pacific/Kiritimati`.
- **Módulo usado pelo processo principal e pelo renderer é `.mjs`.** O dev server do Vite não carrega CommonJS de fora do `node_modules`: testes e build ficam verdes e o app em desenvolvimento não abre.
- **Testes:**
  - `src/` usa Vitest **sem DOM**: nada de jsdom ou @testing-library. Componentes usam `renderToStaticMarkup`;
  - `electron/`, `native/` e `scripts/` usam `node --test`;
  - e2e é Playwright em `tests/e2e/`, com o dublê de `window.hibiDesktop` via `page.addInitScript` (veja `tests/e2e/local-api-confirmation.spec.ts`). O dublê guarda **lista** de ouvintes, não um só.
- **Todo teste novo precisa de prova de que morde.**
  - Quebre de propósito o que ele deveria pegar e mostre o teste falhando.
  - Reverta e confirme `git diff` vazio.
  - Não afirme texto de código-fonte (`expect(source).toContain(...)`). Afirmação de **ausência** ("este caminho nunca chama X") pode ficar.
- **Empacotamento:** tudo o que o processo principal carrega precisa entrar no `app.asar`. `scripts/package-files.test.mjs` verifica isso.
- **Privacidade:**
  - não rastreie app em uso, domínio, URL nem ritmo de digitação;
  - conversas do Taby não entram no backup do workspace;
  - credenciais nunca em código, log ou relatório.
- **Git:**
  - nunca `git add -A`, nunca `git stash`;
  - commits com caminhos explícitos, um por unidade lógica, mensagem no imperativo;
  - não reescreva história de `main`.

## 5. Bateria de verificação

Rode antes de abrir PR, com o código de saída conferido em cada passo:

```text
npm test
TZ=Pacific/Kiritimati npm test
npm run parity:check
npm run safety:renderer
npx tsc --noEmit
npm run build          # no macOS; em Linux use: npx vite build
npx playwright test    # com HIBI_E2E_PORT se houver outra IA rodando e2e
```

A CI roda o mesmo conjunto em Linux, exceto o addon nativo.
