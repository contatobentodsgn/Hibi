# Native notch validation record

Date: 2026-09-08, updated 2026-09-10

## Environment observed

- Apple M4, internal Liquid Retina display, 2560 × 1664 logical Retina mode.
- LG ULTRAWIDE external display, 2560 × 1080 at 75 Hz, configured as the main display.
- The native bridge reports `hasCameraHousing: true` and `safeAreaTop: 32`.

## 2026-09-10 — display selection and the notch test, real app

Production build (`HIBI_PRODUCTION=1`) of commit `24fbddd`, driven by `scripts/notch-display-live.mjs`
through **Settings › General**: the script picks a display in **Monitor do notch**, presses **Testar
notch**, waits until the main process reports the test confirmation as active, and clicks
**Apareceu** in the real overlay window. Displays: LG ULTRAWIDE `displayId: 3` (primary, no camera
housing) and Built-in Retina Display `displayId: 1` (camera housing).

A screen capture of the target display was taken during each passive card and each confirmation.
The captures were inspected by the agent that ran the script, not by a person, and are not stored in
the repository because they show the operator's desktop. Commits after `24fbddd` only change error
handling and tests; they were not re-run in the real app.

Coordinates: passive frames come from the native host in **Cocoa global coordinates** (origin at the
bottom-left of the primary display); confirmation bounds come from Electron in **Electron global
coordinates** (origin at the top-left of the primary display). In Electron coordinates the LG is at
`0,0,2560×1080` and the built-in display at `570,1080,1470×956`.

| Run | Hibi window on | Resolved display | Passive card (native, Cocoa) | Confirmation (Electron) | Result |
| --- | --- | --- | --- | --- | --- |
| Automatic | LG | Built-in, `camera-housing` | display `1`, `1177,-70,256×70` | `919,1374,773×116`, inside the built-in display | Pass |
| LG chosen | LG | LG, `preferred` | display `3`, `1152,1042,256×38` | `894,294,773×116`, inside the LG | Pass |
| Built-in chosen | LG | Built-in, `preferred` | display `1`, `1177,-70,256×70` | `919,1374,773×116`, inside the built-in display | Pass |
| Built-in chosen | Built-in | Built-in, `preferred` | display `1`, `1177,-70,256×70` | `919,1374,773×116`, inside the built-in display | Pass |
| LG chosen | Built-in | LG, `preferred` | display `3`, `1152,1042,256×38` | `894,294,773×116`, inside the LG | Pass |

Every run returned "Confirmado pelo notch em …" with the expected display. The choice survived an app
restart and the script restored **Automatic** at the end. In the captures, the passive card sits flush
with the top edge and its text is fully readable below the camera housing on the built-in display and
at the top of the LG; the confirmation card fills its window with the question on one line and both
buttons in one row.

Defects fixed on this branch:

| Defect | Seen as | Fix |
| --- | --- | --- |
| Automatic display frozen at launch (known from code reading before the validation) | An app started with the lid closed stayed on the primary display | Resolved on every placement (`9cf6edb`) |
| Native `Place` converted coordinates from the screen with focus (found in review) | With Hibi's window on the built-in display, a confirmation would be placed off-screen | Converted from the primary display (`7e5e267`); covered by the "Hibi window on built-in" runs |
| Passive text drawn in a 10 pt rect (found in captures) | "Teste do notch" cut in half on both displays | Single line, vertically centred (`60165f8`, `f7f41cd`, `24fbddd`) |
| Passive panel pinned under the camera housing (found in captures) | On the built-in display only 6 pt of the 38 pt panel were below the housing | Panel grows by `safeAreaInsets.top`, draws below it and keeps square top corners (`60165f8`, `f7f41cd`) |
| Confirmation overflow (found in captures) | Scrollbars, second button cut off, light frame around the card | Transparent overlay document, one button row, video hidden for confirmations (`7af594f`) |
| Confirmation card shorter than its window (found in review) | A transparent strip below the card still captured clicks | Card fills the window (`75d69a4`) |
| Previous surface left on screen when the notch switched hosts (found in review) | A replaced confirmation window stayed visible and captured clicks | The previous host is hidden on a switch (`68c0140`); unit tests only |

