# Hibi AI Runtime and Native Notch Design

## Objective

Give Hibi a provider-neutral AI orchestration runtime and a macOS notch surface that behave as one product while remaining independently testable. The design reproduces the observable contracts and interaction model discovered during study, but uses Hibi-owned code and interfaces.

The first implementation supports the existing local heuristic assistant and an OpenAI-compatible provider adapter. A local model adapter can be added behind the same interface without changing tools, policy, UI, or notch behavior.

## Architecture

The system is split into two independent subsystems joined by typed events:

1. **AI runtime** — interprets a user turn, selects local context, asks a provider for a structured proposal, validates policy, executes Hibi tools, and returns a surface-specific presentation.
2. **Companion runtime** — reduces application events into a deterministic companion state and presents that state in the main window or the macOS notch overlay.

Neither subsystem imports extracted runtime code. Reference sources are used only to identify behavior and boundaries.

## AI Runtime

### Turn pipeline

Each turn moves through these stages:

```text
received → interpreting → gathering_context → generating → validating
         → awaiting_confirmation | executing → completed | failed
```

The runtime owns one active turn at a time. A later turn may cancel a provider request that has not started tool execution. Once a mutation begins, cancellation waits for the current atomic tool call to finish.

### Core contracts

`AiProvider` receives a normalized request and returns a structured proposal. Providers never receive repository objects, Electron APIs, or tool implementations.

```ts
interface AiProvider {
  id: string;
  label: string;
  generate(request: AiProviderRequest, signal: AbortSignal): Promise<AiProviderProposal>;
}
```

`AiProviderRequest` contains the user message, locale, current time, selected surface, allowed tool schemas, compact context evidence, and recent conversation transcript. Secrets stay in the main process and are never included in renderer state or support bundles.

`AiProviderProposal` contains:

- a complete desktop reply;
- an optional compact notch presentation;
- zero to two typed tool calls;
- optional structured UI blocks;
- provider metadata suitable for local diagnostics, excluding prompts and credentials.

### Provider adapters

- **Heuristic adapter:** wraps the existing local deterministic assistant and remains the default when no model is configured.
- **OpenAI-compatible adapter:** calls a configurable endpoint from the Electron main process with bounded timeout, cancellation, response-size limits, and strict JSON validation.
- **Future local-model adapter:** implements `AiProvider` and may host a model in-process or through a supervised local worker. Its lifecycle does not leak into UI or tool contracts.

Provider selection is explicit. Failure falls back only from a configured model to the heuristic adapter when the user has enabled fallback; Hibi must label the provider that produced each answer.

### Context planning

The runtime first classifies intent and selects the minimum evidence needed. Calendar questions receive schedule blocks and conflict summaries; task questions receive matching tasks; settings questions receive capability status. Full workspace snapshots are not sent by default.

Every evidence item has a source ID and short label. The final answer can therefore disclose which local records informed it without exposing unrelated data.

### Tool registry and policy

Tools are Hibi-owned functions with a name, JSON input schema, risk level, execute function, and result serializer. Initial tools cover tasks, notes, reminders, schedule blocks, focus controls, navigation, and read-only searches.

Policy decisions are deterministic:

- read-only tools execute automatically;
- an explicit, reversible mutation may execute automatically;
- ambiguous, destructive, bulk, security-sensitive, or externally visible actions require confirmation;
- unknown tools, invalid arguments, conflicting schedule mutations, and more than two tool calls are rejected;
- confirmation tokens are single-use, expire, and bind to the exact normalized tool calls shown to the user.

Tools execute sequentially. A dependent call may consume the prior result through a declared reference. Partial success is returned explicitly; the runtime never claims an action succeeded solely because the model requested it.

### Surface presentation

Desktop replies may include full text and structured UI blocks. Notch replies are limited to one short sentence or one compact action card. Detailed results remain available in the assistant screen.

The provider may suggest a presentation kind, but the companion runtime chooses the actual animation. Model output cannot name arbitrary files or control window behavior.

## Companion and Notch Runtime

### State model

The companion reducer accepts typed application events and produces one state:

```text
hidden
idle
listening
thinking
acting
confirmation
result
focus
reminder
error
```

Each state includes a request ID, priority, entry animation, optional loop animation, compact text, actions, interaction mode, and expiry policy. A stable request ID prevents stale media callbacks from closing a newer presentation.

Priority order is: confirmation/error, active voice, reminder/action prompt, AI result, tool progress, focus, transient celebration, idle. Higher-priority cues may interrupt lower-priority cues. Lower-priority cues queue only when still relevant at completion.

### Animation policy

Animations are addressed by semantic IDs in Hibi's registry. Entries declare `play_once` or `loop`, optional text support, known duration, and optional transition target. The notch renderer preloads only the next required media asset. Reduced-motion mode replaces decorative transitions with a short opacity change and static frame.

Representative mappings:

| State/event | Entry | Loop/final |
| --- | --- | --- |
| listening | `listening_in` | `listening_loop` |
| thinking/searching | none | `searching_loop` |
| acting on task creation | none | `creating_task_loop` |
| response ready | `taby_response_ready_in` | `taby_response_ready_loop` |
| focus active | `working_in` | configured working loop |
| task completed | `task_completed` | return to prior ambient state |
| reminder | configured semantic animation | action card until response/expiry |
| error | short disappointed state | idle |

### Overlay window behavior

The overlay is a singleton Electron `BrowserWindow` using the existing preload isolation rules. On macOS it is transparent, borderless, shadowless, non-movable, excluded from normal window cycling, visible on all Spaces and over full-screen applications, and anchored to the top center of the selected display.

