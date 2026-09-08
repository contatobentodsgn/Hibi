# Notch Interaction Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Garantir que o notch do mascote seja sempre visual e passivo, enquanto toda interação ocorra em uma superfície independente abaixo dele.

**Architecture:** O `CompanionRouter` classificará apresentações antes do transporte. O host nativo/AppKit e o fallback Electron receberão apenas conteúdo visual; confirmações e controles serão renderizados em uma `ActionSurface` separada, com foco e acessibilidade próprios. A fronteira será validada no router, nos adaptadores e no runtime.

**Tech Stack:** TypeScript, React, Electron, AppKit/Objective-C++, Vitest, Node test runner e Playwright.

---

## Mapa de arquivos

- Modify: `src/companion/contracts.ts` — tornar explícita a distinção entre apresentação visual e superfície interativa.
- Modify: `src/companion/controller.ts` e `src/companion/reducer.ts` — preservar ações no fluxo do companion sem encaminhá-las ao host visual.
- Create: `src/companion/interaction-boundary.ts` — classificador puro para separar conteúdo visual de ações.
- Test: `src/companion/interaction-boundary.test.ts` — contrato unitário da separação.
- Modify: `electron/notch-window.cjs` — rotear apresentações pelo classificador e manter o host nativo passivo.
- Modify: `electron/notch-window.test.cjs` — regressões para fallback, seleção de tela e fronteira.
- Modify: `native/notch/src/notch.mm` — remover qualquer semântica interativa do host visual e manter ações fora do painel do mascote.
- Modify: `native/notch/layout.test.cjs` — invariantes AppKit de foco, mouse e acessibilidade.
- Modify: `src/ui/NotchOverlay.tsx` e `src/ui/notch-overlay.css` — garantir que o overlay visual não renderize controles e documentar a superfície de ação separada.
- Modify: `src/main.tsx` — montar a superfície interativa em rota/host independente quando aplicável.
- Test: `src/ui/__tests__/notch-boundary.test.tsx` — ausência de botões no host visual e acessibilidade somente na ação.
- Modify: `docs/notch-manual-test-plan.md` — incluir a nova regra como critério de aprovação manual.

### Task 1: Criar o classificador de fronteira

**Files:**
- Create: `src/companion/interaction-boundary.ts`
- Create: `src/companion/interaction-boundary.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Adicionar testes para `classifyCompanionPresentation`:

```ts
it('sends passive content to the visual host', () => {
  expect(classifyCompanionPresentation({ actions: [], interaction: 'passthrough' })).toEqual('visual');
});

it('sends every action-bearing presentation to the action surface', () => {
  expect(classifyCompanionPresentation({ actions: [{ id: 'confirm', label: 'Confirmar' }], interaction: 'capture' })).toEqual('action');
});
```

- [ ] **Step 2: Rodar o teste para confirmar a falha**

Run: `npx vitest run src/companion/interaction-boundary.test.ts`

Expected: FAIL porque o classificador ainda não existe.

- [ ] **Step 3: Implementar o classificador mínimo**

Criar uma função pura que retorne `'action'` quando houver ao menos uma ação ou `interaction === 'capture'`; nos demais casos, retornar `'visual'`.

- [ ] **Step 4: Rodar o teste para confirmar a passagem**

Run: `npx vitest run src/companion/interaction-boundary.test.ts`

Expected: PASS.

- [ ] **Step 5: Commitar**

```bash
git add src/companion/interaction-boundary.ts src/companion/interaction-boundary.test.ts
git commit -m "feat: define notch interaction boundary"
```

### Task 2: Integrar a fronteira ao transporte Electron/AppKit

**Files:**
- Modify: `electron/notch-window.cjs`
- Modify: `electron/notch-window.test.cjs`
- Modify: `native/notch/src/notch.mm`
- Modify: `native/notch/layout.test.cjs`

- [ ] **Step 1: Escrever regressões**

Verificar que uma apresentação com ações não chama `showHost` visual e é entregue à superfície de ação; verificar também que conteúdo passivo continua click-through, sem foco e sem captura.

- [ ] **Step 2: Rodar as regressões para confirmar a falha**

Run: `node --test electron/notch-window.test.cjs native/notch/layout.test.cjs`

Expected: o novo contrato falha antes da integração.

- [ ] **Step 3: Integrar o classificador**

No manager, classificar antes de escolher o host. Manter o painel visual sem ações; direcionar confirmações ao painel independente abaixo do notch e preservar a seleção da tela com câmera quando houver monitor externo.

- [ ] **Step 4: Compilar e testar**

Run: `npm run native:build && node --test electron/notch-window.test.cjs native/notch/layout.test.cjs`

Expected: build concluído e todos os testes PASS.

- [ ] **Step 5: Commitar**

```bash
git add electron/notch-window.cjs electron/notch-window.test.cjs native/notch/src/notch.mm native/notch/layout.test.cjs
git commit -m "fix: keep notch host passive"
```

### Task 3: Separar o overlay visual da superfície de ação

**Files:**
- Modify: `src/ui/NotchOverlay.tsx`
- Modify: `src/ui/notch-overlay.css`
- Modify: `src/main.tsx`
- Create or modify: `src/ui/__tests__/notch-boundary.test.tsx`

- [ ] **Step 1: Escrever o teste de acessibilidade**

Renderizar uma apresentação passiva e confirmar que não existem `button`, `input` ou elemento focável no host visual. Renderizar uma apresentação interativa na superfície de ação e confirmar `role="dialog"`, ações acessíveis e foco inicial.

- [ ] **Step 2: Rodar o teste para confirmar a falha**

Run: `npx vitest run src/ui/__tests__/notch-boundary.test.tsx`

Expected: FAIL para o caso interativo até a montagem separada existir.

- [ ] **Step 3: Implementar a separação visual**

Manter `NotchOverlay` sem controles para apresentações passivas. Criar a montagem independente da `ActionSurface`, posicionada abaixo do notch, com `Confirmar`/`Cancelar`, foco, Escape e suporte a VoiceOver.

- [ ] **Step 4: Verificar visualmente e por teste**

Run: `npx vitest run src/ui/__tests__/notch-boundary.test.tsx`

Expected: PASS, sem controles no host visual e com controles somente na superfície de ação.

- [ ] **Step 5: Commitar**

```bash
git add src/main.tsx src/ui/NotchOverlay.tsx src/ui/notch-overlay.css src/ui/__tests__/notch-boundary.test.tsx
git commit -m "feat: separate action surface from visual notch"
```

### Task 4: Validar integração, documentação e build

**Files:**
- Modify: `docs/notch-manual-test-plan.md`
- Modify: `docs/notch-manual-results.md` somente com evidências efetivamente coletadas.

- [ ] **Step 1: Atualizar o plano manual**

Adicionar como critérios: o mascote não deve receber foco nem clique; a superfície abaixo deve conter todas as ações; trocar monitor não pode enviar controles para o host visual.

- [ ] **Step 2: Rodar a suíte completa**

Run: `npm test && npm run test:e2e && npm run native:notch:smoke`

Expected: testes internos, E2E e smoke nativo PASS.

- [ ] **Step 3: Rodar o build de produção**

Run: `npm run build`

Expected: TypeScript, native addon e bundle Vite concluídos sem erro.

- [ ] **Step 4: Fazer revisão de escopo**

Confirmar que não há ações, foco ou acessibilidade interativa no host visual e que a documentação não marca como manualmente aprovado nenhum cenário não observado.

- [ ] **Step 5: Commitar**

```bash
git add docs/notch-manual-test-plan.md docs/notch-manual-results.md
git commit -m "docs: document notch interaction boundary"
```
