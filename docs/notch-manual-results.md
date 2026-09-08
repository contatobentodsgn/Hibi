# Native notch validation record

Date: 2026-09-08

## Environment observed

- Apple M4, internal Liquid Retina display, 2560 × 1664 logical Retina mode.
- LG ULTRAWIDE external display, 2560 × 1080 at 75 Hz, configured as the main display.
- The native bridge reports `hasCameraHousing: true` and `safeAreaTop: 32`.

### External-display evidence collected

- Revalidated on 2026-09-08 after rebuilding both native addons with
  `npm run native:notch:smoke`; the command completed successfully and the
  focused native/Electron suite passed all 23 tests.
- `npm run native:notch:smoke` saw both displays: external `displayId: 3` with no
  camera housing and internal `displayId: 1` with a camera housing.
- The latest smoke diagnostics reported the passive host on external display
  `3` at frame `1152,1042,256x38`, with `visible: true`, `interactive: false`,
  `occluded: false`, and `activeSpace: true`.
- The smoke utility invokes the AppKit bridge directly, so it deliberately presents
  on the current main display (`displayId: 3`). It does **not** exercise Hibi's
  companion display-selection policy.
- The production window manager has a separate, automated contract test:
  `prefers the physical Mac notch display when an external display is primary`.
  It verifies that a real companion presentation selects the internal notched
  display rather than the external primary display.

This is implementation evidence, not a replacement for the interactive external
monitor procedure below. The manual row remains open until a passive card and a
confirmation card are seen and operated with this arrangement.

## Completed on this Mac

| Scenario | Evidence | Result |
| --- | --- | --- |
| Built-in Mac display with camera housing | `npm run native:notch:smoke` created and showed the AppKit host. Diagnostics: display `1`, frame `607,766,256×190`, `visible: true`, `occluded: false`, `activeSpace: true`. | Pass |
| Native confirmation focus | Production app exposed the confirmation as a native window and put initial focus on **Confirmar**. | Pass |
| Native keyboard navigation | Tab moved focus from **Confirmar** to **Cancelar** after adding an explicit local key monitor scoped to the interactive host. | Pass |
| Passive interaction policy | Electron and AppKit paths are covered by automated tests: passive cards remain click-through and confirmations become interactive. | Pass (automated) |
| Production renderer recovery | A renderer crash reloads once and resets the guard after a successful load. | Pass (automated) |

## Still requires physical test hardware or operator action

| Scenario | Why it remains open |
| --- | --- |
| Mac without a camera housing | This host only has an internal display with a camera housing. |
| External monitor and reconnect | An LG ULTRAWIDE is now attached and detected, but the interactive passive/confirmation and reconnect procedure has not yet been completed. |
| Spaces and fullscreen | Requires interactive switching through the user’s active workspace. |
| Sleep and wake | Requires putting the active computer to sleep, which must be performed by the user. |
| VoiceOver spoken output | Requires VoiceOver to be enabled and listened to by a user. |
| Signed/notarized artifact | Requires Apple Developer signing and notarization credentials. |

Do not report the open rows as passed until they are exercised on the required hardware and recorded in this file.
