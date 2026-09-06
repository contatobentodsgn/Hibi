# Hibi companion — Rive production specification

## Scope and technical truth

Hibi renders a transparent Electron overlay near the top centre of a selected display. On Macs with a camera housing, macOS reserves the housing itself: the app may use the visible areas around it, but must not assume pixels can be drawn over the camera. Build animations as a companion that emerges **below and around** the housing, never as content that depends on being visible inside it.

The current renderer consumes semantic animation IDs and browser-safe video assets. Rive source files are the production source of truth; deliver exported media for the app until a reviewed Rive runtime is added.

## Master artboard

| Property | Requirement |
| --- | --- |
| Artboard name | `hibi_notch_master` |
| Canvas | **392 × 296 logical points** |
| Origin | top-left; x grows right, y grows down |
| Base overlay host | 392 × 296 pt |
| Runtime display scale | automatic **0.78–0.94** |
| Rendered bounds | 306–368 pt wide × 231–278 pt high |
| Anchoring | centre-top of the selected display |
| Background | fully transparent |
| Native safe-area rule | do not draw required information in top 44 pt; this area can be obscured by menu bar/camera hardware |
| Primary action/text safe area | x: 48–344; y: 70–254 |
| Character safe area | x: 74–318; y: 40–244 |
| Minimum readable body size | 13 pt at the 392 pt artboard; never use animated text as the only copy |
| Minimum touch/click target | 44 × 32 pt; preferred 44 × 44 pt |

### Composition guides

```
392 × 296
┌────────────────────────────────────────┐  y 0
│     reserved top strip — no key UI      │  y 0–44
│          ╭──────────────╮               │
│          │ camera zone  │               │  conceptual only;
│          ╰──────────────╯               │  may be unavailable
│                                        │
│     character / entry action zone       │  y 40–180
│                                        │
│     compact text or action-card zone    │  y 180–254
│                                        │
│        breathing margin                 │  y 254–296
└────────────────────────────────────────┘
```

Do not bake the camera cutout into the exported media. The display hardware differs by Mac model; Hibi applies placement at runtime.

## Rive file conventions

- One `.riv` source per state family, plus the master artboard.
- Use vector shapes, meshes and transforms; avoid raster textures for the companion body.
- Artboard/state-machine input names must use ASCII `snake_case`.
- Keep all external assets self-contained or provide a separately licensed export package.
- Name layers by function: `character`, `face`, `eyes`, `arms`, `speech_card`, `action_primary`, `action_secondary`, `shadow`.
- Use a single art direction, transparent background, and no screen-space UI baked into media.
- Provide a static still for every state for `prefers-reduced-motion` fallback.

## Required semantic states

| Semantic ID | Mode | Duration | End state | Notes |
| --- | --- | ---: | --- | --- |
| `idle_01_loop` | loop | 5–8 s | seamless loop | ambient, no attention demand |
| `listening_in` | one-shot | 350–550 ms | `listening_loop` | entry response to voice/text input |
| `listening_loop` | loop | 2–4 s | seamless loop | calm, readable in peripheral vision |
| `searching_loop` | loop | 2–4 s | seamless loop | thinking/gathering context |
| `creating_task_loop` | loop | 2–4 s | seamless loop | generic action progress, not task-specific text |
| `taby_response_ready_in` | one-shot | 300–500 ms | `taby_response_ready_loop` | successful answer available |
| `taby_response_ready_loop` | loop | 2–4 s | seamless loop | low-energy result hold |
| `working_in` | one-shot | 350–550 ms | `working_loop` | start focus session |
| `working_loop` | loop | 5–8 s | seamless loop | focus ambience |
| `task_completed` | one-shot | 500–850 ms | idle | restrained celebration |
| `waiting_01` | loop/hold | 3–5 s | hold | generic reminder with real HTML text/card over it |
| `confirmation` | hold | 350–500 ms entry | hold | action card appears outside the video |
| `disappointed` | one-shot | 400–650 ms | idle | recoverable error, never shame the user |

The app owns copy, buttons, focus indication and accessibility. Rive owns motion and illustration only.

## Motion system

| Token | Value |
| --- | --- |
| Normal entry | 350–550 ms |
| Normal exit | 420 ms |
| Settle after exit | 80 ms |
| Loop cadence | 2–8 s by state |
| Easing | soft ease-out for entry; linear or imperceptible sine for loops |
| Max visual attention | one main moving region at a time |
| Reduced motion | static still + 120–180 ms opacity transition; no bobbing, spinning, elastic overshoot or continuous loop |

Avoid flashes, strobing, camera shake, rapid scale changes, or cycles under 1 second. Keep face motion subtle enough that a notification does not pull focus from the current app.

## Deliverables

1. Editable `.riv` source files, with all state machines and named inputs.
2. Transparent **WebM VP9 with alpha** exports for Electron, 30 fps, 392 × 296, CRF/bitrate tuned to preserve clean edges.
3. Fallback H.264 MP4 exports, 30 fps, 392 × 296, opaque matte only if alpha is unavailable.
4. PNG static fallback for every semantic state, 392 × 296 and 2× (784 × 592).
5. Preview MP4/GIF contact sheet, state map, font/license list, and asset provenance.

Target budget: under 1.5 MiB per short loop at 1×; under 3 MiB per entry animation. Keep the full initial preload under 8 MiB. Hibi preloads only the current and next semantic state.

## Acceptance checklist for each animation

- Seamless loop at frame boundary where applicable.
- No critical pixels above y=44 or outside x=48–344/y=70–254.
- Looks correct at 0.78×, 0.94× and 2× device pixel density.
- Still works if video does not load: supplied PNG conveys state without animation.
- No readable words, button labels or mandatory instructions inside the animation.
- At least 4.5:1 contrast for any optional graphic text; preferred: no graphic text.
- File name exactly matches the semantic ID above.
- Export begins and ends with transparent alpha where specified.

## Hardware QA matrix

Review each deliverable on: a notched MacBook at 60 Hz, a non-notched Mac, an external 16:9 monitor, and an external ultrawide display. Confirm the animation is centred, does not cover menu-bar controls when passive, remains visible below the camera housing, and does not create a distracting visual jump when the display scale changes.
