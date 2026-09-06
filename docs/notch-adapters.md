# Notch adapters

Hibi selects one native-notch adapter in the Electron main process. Renderer code never selects an adapter, accesses native handles, or controls display bounds.

## `public` — default and distributable

This is always the default. It uses documented Electron and AppKit capabilities only:

- top-centred transparent overlay;
- display/safe-area detection;
- all-Spaces and full-screen behavior;
- click-through for passive presentations;
- pointer capture only for interactive cards.

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
