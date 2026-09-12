# Review suggestions implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic, explainable Review suggestions for duplicate tasks and urgent tasks missing a schedule.

**Architecture:** A pure domain evaluator derives stable suggestion objects from tasks and blocks. ReviewView renders those objects and holds only non-persistent dismissal state; navigation remains the existing callback.

**Tech Stack:** React 19, TypeScript, Vitest, Playwright.

---

### Task 1: Derive review suggestions in the domain

**Files:**
- Modify: `src/domain/review.ts`
- Modify: `src/domain/__tests__/review.test.ts`

- [x] Write failing tests for normalized exact duplicate tasks, scheduled repeat suppression, missing-schedule deadline horizon, and excluded task states.
- [x] Run `npx vitest run src/domain/__tests__/review.test.ts` and record the expected failing assertion.
- [x] Add bounded suggestion types, stable ids, evidence and `findReviewSuggestions` without changing stored workspace data.
- [x] Re-run the focused domain test and verify it passes.
- [x] Prove the duplicate test bites by temporarily breaking exact grouping, observe failure, then revert the mutation.
- [x] Commit only `src/domain/review.ts` and its test.

### Task 2: Render and dismiss suggestions

**Files:**
- Modify: `src/ui/ReviewView.tsx`
- Create: `src/ui/__tests__/ReviewView.test.tsx`
- Create: `src/ui/review-suggestions.css`

- [x] Write a failing static-render test for evidence, per-card dismissal and batch dismissal controls.
- [x] Run `npx vitest run src/ui/__tests__/ReviewView.test.tsx` and record the expected failure.
- [x] Render the derived cards, with local dismissal state and existing navigation only.
- [x] Add compact Review-specific styles that retain keyboard focus visibility.
- [x] Re-run the focused UI test and verify it passes.
- [x] Prove the static test bites by removing an accessible dismissal label, observe failure, then revert the mutation.
- [ ] Commit only Review UI, style and test files.

### Task 3: Verify behavior in the app

**Files:**
- Create: `tests/e2e/review-suggestions.spec.ts`

- [x] Write a failing Playwright test that seeds duplicate and urgent unscheduled tasks, dismisses a card, and verifies local storage is unchanged.
- [x] Run `HIBI_E2E_PORT=4380 npx playwright test tests/e2e/review-suggestions.spec.ts` and record the expected failure.
- [x] Implement only the smallest UI behavior needed to make the test pass.
- [x] Re-run the focused E2E test and verify it passes.
- [x] Prove the E2E test bites by temporarily bypassing dismissal state, observe failure, then revert the mutation.
- [ ] Commit the E2E test.

### Task 4: Complete verification and handoff

**Files:**
- No status-document edits; Claude owns `docs/IMPLEMENTATION_STATUS_AND_PLAN.md`.

- [x] Run `npm test` and `TZ=Pacific/Kiritimati npm test`, checking each exit code.
- [x] Run `npm run parity:check`, `npm run safety:renderer`, `npx tsc --noEmit`, and `npm run build`, checking each exit code.
- [x] Run `HIBI_E2E_PORT=4380 npx playwright test`, checking its exit code.
- [ ] Fetch `origin/main`, rebase the branch, rerun the complete battery if the rebase changes code, push, and open a PR with the required body.
