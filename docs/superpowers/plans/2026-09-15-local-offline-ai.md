# Assistente local offline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar modelo leve offline e voz local sem bloquear o app ou enviar dados para a rede.

**Architecture:** O processo principal controla um worker local e uma pasta de modelos validada; o preload expõe uma API mínima de lifecycle. O renderer mantém fallback heurístico e apresenta streaming, erro e preferência de voz.

**Tech Stack:** Electron, Node worker, APIs nativas macOS via bridge existente, React/TypeScript, Vitest, Node test e Playwright.

---

### Task 1: Contrato e armazenamento do modelo

**Files:**
- Create: `electron/local-model-contract.cjs`
- Test: `electron/local-model-contract.test.cjs`
- Modify: `docs/local-capability-contracts.md`

- [x] Escrever testes para manifesto versionado, limite de 3 GB, checksum SHA-256 e rejeição de qualquer caminho fora de `.hibi-local-models` dentro do diretório de dados do app.
- [x] Implementar `validateModelManifest(manifest, dataRoot)` e `modelPath(manifest, dataRoot)` sem criar diretórios fora de `dataRoot`.
- [x] Rodar `node --test electron/local-model-contract.test.cjs` e confirmar todos os casos.
- [x] Documentar que o modelo opcional fica no armazenamento do app e nunca no workspace pessoal do Mac.

### Task 2: Worker offline

**Files:**
- Create: `electron/local-model-worker.cjs`
- Test: `electron/local-model-worker.test.cjs`

- [x] Testar mensagens `load`, `prompt`, `cancel` e `shutdown` com um engine mock que emite três deltas.
- [x] Implementar o worker com limite de prompt, limite de saída, cancelamento por request id e ausência de imports de rede.
- [x] Rodar `node --test electron/local-model-worker.test.cjs`.

### Task 3: Ponte principal/preload

**Files:**
- Modify: `electron/main.cjs`
- Modify: `electron/preload.cjs`
- Modify: `src/global.d.ts`
- Test: `electron/main.test.cjs`

- [ ] Adicionar handlers `hibi:local-model:state`, `hibi:local-model:run`, `hibi:local-model:cancel` e `hibi:local-model:shutdown`, com payloads limitados.
- [ ] Ligar a API do preload aos eventos de estado e streaming, sem expor `process`, caminhos ou engine.
- [ ] Testar que todos os canais têm paridade main/preload e que cancelamento é idempotente.
- [ ] Rodar `node --test electron/main.test.cjs`.

### Task 4: Voz local

**Files:**
- Create: `electron/local-voice.cjs`
- Create: `electron/local-voice.test.cjs`
- Modify: `electron/main.cjs`
- Modify: `electron/preload.cjs`
- Modify: `src/ui/SettingsView.tsx`

- [ ] Definir estados `unavailable`, `requesting`, `ready`, `listening`, `speaking` e `error`.
- [ ] Implementar o adaptador nativo macOS com permissões explícitas e fallback silencioso quando o recurso não existir.
- [ ] Testar mock de microfone ocupado, cancelamento, idioma `pt-BR` e síntese interrompida.
- [ ] Rodar `node --test electron/local-voice.test.cjs`.

### Task 5: UI e fallback

**Files:**
- Modify: `src/ui/TabyView.tsx`
- Modify: `src/ui/SettingsView.tsx`
- Modify: `src/ui/__tests__/TabyView.test.tsx`
- Create: `tests/e2e/local-ai.spec.ts`

- [ ] Adicionar instalação opcional, estado do modelo, botão de testar voz e indicação offline.
- [ ] Integrar streaming/cancelamento ao Taby e manter fallback heurístico quando o modelo não estiver instalado.
- [ ] Cobrir instalação, erro, streaming, cancelamento e preferência de voz em Playwright.
- [ ] Rodar testes unitários, `npx tsc --noEmit`, build e e2e direcionado.
