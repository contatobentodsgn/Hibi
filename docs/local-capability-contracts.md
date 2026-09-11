# Local capability contracts

This is the reconstructed contract surface for the Hibi study replica. It describes the behavior evidenced by the current local source, not the original product's private integrations.

## Boundary summary

| Capability | Local contract | Explicit boundary |
| --- | --- | --- |
| Persistence | `StudyData` is owned by one in-memory `LocalRepository`; the browser/Electron renderer restores/saves JSON in `localStorage` under `hibi-study-data`. UI events use `hibi-events`. | No server, account, sync, or encrypted-store contract is present. |
| Reminders | Reminders contain a title, category, status, one initial `schedule.at`, and optional daily/weekly recurrence. Paused reminders are excluded from notification entries. | Recurrence is local date/time logic; there is no external reminder provider. |
| Calendar | Calendar surfaces read/write local `ScheduleBlock` records (`start`, `end`, category, optional task link, hard flag). Recurrence expansion and conflict validation are domain functions. | “Calendar connected” means local blocks; external calendar sync is not configured. |
| Notifications | Active task deadlines and reminders become sanitized notification entries. The renderer sends the list through optional preload IPC; Electron owns timers and native notification delivery. | OS permission/support can suppress delivery; no remote push service exists. |
| AI / hardware | The assistant uses a provider-neutral contract and a local heuristic by default; an OpenAI-compatible endpoint is accepted only in the Electron main process with HTTPS/loopback validation, timeout, size limits, and redacted errors. On macOS, the public notch adapter owns an AppKit `NSPanel`; without its compiled addon, Hibi uses an Electron fallback. | Provider credentials never cross the preload boundary. The native panel receives only bounded presentation data and can return only `confirm` or `cancel` for the active request. |
| Extracted assets | Browser-safe companion assets are referenced by `/companion-assets/...`; quarantined Rive talk resources and native/compiled helpers are not registered or loaded. | Redistribution rights must be confirmed before shipping extracted assets. |

## Contract details

### Persistence

- Canonical shape: `StudyData` contains `notes`, `tasks`, `reminders`, `habits`, `goals`, `blocks`, and `telemetry` arrays ([models.ts](../src/domain/models.ts)).
- `LocalRepository` clones input/output values, exposes CRUD for local entities, rejects malformed required arrays on JSON restore, defaults missing legacy `notes`/`habits`/`goals` to empty arrays, and can reset to its seed ([local-repository.ts](../src/data/local-repository.ts)). These behaviors are covered by [local-repository.test.ts](../src/data/__tests__/local-repository.test.ts).
- `App` restores from `localStorage`, falls back to seed data on parse/validation failure, and serializes the repository snapshot after state changes ([App.tsx](../src/App.tsx)).
- IDs are generated locally as `<entity>-<Date.now()>-<collection length>`; callers should not assume UUID semantics ([local-repository.ts](../src/data/local-repository.ts)).

### Reminders and calendar

- Reminder and block times are floating local wall-clock timestamps — `2026-09-11T08:00:00`, with no zone or offset stored, so 08:00 is 08:00 wherever the user is (`DTSTART` without `TZID` semantics). Values persisted by older versions carried a fixed `-03:00` offset and are migrated on load ([wall-clock.ts](../src/domain/wall-clock.ts), [local-repository.ts](../src/data/local-repository.ts)). Recurrence supports `daily` and `weekly`, with optional start/end dates, weekdays, and per-weekday times ([models.ts](../src/domain/models.ts), [App.tsx](../src/App.tsx)).
- Calendar blocks are validated against existing local blocks before creation; duration is derived from parsed `start`/`end` timestamps ([conflicts.ts](../src/domain/conflicts.ts), [schedule.ts](../src/domain/schedule.ts)).
- Recurrence expansion preserves local calendar dates and emits floating wall-clock timestamps, with no offset ([schedule.ts](../src/domain/schedule.ts)).
- Calendar export/import uses the RFC 5545 floating form (`DTSTART:20260911T080000`, no `Z` and no `TZID`); an imported event from any zone keeps the wall-clock time its calendar displayed ([ics.ts](../src/domain/ics.ts)).

### Notifications

