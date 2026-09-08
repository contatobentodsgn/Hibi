# Native notch validation record

Date: 2026-09-08

## Environment observed

- Apple M4, internal Liquid Retina display, 2560 × 1664 logical Retina mode.
- One online internal display; no external display connected.
- The native bridge reports `hasCameraHousing: true` and `safeAreaTop: 32`.

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
| External monitor and reconnect | No external display is attached. |
| Spaces and fullscreen | Requires interactive switching through the user’s active workspace. |
| Sleep and wake | Requires putting the active computer to sleep, which must be performed by the user. |
| VoiceOver spoken output | Requires VoiceOver to be enabled and listened to by a user. |
| Signed/notarized artifact | Requires Apple Developer signing and notarization credentials. |

Do not report the open rows as passed until they are exercised on the required hardware and recorded in this file.
