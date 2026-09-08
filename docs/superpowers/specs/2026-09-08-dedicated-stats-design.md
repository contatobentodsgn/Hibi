# Dedicated statistics design

## Objective

Add a dedicated `/stats` destination that explains productivity over time without
conflating operational review with historical measurement. `Review` remains the
place to inspect current work; `Stats` becomes the place to compare periods,
identify trends, and export evidence.

## Decisions

- Historical metrics are authoritative from the first version that records
  immutable activity events.
- Existing records are backfilled only when they contain a trustworthy timestamp.
  Hibi never invents dates, durations, or completion history from current state.
- Statistics are derived from a local append-only activity ledger. Domain entities
  remain the source of current state and are not expanded into an analytics store.
- The feature is offline-first, contains no telemetry, and sends no statistics to
  external services.
- `/stats` opens the dedicated statistics view. `/review` continues to open Review.

## Activity ledger

Introduce a versioned `ActivityRecord` collection in local study data. Every record
contains:

- stable identifier;
- event type;
- ISO timestamp;
- source entity type and identifier when applicable;
- bounded title snapshot;
- duration in minutes when measured;
- category and folder snapshots when applicable;
- optional numeric value for goal progress;
- schema version.

The first event vocabulary covers:

- task completed and reopened;
- focus started, paused, resumed, completed, and cancelled;
- habit completed and reopened;
- goal progress changed and goal completed;
- schedule block created, completed, moved, and deleted.

Records are appended after the corresponding domain mutation succeeds. Reversals
append a new event instead of deleting earlier evidence. Analytics code receives a
read-only list and cannot mutate workspace entities.

## Backfill

On first migration, Hibi creates activity records only from data with explicit,
reliable timestamps. It records the migration version so the operation is
idempotent. Seed/demo data is marked as seeded and excluded from real-user trends
unless the development dataset is explicitly active.

Items without sufficient evidence remain visible in current-state views but do not
contribute to historical charts. The Stats view explains when a period has partial
historical coverage.

## Metrics

The calculation layer is pure and accepts records, period boundaries, locale, and
timezone. It produces:

- completed tasks and completion rate where a denominator is known;
- planned minutes, completed minutes, and their variance;
- focus sessions and focused minutes;
- habit completion rate and active streaks;
- goal progress changes and goals completed;
- daily and weekly trend series;
- category and folder distribution;
- comparison with the immediately preceding equivalent period.

Rates with an unknown denominator are omitted rather than displayed as zero. Date
bucketing uses the user's local timezone and explicit half-open periods to avoid
double counting at midnight.

## User interface

`StatsView` follows the existing Hibi visual system and contains:

1. Period selector: Today, Week, Month, and Custom.
2. Summary cards for tasks, focused time, habits, and goals.
3. A daily/weekly trend chart with an accessible tabular equivalent.
4. Planned-versus-completed comparison.
5. Category/folder distribution.
6. Filterable activity history.
7. Local CSV and JSON export for the selected period.

The page uses CSS/SVG primitives owned by Hibi rather than adding a charting
dependency. Every visualization has text labels, sufficient contrast, keyboard
access, and a table representation for screen readers. Empty, partial-history, and
invalid-period states are explicit.

## Navigation and commands

- Add `stats` as a first-class route and navigation destination.
- `/stats` navigates directly to it.
- Review no longer receives `/stats` traffic.
- Existing `/review` behavior remains unchanged.
- Opening, filtering, changing periods, and exporting Stats records local
  instrumentation events without copying the activity ledger into telemetry.

## Persistence and compatibility

The local repository owns ledger append, migration, query, export, and backup
serialization. Workspace backups include the ledger and schema version. Older
backups migrate forward; incompatible future versions are rejected with the same
safe restore behavior already used by Hibi.

Ledger retention is unlimited for this local study version. A future retention or
cloud policy requires a separate design because deletion would change historical
meaning.

## Error handling

- A failed domain mutation creates no activity record.
- A ledger persistence failure reports a visible local error and audit event; it
  never reports the underlying action as historically recorded.
- Invalid or duplicated imported records are rejected during backup validation.
- Exports contain no AI credentials, Keychain data, or unrelated workspace text.
- Unknown event types are preserved during storage but ignored by older metric
  calculators, allowing forward-compatible restores within the schema contract.

## Testing

- Unit tests cover event creation, reversals, idempotent migration, period
  boundaries, timezone bucketing, rates, comparisons, and partial history.
- Repository tests cover persistence, backup/restore, duplicate rejection, and
  schema compatibility.
- UI tests cover every period, empty and partial states, keyboard operation,
  accessible chart alternatives, and export controls.
- End-to-end tests prove `/stats` routing, creation of real activity through user
  actions, persistence after reload, and exported-period filtering.
- Existing Review, command palette, backup, domain, and accessibility tests remain
  green.

## Out of scope

- Cloud analytics or cross-device aggregation.
- Predictive scoring, AI-generated performance judgments, or fabricated backfill.
- External charting services.
- Changes to `/tools` or the Rive runtime; those are separate design and
  implementation cycles under the same product objective.

## Acceptance criteria

- `/stats` opens a distinct, functional page.
- New supported actions create durable activity records exactly once.
- Current and previous periods calculate deterministically in the local timezone.
- Existing timestamped history is migrated once; uncertain history is excluded and
  disclosed.
- All charts have an equivalent accessible representation.
- CSV/JSON exports contain only the selected period and approved metric fields.
- Backup/restore preserves the ledger.
- Automated tests cover calculations, persistence, routing, accessibility, and the
  primary end-to-end workflow.
