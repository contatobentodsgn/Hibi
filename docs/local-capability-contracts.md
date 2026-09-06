# Local capability contracts

This is the reconstructed contract surface for the Hibi study replica. It describes the behavior evidenced by the current local source, not the original product's private integrations.

## Boundary summary

| Capability | Local contract | Explicit boundary |
| --- | --- | --- |
| Persistence | `StudyData` is owned by one in-memory `LocalRepository`; the browser/Electron renderer restores/saves JSON in `localStorage` under `hibi-study-data`. UI events use `hibi-events`. | No server, account, sync, or encrypted-store contract is present. |
| Reminders | Reminders contain a title, category, status, one initial `schedule.at`, and optional daily/weekly recurrence. Paused reminders are excluded from notification entries. | Recurrence is local date/time logic; there is no external reminder provider. |
| Calendar | Calendar surfaces read/write local `ScheduleBlock` records (`start`, `end`, category, optional task link, hard flag). Recurrence expansion and conflict validation are domain functions. | “Calendar connected” means local blocks; external calendar sync is not configured. |
| Notifications | Active task deadlines and reminders become sanitized notification entries. The renderer sends the list through optional preload IPC; Electron owns timers and native notification delivery. | OS permission/support can suppress delivery; no remote push service exists. |
| AI / hardware | The local assistant answers from the current `StudyData` and explicitly declines internet, external AI, microphone, camera, and other hardware access. | No network, Brain/LLM, notch SDK, native helper, or device-control adapter is active. |
| Extracted assets | Browser-safe companion assets are referenced by `/companion-assets/...`; quarantined Rive talk resources and native/compiled helpers are not registered or loaded. | Redistribution rights must be confirmed before shipping extracted assets. |

## Contract details

### Persistence

- Canonical shape: `StudyData` contains `notes`, `tasks`, `reminders`, `habits`, `goals`, `blocks`, and `telemetry` arrays ([models.ts](../src/domain/models.ts)).
- `LocalRepository` clones input/output values, exposes CRUD for local entities, rejects malformed required arrays on JSON restore, defaults missing legacy `notes`/`habits`/`goals` to empty arrays, and can reset to its seed ([local-repository.ts](../src/data/local-repository.ts)). These behaviors are covered by [local-repository.test.ts](../src/data/__tests__/local-repository.test.ts).
- `App` restores from `localStorage`, falls back to seed data on parse/validation failure, and serializes the repository snapshot after state changes ([App.tsx](../src/App.tsx)).
- IDs are generated locally as `<entity>-<Date.now()>-<collection length>`; callers should not assume UUID semantics ([local-repository.ts](../src/data/local-repository.ts)).

### Reminders and calendar

- Reminder times are ISO-like local timestamps using the `-03:00` offset at creation/edit time; recurrence supports `daily` and `weekly`, with optional start/end dates, weekdays, and per-weekday times ([models.ts](../src/domain/models.ts), [App.tsx](../src/App.tsx)).
- Calendar blocks are validated against existing local blocks before creation; duration is derived from parsed `start`/`end` timestamps ([conflicts.ts](../src/domain/conflicts.ts), [schedule.ts](../src/domain/schedule.ts)).
- Recurrence expansion preserves local calendar dates and emits timestamp strings with the same `-03:00` offset ([schedule.ts](../src/domain/schedule.ts)).

### Notifications

- `buildNotificationEntries` emits one entry per active deadline/reminder, with stable IDs prefixed `deadline:` or `reminder:` and bodies derived from the entity kind/category ([notifications.ts](../src/domain/notifications.ts)).
- The renderer calls the optional `window.hibiDesktop.syncNotifications` API whenever the snapshot changes; the browser-only build can run without that preload API ([App.tsx](../src/App.tsx), [global.d.ts](../src/global.d.ts)).
- Preload exposes notification synchronization and testing alongside app info and launch-at-login controls; the main-process scheduler sanitizes payloads, clears stale timers on sync, respects daily/weekly recurrence and end dates, and uses Electron `Notification` when a timer fires ([preload.cjs](../electron/preload.cjs), [main.cjs](../electron/main.cjs), [notifications.cjs](../electron/notifications.cjs)). These behaviors are covered by [notifications.test.cjs](../electron/notifications.test.cjs).

### AI and hardware

- Capability declarations mark tasks, reminders, calendar, focus, and notes as local/available; external AI and hardware as unavailable ([capabilities.ts](../src/domain/capabilities.ts)).
- The separate adapter-status registry reports local persistence and native notifications as available, launch-at-login as unavailable in its offline-safe status list, and external AI/hardware as unavailable ([adapter-status.ts](../src/domain/adapter-status.ts)).
- The Taby view is a local query surface over the supplied data and states that it does not access internet, external AI, microphone, camera, or other hardware ([TabyView.tsx](../src/ui/TabyView.tsx)).
- The hardware availability view reports no compatible hardware integration, while settings report Brain/hardware unavailable offline ([AvailabilityView.tsx](../src/ui/AvailabilityView.tsx), [SettingsView.tsx](../src/ui/SettingsView.tsx)).

### Extracted asset quarantine

- Runtime asset registration points at browser-served companion paths and excludes `/rive/talk/` resources; the asset test makes that exclusion explicit ([companion-assets.ts](../src/assets/companion-assets.ts), [companion-assets.test.ts](../src/assets/__tests__/companion-assets.test.ts)).
- The asset directory policy keeps Rive `.riv`/`.wasm`/debug audio reference-only and excludes compiled runtime bundles and native helpers ([companion-assets README](../public/companion-assets/README.md)).

## Non-contracts

The current source does not establish contracts for cloud persistence, authentication, account sync, external calendar APIs, remote notifications, external AI, microphone/camera capture, notch hardware control, or executing extracted native/runtime assets. Treat UI labels or historical parity notes about those areas as availability statements, not implemented interfaces ([parity-audit.md](./parity-audit.md), [hey-taby-replica-design.md](./hey-taby-replica-design.md)). The weekly calendar does provide local ICS import/export through browser file/blob APIs; it is not external calendar synchronization.