- `buildNotificationEntries` emits one entry per active deadline/reminder, with stable IDs prefixed `deadline:` or `reminder:` and bodies derived from the entity kind/category ([notifications.ts](../src/domain/notifications.ts)).
- The renderer calls the optional `window.hibiDesktop.syncNotifications` API whenever the snapshot changes; the browser-only build can run without that preload API ([App.tsx](../src/App.tsx), [global.d.ts](../src/global.d.ts)).
- Preload exposes notification synchronization and testing alongside app info and launch-at-login controls; the main-process scheduler sanitizes payloads, clears stale timers on sync, respects daily/weekly recurrence and end dates, and uses Electron `Notification` when a timer fires ([preload.cjs](../electron/preload.cjs), [main.cjs](../electron/main.cjs), [notifications.cjs](../electron/notifications.cjs)). These behaviors are covered by [notifications.test.cjs](../electron/notifications.test.cjs).

### AI and hardware

- AI turns have typed provider requests/proposals, bounded parser inputs, minimal evidence selection, deterministic tool policy, SHA-256-bound one-time confirmations, and sequential execution semantics ([contracts.ts](../src/ai/contracts.ts), [runtime.ts](../src/ai/runtime.ts), [policy.ts](../src/ai/policy.ts)).
- The macOS companion reducer is request-ID-safe, honors priority/interactivity/expiry, and supports reduced motion. The public native host owns an AppKit `NSPanel` and uses `NSScreen` display IDs, all-Spaces/full-screen collection behavior, and native passive/interactive modes. The Electron notch fallback retains top-center display bounds and click-through behavior ([reducer.ts](../src/companion/reducer.ts), [notch-window.cjs](../electron/notch-window.cjs), [notch.mm](../native/notch/src/notch.mm)).

- Capability declarations mark tasks, reminders, calendar, focus, and notes as local/available; external AI and hardware as unavailable ([capabilities.ts](../src/domain/capabilities.ts)).
- The separate adapter-status registry reports local persistence, native notifications, and launch-at-login as available, while external AI/hardware remain unavailable ([adapter-status.ts](../src/domain/adapter-status.ts)).
- The Taby view is a local query surface over the supplied data and states that it does not access internet, external AI, microphone, camera, or other hardware ([TabyView.tsx](../src/ui/TabyView.tsx)).
- The hardware availability view does not claim access to camera hardware. Its native companion diagnostic is available through the narrow preload capability call and reports host state without exposing native handles.

### Extracted asset quarantine

- Runtime asset registration points at browser-served companion paths and excludes `/rive/talk/` resources; the asset test makes that exclusion explicit ([companion-assets.ts](../src/assets/companion-assets.ts), [companion-assets.test.ts](../src/assets/__tests__/companion-assets.test.ts)).
- The asset directory policy keeps Rive `.riv`/`.wasm`/debug audio reference-only and excludes compiled runtime bundles and native helpers ([companion-assets README](../public/companion-assets/README.md)).

## Non-contracts

The current source does not establish contracts for cloud persistence, authentication, account sync, external calendar APIs, remote notifications, external AI, microphone/camera capture, notch hardware control, or executing extracted native/runtime assets. Treat UI labels or historical parity notes about those areas as availability statements, not implemented interfaces ([parity-audit.md](./parity-audit.md), [hey-taby-replica-design.md](./hey-taby-replica-design.md)). The weekly calendar does provide local ICS import/export through browser file/blob APIs; it is not external calendar synchronization.
# AI and integration production boundary

Configured AI requests stream through the Electron main process. Provider
credentials remain in macOS Keychain; the renderer receives only safe provider,
model, usage, retry, cancellation and failure metadata. The assistant can stop
an in-flight request, retry a temporary failure, or explicitly use the local
fallback. Tool proposals continue to require Hibi confirmation before mutation.

External integrations are optional. Notion, Slack, email and remote-notification
connectors store manually supplied access tokens only in Keychain. Every remote
write is prepared, validated by its connector, assigned a one-time confirmation
token, and then executed only by the main process. Import candidates are limited
to metadata needed for review. Webhooks require signed, fresh, non-replayed
payloads. The local API binds only to loopback and turns writes into confirmation
intents.
