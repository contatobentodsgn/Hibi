# Hibi notch manual validation

Run the application in production mode (`npm run desktop:production`) before recording a result. In the app, use the assistant to prepare an action that requires confirmation; this checks the interactive notch card without creating data until **Confirm** is selected.

| Scenario | Procedure | Pass condition |
| --- | --- | --- |
| Built-in display with camera housing | Trigger a task completion, reminder, focus start, validation error and AI confirmation. | Passive cards do not take focus or intercept clicks. The mascot host contains no controls. Confirmation is centered in the separate surface below the physical housing, takes keyboard focus, and Confirm/Cancel both work. |
| Mac without camera housing | Run on a supported external-only/non-notch Mac. | The compact card appears centered at the top of the selected display; it remains usable and never overlaps a menu-bar control. |
| External display | Attach a display, make it primary, then trigger passive and confirmation cards. | If the built-in Mac screen has a housing, the visual mascot remains on that physical display; the action surface is a separate sibling surface and never overlaps the mascot. Otherwise both surfaces follow the selected primary display. |
| Display reconnect | With a card visible, unplug and reconnect the external display. | No crash; a subsequent card is positioned on an available display. |
| Spaces and fullscreen | Show a passive card, change Spaces, then enter and leave a fullscreen app. | The passive card remains visible without activating Hibi; confirmation remains actionable. |
| Sleep and wake | Put the Mac to sleep, wake it, then trigger a new card. | No stale card remains; the next card is correctly positioned. |
| VoiceOver and keyboard | Enable VoiceOver, trigger a confirmation, then use Tab, Shift-Tab, Enter and Escape. | VoiceOver announces the separate action dialog and its message. The mascot host is not exposed as an interactive element. The first action is focused, Tab reaches all actions, Enter activates the focused action, and Escape dismisses passive cards. |

Record the macOS version, Hibi build, display arrangement, adapter shown in Settings/diagnostics, and one screenshot for each failing scenario. Do not mark an untested hardware scenario as passed.
