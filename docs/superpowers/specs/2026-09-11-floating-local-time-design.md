# Floating local time design

## Objective

Block and reminder times are stored with a hardcoded São Paulo offset —
`2026-09-11T08:00:00-03:00` — for every user, anywhere. The codebase then reads that
field two contradictory ways: by string slice (`slice(0,10)` for the day, `slice(11,16)`
for the time) in `DayView`, `WeekView`, `HomeView`, `RemindersView` and
`domain/schedule.ts`, which ignores the offset entirely; and as an absolute instant in
`i18n/format.ts`, which renders it with `timeZone: 'America/Sao_Paulo'`.

The two agree only because everything writes exactly `-03:00`. The offset is decorative
until something compares that value to the real clock — and two things do:

- **Notifications.** In `electron/notifications.cjs`, `nextOccurrence` fires a *recurring*
  reminder through `localDateTime(...)` (local wall clock, correct anywhere) but a
  *one-time* reminder through `Date.parse(entry.at)` (absolute instant anchored at
  `-03:00`). The same 09:00 reminder therefore fires at a different real time depending on
  whether it repeats: 13:00 in Lisbon, 21:00 in Tokyo. The contradiction sits inside one
  function, which reads `entry.at` as an instant in `parseDate(entry.at)` and as wall-clock
  digits in `entry.at.slice(11, 16)`.
- **Calendar export.** `WeekView.exportIcs` does `b.start.replace(/[-:]/g,'')`. On a stored
  value that yields `20260911T0800000300` — the offset glued on as `0300` — which is not a
  valid `DTSTART`. Verified. Export is broken today.

## Decisions

| Topic | Decision |
| --- | --- |
| Semantics | A block or reminder time is **floating local wall-clock**: `2026-09-11T08:00:00`, no offset. 08:00 is 08:00 wherever the person is. This is `DTSTART` without `TZID` in iCal, and it is what most of the code already does — every screen slices digits, and the scheduler's recurring path already builds the fire time from local components. |
| Why not absolute instants | The alternative is to store a real instant using the user's actual offset. Rejected: for a local-first, single-user planner a study block is an appointment on the wall clock, not a point in absolute time. Someone who travels should still study at 08:00, not at 08:00-São-Paulo rendered as 12:00. There is no cross-timezone sharing in this app for absolute instants to serve. |
| Rendering | Drop the fixed `timeZone` from `i18n/format.ts`; formatters render in the viewer's real zone. This changes **no screen today**: `useFormat()` has no production consumer — only its own test — and every view reads digits directly. Verified before deciding. |
| Migration of stored data | A stored value carrying an offset or `Z` is converted to its **São Paulo wall-clock digits** and then loses the suffix. `...T08:00:00-03:00` → `...T08:00:00`; `...T12:00:00Z` → `...T09:00:00`. This preserves *exactly what each person saw*, because both current readings displayed the São Paulo digits. The screen does not change; only the wrong firing time is corrected. |
| Where migration lives | `LocalRepository.fromJson`, the single door every persisted value passes through (`localStorage` load, `replace()`, backup restore). `StudyData` has no schema version — the `2` in the document versions the *backup envelope*, not the workspace — so a versioned migration would have to be invented for this alone. It coexists with `repairWeeklyAnchor`, already there. |
| Scheduler independence | `electron/notifications.cjs` stops parsing `at` as an instant and reads its digits, so it behaves identically whether the stored value carries `-03:00`, `Z`, or nothing. That makes the scheduler correct **before** the migration lands, and lets the two changes ship as separate pull requests touching disjoint files. |
| ICS | The floating form is also the fix for export: `2026-09-11T08:00:00` → `20260911T080000`, a valid `DTSTART`. Import stops stamping `-03:00` onto events arriving from any zone. |

## Data

The transformation is defined on `block.start`, `block.end` and `reminder.schedule.at`.

- A value **carrying an offset or `Z`** is re-expressed as the São Paulo wall clock for that
  instant, then the suffix is dropped.
- A value **already floating** is returned untouched, by reference — not a copy. Tests assert
  identity (`toBe`), so a silent copy fails too.
- A **malformed** value is left exactly as it is. When in doubt, do not write.
- The operation is **idempotent**: a migrated value no longer carries a suffix, so a second
  pass finds nothing to change.

The invariant that makes this safe: a migration that damages correct data is worse than the
defect it repairs.

## Error handling

Nothing here throws on bad input. An unreadable day, time or suffix means the value is
returned unchanged and the existing validation downstream continues to reject it — the
scheduler already drops entries whose day or time cannot be read.

## Testing

- Display preservation for both stored forms (`-03:00` and `Z`), and reference identity for
  values already floating.
- Idempotency: a second pass changes nothing.
- The full suite under `America/Sao_Paulo`, `Pacific/Kiritimati` (UTC+14) and
  `Pacific/Midway` (UTC-11), with identical results. CI already runs the suite in the first
  two; the third is run locally.
- A one-time reminder at 09:00 fires at 09:00 local — the case that is hours wrong today.
- The recurring path is unchanged: it is the easiest regression to cause here.
- The three suffix forms produce the same firing time.
- ICS round trip (export then import) produces a valid `DTSTART`.

## Out of scope

- Cross-timezone sharing or syncing of absolute instants. Not a feature of this app.
- A block spanning a DST transition changes duration by an hour under floating semantics.
  This is correct for a wall-clock appointment and is not special-cased.
- Statistics and the activity log, which already use real `toISOString()` instants and are
  unaffected.

## Acceptance criteria

1. No fixed `-03:00` remains in `src/` or `electron/` outside test fixtures that deliberately
   exercise the migration.
2. A one-time reminder and a recurring reminder set for the same time fire at the same real
   time, in every timezone.
3. Opening the app after the migration shows every block and reminder at the same time it
   showed before.
4. `Export .ics` produces a file a calendar application accepts.
