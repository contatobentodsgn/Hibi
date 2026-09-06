# Hey Taby Study Replica Implementation Plan

**Goal:** Build an isolated Electron + React + TypeScript study replica of Hey Taby with local data, core scheduling flows and event instrumentation.

**Architecture:** Electron main/preload provide a typed desktop bridge. React renders the UI. A framework-independent domain layer owns scheduling and conflict rules. Local repositories own seed/reset/persistence, while telemetry stores ordered study events.

**Tech Stack:** Electron, React, TypeScript, Vite, Vitest, Playwright and JSON local persistence.

---

### Task 1: Electron project shell

Create /Volumes/SSD/app/replica/package.json, tsconfig.json, vite.config.ts, electron/main.ts, electron/preload.ts, src/main.tsx, src/App.tsx.

- Add dev, build, test and test:e2e scripts.
- Start Electron in development and production modes.
- Expose only a typed preload bridge; do not enable unrestricted Node access in the renderer.
- Render the Hey Taby shell with a visible Study Replica marker.
- Verify npm install and npm run build.

### Task 2: Domain and local data

Create src/domain/models.ts, schedule.ts, conflicts.ts, src/data/local-repository.ts and seed-data.ts, plus schedule and conflicts unit tests.

- Define Task, Reminder, ScheduleBlock, RecurrenceRule, Category and TelemetryEvent.
- Seed Kabrito posts, Marina posts, lunch, walking and English classes as disposable study data.
- Implement list/create/update/delete/reset/export.
- Expand one-time, daily and selected-weekday recurrences.
- Block overlaps and reserved breaks.
- Test exact duration, Tuesday/Wednesday reminder times and date boundaries.

### Task 3: Instrumentation

Create src/telemetry/telemetry.ts and telemetry-repository.ts; extend Electron IPC.

- Record navigation, create, edit, delete, complete, command, validation and reset events.
- Store session id, timestamp, route, action, entity type/id and validation summary.
- Keep free-form descriptions out of default event payloads.
- Add JSON export and event-log reset.
- Test event ordering and export round-trip.

### Task 4: Shell and command palette

Create src/ui/layout/AppShell.tsx, navigation/CommandPalette.tsx, navigation/routes.ts and theme.css.

- Reproduce the black shell, compact top navigation, central command field and restrained accents.
- Support /day, /week, /tasks, /reminders, /focus, /settings and core creation commands.
- Support keyboard navigation, Escape close, focus indication and command telemetry.

### Task 5: Tasks and reminders

Create TasksView.tsx, TaskEditor.tsx, RemindersView.tsx, ReminderEditor.tsx and ConfirmAction.tsx.

- Implement create, edit, complete, pause and delete.
- Show one-time/repeating status, next occurrence and category labels.
- Add weekday chips and per-day times for recurring reminders.
- Emit telemetry for mutations and validation failures.

### Task 6: Calendar

Create DayView.tsx, WeekView.tsx, CalendarQuickAdd.tsx, CalendarFilters.tsx and ConflictNotice.tsx.

- Render exact dates, 24-hour labels, durations, titles and categories.
- Create from an empty slot with date/time prefilled.
- Add Schedule, Important and Wellbeing layers.
- Block hard conflicts and show localized soft-conflict review.
- Verify work hours, lunch, walking and English-class scenarios.

### Task 7: Focus, settings and telemetry UI

Create FocusView.tsx, SettingsView.tsx, InstrumentationView.tsx and EventTable.tsx.

- Start focus from the current calendar item and record lifecycle events.
- Add language, 24-hour format, interruption preference and study reset.
- Filter events by session, route, action and validation.
- Export or clear event logs with confirmation.

### Task 8: Verification

Create end-to-end tests for routine review, commands and instrumentation.

- Test editing Horizontes to Tuesday 09:00 and Wednesday 20:00.
- Test lunch conflict warning/blocking.
- Test command navigation and Escape.
- Test ordered telemetry export.
- Capture Home, Reminders, Day, Week, Focus and Instrumentation screenshots.

### Task 9: Documentation

Create /Volumes/SSD/app/replica/README.md and docs/study-scenarios.md.

- Document launch, reset, replica boundaries and data export.
- Document reproducible scenarios for wrong dates, missing tasks, reminder noise and conflicts.
- Run build, unit tests and end-to-end tests from a clean install.
