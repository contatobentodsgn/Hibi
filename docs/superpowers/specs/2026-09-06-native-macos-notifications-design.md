# Native macOS Notifications Design

**Goal:** Deliver native Electron notifications for active reminders and open task deadlines, with a small renderer-to-main bridge and a Settings test action.

## Scope

- Schedule every active reminder from its existing one-time or daily/weekly schedule.
- Schedule every open task that has a deadline.
- Cancel stale schedules whenever the renderer snapshot changes, then replace them with the current snapshot.
- Show a native test notification from Settings when Electron is running in desktop mode.
- Keep browser mode safe: the bridge is optional and the renderer continues to run under Vite without Electron.
- Do not change Goals or Habits code or documentation.

## Architecture

`App` derives a sanitized notification payload from the existing `StudyData` snapshot. Its effect sends that payload through `window.hibiDesktop.syncNotifications`, which is the only scheduling API exposed by preload. The main process owns timer state and a small scheduler module; each due item is shown with Electron's native `Notification` class and recurring reminders are scheduled again for their next occurrence.

The preload bridge also exposes `showTestNotification`, returning a boolean so Settings can record whether the native notification was available. The main process validates identifiers, titles, dates, and recurrence fields before scheduling. Unsupported platforms or unavailable native notifications fail closed without crashing the renderer.

## Scheduling behavior

- Paused reminders and completed/paused tasks are excluded in the renderer.
- Past one-time items are ignored.
- Daily recurrence uses `recurrence.time` or the source schedule time, starting no earlier than `startDate` and stopping after `endDate`.
- Weekly recurrence uses `weekdays`, `timesByWeekday`, or the recurrence fallback time, also respecting `startDate` and `endDate`.
- Timers are chunked below Node's maximum timeout so far-future dates remain safe.
- A sync clears all existing timers before installing the current list, preventing duplicate notifications after edits or React Strict Mode effects.

## Testing and validation

- TypeScript unit tests cover payload derivation and active/inactive filtering.
- Node tests cover one-time and recurring scheduling with injected timer/notification dependencies, without requiring a GUI.
- `npm test` runs both test suites and `npm run build` runs TypeScript plus Vite production build.
- `git diff --check` and a final status review ensure no Goals/Habits files are changed.
