# Focus settings design

## Objective

Settings › Focus is decorative. It holds two rows that render a value and accept no input:
"Default focus length → 25 minutes" and "Focus mode → Local only". The focus timer itself
is fixed at 25 minutes (`DURATIONS.focus = [25]`).

Worse, the Focus screen already makes a promise nothing keeps:

> Reminders are quiet during focus unless marked Important.

Verified: `electron/notifications.cjs` contains no notion of focus, and
`buildNotificationEntries(data)` is derived from `StudyData` alone. A reminder due at 14:10
fires at 14:10 whether or not a session is running. The vocabulary the sentence depends on
does exist — `Reminder.category` is `'important' | 'wellbeing'` — only the gate is missing.

That is precisely the defect the audit of the original found, and it is the reason this work
leads with behavior instead of controls. From the 0.2.2 audit of Hey Taby, section *Foco*:

> Horário ativo informa 09:00–17:00, mas o calendário materializa marcadores durante quase
> todo o dia.

The 0.2.3 audit lists the same three problems as **maintained**: the `after 1 minutes`
string, reminders still materialized outside active hours, and no forecast of how many
interruptions a day the configuration produces. The original shipped a settings tab whose
settings did not govern behavior, and one release later they still did not.

## Decisions

| Topic | Decision |
| --- | --- |
| What ships first | The gate, not the controls. A non-important reminder does not interrupt a focus session; an important one does. Only once that is true does a screen get to offer knobs for it. A control that does not govern behavior is the defect being copied, not the feature. |
| Quiet means deferred, not dropped | A reminder held back during focus fires when the session ends. Silently discarding it would lose the user's reminder to protect their concentration — a worse trade than a late alert, and one they never asked for. |
| Where the gate lives | In the scheduler, in the main process, which is the only thing that decides when a notification fires. The renderer already re-syncs entries through `syncNotifications` whenever the workspace changes; it also owns focus state. So the renderer sends the focus window alongside the entries, and the scheduler defers what falls inside it. One place decides, so the screen cannot promise something the timer does not do. |
| Active hours | A daily window, default 09:00–17:00, outside which non-important nudges do not fire. It is applied at the **same gate** as focus, for the same reason: the original's window was a label, because generation, display and firing were decided in different places. |
| Wall clock | The window is wall-clock local, consistent with [floating local time](2026-09-11-floating-local-time-design.md). 09:00 is 09:00 wherever the person is. |
| Idle | An idle threshold pauses a running session rather than counting time the person was not there. `focus-lifecycle.ts` already measures with `accumulatedMs` against a `limitMs`, so this extends an existing state machine instead of adding a parallel clock. |
| Pomodoro | The fixed 25 becomes the default of a configurable length. The current value stays the default so nobody's habit changes by upgrading. |
| Nudge intensity | Named presets — calm, work, health — as the audit suggested, not a raw interval field. The original's own numbers (30 and 40 minutes) were flagged there as producing too many interruptions, so the presets are chosen for this app rather than copied. |
| The preview | The count of alerts per day is computed by **the same pure function the gate uses**, never a parallel estimate. A preview that can disagree with reality is how "09:00–17:00" came to mean nothing. This is the improvement the original never shipped across two releases. |
| Pluralization | `after 1 minutes` is in the audit twice. Strings go through the dictionary with real plural forms in `pt` and `en`. |
| Where settings live | A dedicated preference module with its own `hibi-*` key, following `src/ui/theme.ts`, `src/i18n/locale-storage.ts` and `src/ui/agenda-storage.ts`: storage injected as `Pick<Storage, …>`, pure read/write, `try`/`catch` falling back to defaults so the app always mounts. Not a new global store. |

## Data

Focus settings are preferences, not workspace content: active hours, idle threshold, session
length, and nudge preset. They are safe to carry in the workspace backup — the Data tab already
offers to restore "safe preferences" — so the implementer checks what that bundle carries today
and includes these the same way, or states why not.

Defaults must be the current behavior: 25-minute sessions, and the quiet-during-focus rule the
screen already claims. Upgrading changes nothing until the person changes something.

## User interface

Settings › Focus gains real controls, replacing the two static rows. Each control states what it
does in terms of consequence, and the screen shows the alerts-per-day preview updating as the
values change.

The sentence on the Focus screen stays only if it becomes true. If the implementation ends up
narrower than the promise, the sentence changes to match — an inaccurate reassurance is worse
than none.

## Error handling

Unreadable or absent storage yields the defaults, never a crash: the same `try`/`catch` shape the
existing preference modules use. A malformed stored value is replaced by its default rather than
partially applied.

## Testing

- The gate is a pure function: tested with Vitest, no DOM.
- Deferral is proven in the scheduler with `node --test`: a non-important entry due mid-session
  does not fire during it **and does fire after**; an important one fires on time.
- The preview and the gate are the same function — a test pins that the preview count equals the
  number of alerts the gate lets through for the same day and settings.
- Active hours under `TZ=Pacific/Kiritimati` and `Pacific/Midway` behave as they do in
  `America/Sao_Paulo`, as the suite already requires everywhere else.
- Settings survive a reload (e2e), and no string renders "1 minutes".

## Out of scope

Three of the original's nine Focus elements are deliberately left out: behavior when away,
screen timeout, and the visual loop. They belong to the physical Taby device and its visual
host, which this app does not have. Listing them as settings without hardware to honor them
would repeat the mistake this spec exists to avoid.

## Acceptance criteria

1. A non-important reminder due during a focus session does not fire during it, and does fire
   once the session ends.
2. An important reminder fires during focus, unchanged.
3. Nothing non-important fires outside active hours.
4. The alerts-per-day preview equals what the gate actually allows for that day.
5. The sentence on the Focus screen is true of the shipped behavior.
6. Settings survive a restart, and defaults reproduce today's behavior exactly.
