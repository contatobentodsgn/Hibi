# Review suggestions design

## Objective

Turn Review from a snapshot into a local, explainable queue of safe planning suggestions: duplicate open tasks and open tasks with an urgent missing schedule.

## Boundaries

- The feature is deterministic and offline. It does not call the assistant or a remote service.
- Suggestions never mutate tasks or blocks. A person opens the relevant screen to make a change.
- Dismissal is local to the mounted Review screen. Persistence would require a workspace schema change and is intentionally outside Codex's territory.
- Completed and paused tasks never produce suggestions.

## Duplicate task rule

A duplicate group contains at least two open tasks with the same normalized title, folder, category, duration and deadline. Title normalization trims, collapses whitespace, removes accents and compares case-insensitively. A group is suppressed when every member is already linked to a distinct schedule block: that pattern represents planned repeated work, not accidental duplication.

Each group receives a stable id from its sorted task ids and evidence listing the matching fields. The UI never uses a count as an identifier.

## Missing schedule rule

A task receives a missing-schedule suggestion only when it is open, has a positive duration, is not linked to a schedule block, and has a valid deadline on or before the next seven local calendar days. The evidence names the estimated duration and deadline. Tasks with no deadline, an invalid deadline, a distant deadline, or a paused/completed state are intentionally omitted to avoid nagging.

## UI

Review retains its current snapshot. Below it, an accessible Suggestions section contains independent cards for duplicate groups and missing schedules. Each card shows the evidence, a confidence label, a contextual navigation action, and a non-destructive Dismiss button. Each kind can also be dismissed in one batch. The cards are derived from `data` at render time, so changes elsewhere automatically remove stale suggestions; dismissals only suppress currently matching stable ids.

## Verification

- Domain tests prove exact matching, accent/whitespace normalization, intentional repeated planned work, deadline horizon and excluded statuses.
- UI static rendering proves evidence and batch controls exist.
- Playwright proves dismissal hides only the intended card and batch dismissal does not change workspace data.
- Every new test gets a mutation proof before the final suite.
