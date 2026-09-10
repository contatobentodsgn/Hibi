# Notion Sync v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar sincronização manual bidirecional, confirmada e recuperável entre as tarefas do Hibi e a base Hibi Tasks no workspace Kizuna Std's Notion.

**Architecture:** O conector Electron concentra o contrato HTTP atual do Notion e só executa escritas preparadas e confirmadas. Um reconciliador TypeScript puro compara tarefas locais, registros remotos e checkpoints persistidos; a interface produz a prévia, resolve conflitos e coordena o cartão de confirmação no app e no notch.

**Tech Stack:** Electron 44, React 19, TypeScript 7, Vitest, Node test runner, Notion REST API `2026-03-11`, macOS Keychain.

## Handoff status — 10 Sep 2026

**Implementation status:** The functional core of Notion Sync v1 is implemented and committed through `41a17b8`. A real round-trip validation in **Kizuna Std's Notion** has already created the `Hibi Tasks` database, discovered its data source, and successfully created, read, and updated a disposable task. The validation result was sanitized and confirmed mapped fields and revision changes.

**Do not repeat:** Rebuilding the connector, mapping, reconciliation, settings persistence, secure bridge, or review UI. Those are implemented. Never expose or print the Notion token; it remains in the macOS Keychain.

**Required completion work for the next agent:**

- [ ] Inspect the current worktree and make the small `NotionSyncPanel` settings-save callback cleanup: return/use the saved settings directly instead of reading a potentially stale `settingsFor` closure.
- [ ] Add or complete the opt-in live Notion v1 harness so it covers the repeatable create → read → update → conflict lifecycle. Keep real writes explicitly gated.
- [ ] Add interaction-level coverage for: no write before confirmation, Cancel in the app, Confirm/Cancel through the notch, and retrying only failed items.
- [ ] Validate a genuine two-sided conflict against a disposable Notion record and confirm the UI defaults to Skip rather than overwriting either side.
- [ ] Run the full regression suite: `npm test`, `npm run build`, and `npm run test:e2e`; fix any regressions.
- [ ] Launch the Electron app and manually test setup, sync preview, confirmation in both surfaces, cancellation, partial failure/retry, and displayed last-sync state.
- [ ] Update `docs/IMPLEMENTATION_STATUS_AND_PLAN.md` and create a sanitized validation record under `docs/validation/`. Mark Notion Sync v1 as validated only after the preceding checks; keep Slack explicitly deferred.
- [ ] Decide whether to archive or rename the disposable “Hibi validation task” in the real Hibi Tasks database. This is cleanup, not a functional blocker.

**Known implementation facts:**

- Current Notion API version is `2026-03-11` and queries use Notion data sources.
- Writes are prepared/confirmed; conflict defaults are safe (`skip`).
- The Notion UI includes setup, preview, per-item decision, batch confirmation, notch confirmation, persisted checkpoints, summary, and retry of pending failures.
- Focused Electron, UI, and TypeScript checks were green before this handoff. Full regression and manual UI validation remain mandatory.

---

### Task 1: Modelo local e reconciliador puro

**Files:**
- Modify: `src/domain/models.ts`
- Modify: `src/data/local-repository.ts`
- Create: `src/integrations/notion-sync.ts`
- Create: `src/integrations/__tests__/notion-sync.test.ts`
- Modify: `src/data/__tests__/local-repository.test.ts`

- [x] Escrever testes falhos provando que tarefas novas e editadas recebem `updatedAt`, sem quebrar dados antigos.
- [x] Executar `npx vitest run src/data/__tests__/local-repository.test.ts` e confirmar falha pela ausência da revisão local.
- [x] Adicionar `updatedAt?: string` ao modelo e carimbar criação/edição no repositório.
- [x] Executar o teste e confirmar passagem.
- [x] Escrever testes falhos para normalização, hash, item novo local/remoto, alteração unilateral, item inalterado, conflito e duplicata.
- [x] Executar `npx vitest run src/integrations/__tests__/notion-sync.test.ts` e confirmar falha pela ausência do reconciliador.
- [x] Implementar tipos `NotionTaskRecord`, `NotionSyncCheckpoint`, `NotionSyncPlanItem`, `NotionSyncPlan`, `notionTaskHash` e `buildNotionSyncPlan`.
- [x] Executar os dois arquivos de teste e confirmar passagem.
- [x] Commit: `feat: add deterministic Notion task reconciliation`.

### Task 2: Contrato atual do Notion e esquema Hibi Tasks

**Files:**
- Modify: `electron/connectors/notion.cjs`
- Modify: `electron/connectors/connectors.test.cjs`

- [x] Escrever testes falhos para o cabeçalho `2026-03-11`, paginação, descoberta de `data_source_id`, consulta de fonte de dados e mapeamento dos sete campos.
- [ ] Executar `node --test electron/connectors/connectors.test.cjs` e confirmar as falhas esperadas contra o contrato antigo.
- [x] Centralizar `NOTION_VERSION`, criar paginação opaca e trocar consultas para `/data_sources/{id}/query`.
- [x] Implementar normalização completa de páginas e serialização completa de tarefas.
- [x] Escrever testes falhos para localizar/criar Hibi Tasks sob uma página e validar/reparar o esquema.
- [x] Implementar ações preparáveis `notion.database.create`, `notion.page.create` e `notion.page.update`, sempre validadas por allowlist de propriedades.
- [x] Executar o teste do conector e confirmar passagem.
- [x] Commit: `feat: migrate Notion connector to data sources`.

