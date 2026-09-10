# Notion Sync v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar sincronização manual bidirecional, confirmada e recuperável entre as tarefas do Hibi e a base Hibi Tasks no workspace Kizuna Std's Notion.

**Architecture:** O conector Electron concentra o contrato HTTP atual do Notion e só executa escritas preparadas e confirmadas. Um reconciliador TypeScript puro compara tarefas locais, registros remotos e checkpoints persistidos; a interface produz a prévia, resolve conflitos e coordena o cartão de confirmação no app e no notch.

**Tech Stack:** Electron 44, React 19, TypeScript 7, Vitest, Node test runner, Notion REST API `2026-03-11`, macOS Keychain.

## Estado final — 10 Sep 2026

Núcleo implementado e acabamento concluído. O gate completo passou nesta data: Vitest
45/214, `node --test` 130, `npm run build` e Playwright 46. Registro de evidências em
[`docs/validation/2026-09-10-notion-sync-v1.md`](../../validation/2026-09-10-notion-sync-v1.md).

**Fechado nesta rodada:**

- [x] Configurações salvas passam a ser a fonte de verdade no painel; a fiação devolvia o
      closure obsoleto em vez do valor recém-gravado.
- [x] Harness ao vivo cobre `criar → ler → atualizar → conflito` do Notion, atrás de um
      terceiro opt-in, escrevendo pelo mesmo lote que a interface envia.
- [x] Cobertura de interação: nenhuma escrita antes de confirmar, Cancelar no app,
      Confirmar e Cancelar pelo notch, e retry só dos pendentes — todos verificados por mutação.
- [x] Suíte completa, build e verificação visual do painel nos dois estados.
- [x] Status oficial atualizado: Notion concluído, Slack adiado.
- [x] **Defeito corrigido:** `prepareWrite` do Notion não era idempotente, e a criação da
      base falhava *depois* da aprovação do usuário. Detalhes no registro de validação.

**Continua aberto, por depender de credencial ou de ação física:**

- [ ] Rodar o ciclo de vida contra o workspace Kizuna (token no Keychain, não extraído).
- [ ] Conflito real de dois lados no serviço — cenário já automatizado, falta executar.
- [ ] Fluxo manual no app Electron com o notch real.
- [ ] Decidir o destino da tarefa de validação criada em 2026-09-09 no workspace Kizuna.

**Não refazer:** conector, mapeamento, reconciliação, persistência de configurações, ponte
segura e interface de revisão estão implementados. O token nunca sai do Keychain.

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
- [x] Estender o harness ao fluxo Notion v1 de leitura/criação/atualização/conflito, mantendo opt-in explícito para escritas.
- [x] Marcar Notion Sync v1 como implementado no plano oficial e Slack como adiado.
- [ ] Executar os testes focados e confirmar passagem.
- [ ] Commit: `test: cover live Notion sync lifecycle`.

### Task 7: Auditoria completa e validação real

**Files:**
- Modify: `docs/IMPLEMENTATION_STATUS_AND_PLAN.md`
- Create: `docs/validation/2026-09-09-notion-sync-v1.md`

- [x] Executar `npm test`.
- [x] Executar `npm run build`.
- [x] Executar `npm run test:e2e`.
- [x] Validar setup/estado na tela Integrações (servidor de desenvolvimento; o app Electron empacotado continua pendente).
- [ ] Com opt-in de escrita, validar no workspace Kizuna Std's Notion: criar, ler, atualizar e produzir conflito em registros descartáveis.
- [ ] Confirmar que cancelar não escreve e que retry não duplica êxitos.
- [ ] Verificar Keychain, arquivos rastreados e logs sem imprimir o token.
- [x] Registrar evidências sanitizadas no documento de validação e atualizar a matriz oficial.
- [ ] Commit: `docs: record Notion Sync v1 validation`.
