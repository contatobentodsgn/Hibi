# Notas Atelier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar à tela de Notas um resumo contextual e cartões de leitura sem alterar os dados locais.

**Architecture:** Um selector puro deriva ordem, última atualização e notas sem pasta. Um componente de resumo o consome, enquanto `NotesView` reutiliza os callbacks atuais e apenas troca a estrutura visual da lista.

**Tech Stack:** React 19, TypeScript, Vitest, Playwright e CSS local.

---

### Task 1: Derivar ritmo das notas

**Files:**
- Create: `src/ui/note-rhythm.ts`
- Test: `src/ui/__tests__/note-rhythm.test.ts`

- [ ] Escrever primeiro um teste para `deriveNoteRhythm(notes)`, que espera a nota de maior `updatedAt`, total e quantidade sem pasta.
- [ ] Rodar `npx vitest run src/ui/__tests__/note-rhythm.test.ts`; ele deve falhar porque o selector não existe.
- [ ] Criar o selector mínimo, ordenando uma cópia e retornando `{ latest, total, unfiled }`.
- [ ] Rodar novamente; inverter a ordem de prioridade como prova de mutação, confirmar a falha e restaurar.
- [ ] Commit explícito de selector e teste.

### Task 2: Montar o contexto visual

**Files:**
- Create: `src/ui/NotesAtelierSummary.tsx`
- Create: `src/ui/notes-atelier.css`
- Modify: `src/ui/NotesView.tsx`
- Modify: `src/ui/__tests__/data-bound-views.test.tsx`

- [ ] Escrever primeiro uma renderização que espera `aria-label="Notes capture summary"`, `Latest note`, `Unfiled` e `Showing`.
- [ ] Rodar `npx vitest run src/ui/__tests__/data-bound-views.test.tsx`; deve falhar antes da montagem.
- [ ] Criar o resumo isolado e montá-lo depois do formulário de criação, mantendo busca, pastas e callbacks.
- [ ] Remover temporariamente a montagem para comprovar a falha, restaurar e repetir o teste.
- [ ] Commit explícito dos arquivos de UI e teste.

### Task 3: Proteger a interação

**Files:**
- Create: `tests/e2e/notes-atelier.spec.ts`

- [ ] Criar e2e que abre Notas, encontra a região nomeada, cria `Planning note` e confirma que a região permanece visível.
- [ ] Rodar `HIBI_E2E_PORT=4380 npx playwright test tests/e2e/notes-atelier.spec.ts` e registrar o resultado.
- [ ] Remover temporariamente a montagem do resumo, confirmar que o e2e falha, restaurar e reexecutar.
- [ ] Commit explícito do e2e.

### Task 4: Verificar e publicar

**Files:**
- Verify only.

- [ ] Rodar `npm test`, `TZ=Pacific/Kiritimati npm test`, `npm run parity:check`, `npm run safety:renderer`, `npx tsc --noEmit` e `npm run build`.
- [ ] Rodar `HIBI_E2E_PORT=4380 npx playwright test` e conferir o código de saída.
- [ ] Executar `git fetch origin main && git rebase origin/main`, abrir uma PR pequena e relatar contagens e as duas provas de mutação.
