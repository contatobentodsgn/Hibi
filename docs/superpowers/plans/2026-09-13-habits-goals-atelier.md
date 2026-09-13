# Hábitos e Metas Atelier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evidenciar ritmo e direção nas telas atuais de Hábitos e Metas.

**Architecture:** Um selector puro por domínio produz apenas contagens e o próximo item. Dois componentes isolados os renderizam; as views existentes mantêm todos os formulários e callbacks.

**Tech Stack:** React 19, TypeScript, Vitest, Playwright e CSS local.

---

### Task 1: Criar os selectors puros

**Files:**
- Create: `src/ui/progress-rhythm.ts`
- Test: `src/ui/__tests__/progress-rhythm.test.ts`

- [ ] Escrever primeiro testes para conclusão diária de hábitos, maior sequência e próxima meta aberta.
- [ ] Confirmar que falham antes do módulo existir; implementar o mínimo; inverter deliberadamente a ordem da próxima meta para provar a mutação; restaurar.
- [ ] Commit explícito.

### Task 2: Montar os dois resumos

**Files:**
- Create: `src/ui/HabitsAtelierSummary.tsx`
- Create: `src/ui/GoalsAtelierSummary.tsx`
- Create: `src/ui/progress-atelier.css`
- Modify: `src/ui/HabitsView.tsx`
- Modify: `src/ui/GoalsView.tsx`
- Modify: `src/ui/__tests__/data-bound-views.test.tsx`

- [ ] Escrever renderizações que exigem as regiões `Habits rhythm summary` e `Goals direction summary`.
- [ ] Confirmar a falha, montar componentes antes das listas, manter callbacks intactos e provar remoção da montagem com falha; restaurar.
- [ ] Commit explícito.

### Task 3: Cobrir no navegador e publicar

**Files:**
- Create: `tests/e2e/habits-goals-atelier.spec.ts`

- [ ] Abrir cada rota por Mais seções, localizar a região nomeada e usar uma interação existente quando disponível.
- [ ] Rodar com porta 4380; mutar o rótulo da região para provar falha e restaurar.
- [ ] Executar a bateria obrigatória, rebasear em `origin/main` e abrir uma PR pequena com contagens e provas.
