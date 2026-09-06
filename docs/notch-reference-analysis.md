# Notch reference analysis — clean-room findings

## Purpose

This document records observable architectural findings from a locally installed reference application to guide an independent Hibi implementation. It does not include, copy, invoke, or distribute the reference implementation.

## Observed architecture

The reference application has three layers:

1. A transparent, borderless Electron overlay window with a separate renderer surface.
2. A native macOS addon that receives the Electron native window handle and adjusts window behavior and frame placement.
3. A state-driven companion renderer that maps semantic events to entry media, loop media, text and cards.

The overlay is a singleton, centres at the top of the selected display, remains present across Spaces/full-screen contexts, and switches between pointer pass-through and pointer capture depending on whether a visible card has controls.

## Why it can appear inside the notch area

The reference addon uses undocumented WindowServer/CoreGraphics interfaces to elevate a private window space beyond documented AppKit levels. This is an implementation detail of that application, not a supported macOS application contract. It also relies on assumptions about the representation of Electron’s native window handle.

Hibi deliberately does **not** use that mechanism. It would create release, compatibility, maintenance and review risk, and cannot be treated as a stable macOS API.

## Hibi equivalent using public APIs

| Reference behavior | Hibi implementation |
| --- | --- |
| Top-centred companion surface | Transparent Electron `BrowserWindow` with calculated display bounds |
| Notch-aware display selection | Native AppKit bridge reads `NSScreen.safeAreaInsets` and auxiliary display regions |
| Multi-Space/full-screen visibility | `setVisibleOnAllWorkspaces({ visibleOnFullScreen: true })` |
| Passive overlay | `setIgnoreMouseEvents(true, { forward: true })` |
| Interactive card | Pointer capture only while actions are visible |
| Native-level promotion | Intentionally unavailable in Hibi because no documented API permits drawing over camera hardware |
| Media state machine | Typed Hibi companion reducer and semantic asset registry |

## Verified local hardware observation

On the development Mac, the Hibi bridge reports one display with a camera housing and a 32-point upper safe-area inset, plus an external display with no housing. This proves the public API can reliably distinguish the scenarios required for responsive placement.

## Product decision

Hibi should describe its experience as a **notch-aware top companion**, not a hardware-notch replacement. The visual target is an integrated, centred companion that respects camera hardware and remains reliable across supported macOS versions.

If product strategy requires pixels over the camera housing, that requires an explicit separate decision to accept unsupported private-platform behavior, with no guarantee of signing, compatibility or future OS stability. It is outside the Hibi supported build.
