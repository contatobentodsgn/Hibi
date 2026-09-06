# Hey Taby Study Replica — Design

## Goal

Create an isolated Electron + React + TypeScript replica of the Hey Taby desktop experience for internal study, with local test data and event instrumentation.

## Scope

The first functional slice reproduces Home, Tasks, Reminders, Day, Week, Focus and the `/` command palette. It includes local persistence, recurring schedules, conflict validation and an instrumentation panel/export. Notes, Habits, Goals, Folders and Settings follow the same shell and data boundaries after the core slice is stable.

## Architecture

- Electron main process: window lifecycle, preload bridge, app-level shortcuts, notifications and local event storage.
- Preload: narrow typed IPC API; no direct Node access from React.
- React renderer: routes, reusable controls and calendar surfaces.
- Domain layer: task, reminder, schedule and conflict rules independent of Electron.
- Local storage: JSON/SQLite adapter behind a repository interface; seed data is disposable and clearly marked as study data.
- Instrumentation: append-only local event records with session id, timestamp, route, action, entity type/id, payload summary and validation result.

## Product rules

- The original app remains untouched.
- No network sync or external account integration in the first slice.
- Create/edit actions show the target date, time and duration before commit.
- Hard conflicts block save; soft conflicts require explicit confirmation.
- Recurrence previews the next occurrences before saving.
- All destructive actions require confirmation and are reversible through an undo record where practical.
- UI text and time formatting support Portuguese and 24-hour display from the start.

## Acceptance criteria

- The replica launches as an Electron desktop app.
- A user can create, edit, complete and delete tasks locally.
- A user can create one-time and weekday-based recurring reminders.
- Day and Week views show exact dates, start times, duration and category labels.
- Lunch, walking and English-class blocks can be seeded and used for conflict validation.
- The command palette can navigate and create the same core entities as visible buttons.
- Every create/edit/delete/conflict/navigation action appears in the instrumentation view and can be exported as JSON.
- A reset-study-data action restores the seed dataset without touching the original Hey Taby app.
