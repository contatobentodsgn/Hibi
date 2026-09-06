# Companion assets

This directory contains the locally extracted visual reference assets used for the Hibi study build: notch animation clips, Rive resources, update artwork, and icons.

The assets are intentionally kept separate from application logic. Native helper binaries, compiled application bundles, and proprietary runtime code are not loaded by Hibi automatically; hardware and AI behavior remains behind explicit adapters.

Before distributing a build, confirm that the owner has granted redistribution rights for every asset included here.

## Quarantine boundary

The `rive/talk` resources (`.riv`, `.wasm`, and debug audio) are reference-only and are not loaded by the application. Compiled runtime bundles and native helper binaries are also excluded from this directory. Hibi uses browser media APIs and its own adapters so the study build cannot execute extracted native code or silently contact external services.