### Task 3: Estado persistido e execução em lote recuperável

**Files:**
- Modify: `electron/connector-settings.cjs`
- Modify: `electron/connector-settings.test.cjs`
- Modify: `electron/integrations.cjs`
- Modify: `electron/integrations.test.cjs`
- Modify: `src/integrations/contracts.ts`

- [ ] Escrever testes falhos para persistência sanitizada de `databaseId`, `dataSourceId`, `workspaceLabel`, `parentPageId`, última sincronização, resumo e checkpoints por tarefa.
- [x] Implementar normalização, limites e migração compatível das configurações existentes.
- [ ] Escrever testes falhos para preparação/executação de lote, resultado parcial e repetição somente dos itens pendentes.
- [x] Implementar ação `notion.sync.batch` que expande operações validadas, executa sequencialmente, preserva êxitos e devolve erros sanitizados por item.
- [x] Executar `node --test electron/connector-settings.test.cjs electron/integrations.test.cjs` e confirmar passagem.
- [x] Commit: `feat: persist recoverable Notion sync state`.

### Task 4: Ponte segura Electron–renderer

**Files:**
- Modify: `electron/main.cjs`
- Modify: `electron/preload.cjs`
- Modify: `src/global.d.ts`
- Modify: `src/integrations/contracts.ts`
- Modify: `electron/integrations.test.cjs`

- [ ] Escrever testes falhos para os contratos de setup, leitura da base e atualização do resumo sem expor credencial.
- [x] Adicionar IPCs específicos para obter estado do Notion, preparar setup, ler registros e persistir resultado/checkpoints.
- [x] Expor somente métodos estreitos no preload e tipos equivalentes no renderer.
- [x] Confirmar que nenhum retorno inclui token, identidade de conta ou corpo remoto integral fora dos campos mapeados.
- [x] Executar testes Electron e `npx tsc --noEmit`.
- [x] Commit: `feat: expose safe Notion sync bridge`.

### Task 5: Prévia, conflitos, confirmação e retry na interface

**Files:**
- Modify: `src/ui/IntegrationsView.tsx`
- Modify: `src/ui/__tests__/IntegrationsView.test.tsx`
- Modify: `src/ui/SettingsView.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.ts`
- Modify: `src/theme.css`

- [ ] Escrever testes falhos para workspace/base, última sincronização, contagens, botão Sincronizar agora, conflitos e erro com retry.
- [x] Implementar a prévia com decisões `Manter Hibi`, `Manter Notion`, `Criar cópia` e `Ignorar`.
- [ ] Escrever teste falho provando que nenhuma escrita ocorre antes de clicar Confirmar.
- [x] Preparar o lote, exibir Confirmar/Cancelar no cartão e no notch e executar somente após confirmação correspondente.
- [x] Aplicar mutações locais completas, atualizar vínculos/checkpoints apenas para operações concluídas e preservar pendências.
- [x] Implementar retry limitado aos itens falhos.
- [x] Executar os testes de interface e App, depois `npx tsc --noEmit`.
- [x] Commit: `feat: add Notion sync review and confirmation UI`.

### Task 6: Segurança, falhas e documentação operacional

**Files:**
- Modify: `electron/integrations.cjs`
- Modify: `electron/integrations.test.cjs`
- Modify: `electron/connectors/connectors.test.cjs`
- Modify: `docs/IMPLEMENTATION_STATUS_AND_PLAN.md`
- Modify: `scripts/test-live-connectors.mjs`
- Modify: `scripts/test-live-connectors.test.mjs`

- [ ] Escrever testes falhos para 401/403, base não compartilhada, 429 com `Retry-After`, esquema incompatível e logs sanitizados.
- [x] Implementar códigos de falha estáveis e mensagens acionáveis sem dados privados.
- [ ] Estender o harness ao fluxo Notion v1 de leitura/criação/atualização/conflito, mantendo opt-in explícito para escritas.
- [ ] Marcar Notion Sync v1 como implementado no plano oficial e Slack como adiado.
- [ ] Executar os testes focados e confirmar passagem.
- [ ] Commit: `test: cover live Notion sync lifecycle`.

### Task 7: Auditoria completa e validação real

**Files:**
- Modify: `docs/IMPLEMENTATION_STATUS_AND_PLAN.md`
- Create: `docs/validation/2026-09-09-notion-sync-v1.md`

- [ ] Executar `npm test`.
- [ ] Executar `npm run build`.
- [ ] Executar `npm run test:e2e`.
- [ ] Iniciar o app e validar setup/estado na tela Integrações.
- [ ] Com opt-in de escrita, validar no workspace Kizuna Std's Notion: criar, ler, atualizar e produzir conflito em registros descartáveis.
- [ ] Confirmar que cancelar não escreve e que retry não duplica êxitos.
- [ ] Verificar Keychain, arquivos rastreados e logs sem imprimir o token.
- [ ] Registrar evidências sanitizadas no documento de validação e atualizar a matriz oficial.
- [ ] Commit: `docs: record Notion Sync v1 validation`.
