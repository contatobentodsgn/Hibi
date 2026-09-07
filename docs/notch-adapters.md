# Notch adapters

Hibi selects one native-notch adapter in the Electron main process. Renderer code never selects an adapter, accesses native handles, or controls display bounds.

## `public` — default and distributable

This is always the default. On macOS with the compiled addon available, it owns a singleton AppKit `NSPanel`; Electron supplies only validated presentation state and receives bounded confirmation actions. When the host cannot initialize, it uses the documented Electron fallback. Both paths use documented Electron and AppKit capabilities only:

- top-centred native companion panel, selected from `NSScreen` by display ID;
- display/safe-area detection;
- all-Spaces and full-screen behavior;
- click-through for passive presentations;
- pointer capture only for interactive cards.

The native host reports `created`, `visible`, `interactive`, selected `displayId`, frame, and active request through `hibi:notch:capabilities`. It repositions after Electron display events, macOS screen-parameter changes, and wake from sleep. The renderer never obtains a native handle.

The physical camera area remains outside Hibi’s contract: this is a top-edge companion surface built only with public APIs, not a WindowServer or camera-housing integration.

It remains selected in every packaged build, regardless of environment variables.

## `experimental` — local laboratory only

This module is loaded lazily and only when all of the following conditions are true:

```text
HIBI_NOTCH_ADAPTER=experimental
HIBI_ALLOW_EXPERIMENTAL_NOTCH=1
app is not packaged
platform is macOS
```

The adapter is intentionally excluded from the public release path. A packaged build forcibly resolves to `public` and reports an explanatory reason through `hibi:notch:capabilities`.

The current experimental adapter is a no-op laboratory seam. It contains no private macOS calls and must not be used to import, execute, or reproduce proprietary code. Any future experiment requires separate architecture review and must remain outside signed/release builds.

## Manual release matrix

Before enabling the native host in a release, show a passive result and an interactive confirmation, then verify both visibility and action delivery on:

1. a MacBook with a camera housing;
2. a Mac without a camera housing;
3. an external display, including reconnect after unplugging it;
4. a second Space and an unrelated full-screen app; and
5. wake after system sleep.

For each case, capture `hibi:notch:capabilities` and confirm the host reports the intended display, `visible: true`, and the action callback returns only the matching request ID.