Base host dimensions are 392 × 296 points. Automatic scale is derived from the display dimensions and clamped between 0.78 and 0.94. The dormant activation zone is 19% of display width, clamped to 256–320 points, and 4.4% of display height, clamped to 38–44 points.

The native bridge owns only operations Electron cannot perform reliably:

- promote the overlay above the menu bar/notch safe area;
- apply an absolute AppKit frame without Electron safe-area adjustment;
- expose hardware-notch geometry when available;
- restore ordinary window behavior during teardown.

The bridge does not access user data, provider credentials, tools, or application repositories.

### macOS implementation boundary

Use a small Hibi-owned Node-API module written in Objective-C++ for the first version because the current app is Electron and the bridge needs the existing native window handle. Only documented AppKit APIs are required for the default path. Any optional use of private WindowServer APIs must be isolated behind capability detection and disabled in signed distribution builds unless legal and release review explicitly approves it.

If native promotion is unavailable, the fallback uses Electron `alwaysOnTop` at `pop-up-menu`, `setVisibleOnAllWorkspaces`, and top-center placement below the menu bar. The feature reports degraded mode rather than pretending it occupies the hardware notch.

### Display selection and geometry

The preferred display is stored by Electron display ID. If missing or disconnected, Hibi selects the primary display. On macOS the anchor remains top center; other platforms may expose additional anchors later.

Placement uses display bounds on macOS, not work area, because the window intentionally occupies the top strip. Geometry is recomputed when displays, scale factors, resolution, menu-bar location, or the selected display change.

### Interaction and focus

Dormant and animation-only presentations use `setIgnoreMouseEvents(true, { forward: true })`, allowing normal menu-bar and underlying-window interactions. Cards, confirmations, command input, and visible controls capture the pointer.

Pointer capture is tied to the current request ID. A delayed renderer event cannot make a newer interactive card click-through. Keyboard focus is requested only for command input or explicit text/voice interaction; passive cues never activate the app or steal focus.

Command-bar blur dismisses the overlay after a short guard period. Companion cards do not close merely because another application becomes active. Escape dismisses dismissible presentations, while confirmations require an explicit action or expiry policy.

### Presentation lifecycle

- Entry animations transition to their declared loop or final state.
- Auto-hide begins after the entry animation unless the cue specifies otherwise.
- Exit animation lasts approximately 420 ms, followed by an 80 ms settle period before hiding.
- A presentation scheduled to hide checks its request ID before acting.
- Audio/voice stages keep the overlay visible until playback completes or fails.
- Display sleep, session lock, and app shutdown cancel timers and release native resources.

### Accessibility

Interactive notch content exposes a dialog or status role, labelled actions, keyboard navigation, Escape behavior, and visible focus. Text never relies solely on animation. Reduced motion and reduced transparency are respected. Voice states have textual equivalents, and action cards remain operable without hover.

## IPC and Security

The preload exposes narrow methods for AI turns, confirmation, cancellation, companion state subscription, overlay visibility, and click-through preference. All payloads are schema-validated in the main process with bounded strings, list sizes, and timestamps.

Renderer code cannot select providers, read credentials, invoke arbitrary tools, load native modules, or set arbitrary overlay bounds. Navigation remains local-only. Diagnostics record stage, duration, provider label, tool names, state transitions, and errors without recording credentials or full private prompts by default.

## Failure Handling

- Provider timeout or malformed output becomes a labelled error with retry and heuristic fallback options.
- Invalid tool proposals are rejected before execution and included in diagnostics.
- Tool failures preserve truthful partial results.
- Missing native bridge activates degraded overlay mode.
- Media failures fall back to static text/icon states.
- A disconnected display repositions the overlay on the primary display.
- Renderer crashes recreate the overlay from the last non-sensitive companion state.

## Testing

### Unit tests

- intent/context selection;
- provider proposal parsing and limits;
- policy decisions and confirmation binding;
- tool execution ordering and partial failure;
- companion reducer priorities and stale request handling;
- display geometry, scaling, hot zone, and fallback selection;
- animation transitions, expiry, and reduced-motion behavior.

### Integration tests

- main/preload/renderer IPC validation;
- heuristic and fake OpenAI-compatible providers through the same contract;
- application mutation produces the expected companion event;
- click-through follows presentation interactivity;
- confirmation executes only the approved calls.

### macOS verification

- MacBook with hardware notch;
- Mac without notch;
- external display as primary and secondary;
- full-screen Space, Mission Control, display reconnect, sleep/wake, and scale changes;
- passive overlay does not steal focus or block menu-bar clicks;
- interactive overlay accepts mouse and keyboard input;
- degraded mode is clearly reported when native promotion is unavailable.

## Delivery Sequence

1. Introduce provider-neutral AI contracts, fake provider, policy, and tool registry behind existing assistant UI.
2. Add companion event/reducer contracts and drive current in-window animation from them.
3. Add the isolated overlay renderer and Electron window manager using the documented fallback path.
4. Add the minimal native macOS bridge and runtime capability reporting.
5. Connect AI stages, confirmations, results, focus, reminders, and task events to companion cues.
6. Run automated tests and a physical Mac notch matrix before enabling the overlay by default.

## Explicit Non-goals

- Reusing or executing the extracted AI runtime or native binary.
- Sending full workspace snapshots to a provider by default.
- Allowing model output to bypass Hibi policy or invoke arbitrary code.
- Claiming hardware-notch support on unsupported systems.
- Shipping private WindowServer behavior without a separate release decision.