Observations, not failures:

- In an earlier run on the same day the native host reported `occluded: true` for built-in passive
  cards while the capture taken at the same moment showed the card on screen. `occluded` is not
  reliable evidence of visibility by itself.
- Confirmations sit below the notch area (about 290 pt from the top edge), as a separate action
  surface, not attached to the notch.

### External-display evidence collected on 2026-09-08

- Revalidated on 2026-09-08 after rebuilding both native addons with
  `npm run native:notch:smoke`; the command completed successfully and the
  focused native/Electron suite passed all 23 tests.
- `npm run native:notch:smoke` saw both displays: external `displayId: 3` with no
  camera housing and internal `displayId: 1` with a camera housing.
- The smoke utility invokes the AppKit bridge directly, so it deliberately presents
  on the current main display (`displayId: 3`). It does **not** exercise Hibi's
  companion display-selection policy; the 2026-09-10 runs above do.

## Completed on this Mac

| Scenario | Evidence | Result |
| --- | --- | --- |
| Built-in Mac display with camera housing | 2026-09-10 runs above: passive card below the housing and confirmation inside the display, answered through the overlay. | Pass (automated clicks, real app, captures inspected by the agent) |
| External display, passive and confirmation | 2026-09-10 runs above, with Hibi's window on either display. | Pass (automated clicks, real app, captures inspected by the agent) |
| Display choice persistence | Choice kept after restarting the app. | Pass (real app) |
| Native confirmation focus | Production app exposed the confirmation as a native window and put initial focus on **Confirmar**. | Pass when recorded — **superseded**: the native host now refuses any presentation carrying actions, so confirmations are shown by the Electron overlay. |
| Native keyboard navigation | Tab moved focus from **Confirmar** to **Cancelar** after adding an explicit local key monitor scoped to the interactive host. | Pass when recorded — **superseded**: the key monitors still exist in `notch.mm`, but cannot run while the host stays passive-only. |
| Passive interaction policy | Electron and AppKit paths are covered by automated tests: passive cards remain click-through and confirmations become interactive. | Pass (automated) |
| Production renderer recovery | A renderer crash reloads once and resets the guard after a successful load. | Pass (automated) |

## Still requires physical test hardware or operator action

| Scenario | Why it remains open |
| --- | --- |
| Mac without a camera housing | This host only has an internal display with a camera housing. The LG runs cover a display without a housing, not a Mac without one. |
| External monitor reconnect | Selection and the notch test passed on the LG; unplugging and reconnecting it must be done by a person. |
| Spaces and fullscreen | Requires interactive switching through the user’s active workspace. |
| Sleep and wake | Requires putting the active computer to sleep, which must be performed by the user. |
| Human click and reading | The 2026-09-10 clicks were automated on the real overlay window and the captures were inspected by an agent; a person still has to confirm position and legibility by using the button. |
| VoiceOver spoken output | Requires VoiceOver to be enabled and listened to by a user. |
| Signed/notarized artifact | Requires Apple Developer signing and notarization credentials. |

Do not report the open rows as passed until they are exercised on the required hardware and recorded in this file.

## Operator procedure (Settings › General › Testar notch)

1. **Reconnect:** choose the external display, run the test, unplug it — the notch must move to the
   built-in display and Settings must show the choice as disconnected — plug it back in, run the
   test again and answer **Apareceu** on the external display.
2. **Spaces:** run the test, switch Space with Control-→ while the confirmation is visible, and
   confirm the card follows.
3. **Full screen:** put any app in full screen on the chosen display and run the test.
4. **Sleep and wake:** sleep the Mac, wake it, and run the test without restarting Hibi.
5. **Human check:** for each run, confirm the card sits at the top centre of the chosen display and
   the text is readable.

Record each result in the tables above with the date and the display names.
