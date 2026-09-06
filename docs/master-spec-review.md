# Master spec review

The supplied `HIBI_MASTER_SPEC2.md` was reviewed as a reference document. It is not identical to the current implementation; it adds a formal, modular character-system contract.

## Adopted in the official Hibi codebase

- A versioned Hibi character VM (`HIBI_CHARACTER_VERSION`) with modes, body, eyes, ears, tail, props, FX, emotion, intensity, progress, accessibility and system flags.
- Stable catalogs matching the proposed 20 body, 30 eye, 10 ear, 8 tail, 40 prop and 20 FX families.
- Five reusable composition presets: deep focus, perfect session, missed task, budget exceeded and pet.
- Composition normalization for intensity/progress and side/back visibility constraints.
- A mapping from the current media states (`working`, `idle`, `completed`, `reminder`) to the future modular VM.

Source: `/Volumes/Games/Projetos/Hibi/HIBI_MASTER_SPEC2.md`.

## Deliberately not claimed as complete

- The Rive `.riv` asset, state machine and exported animations do not yet exist in this repository. The TypeScript contract is now the source of truth for their production.
- The 1024×1024 character artboard is the master design canvas. The existing 392×296 notch overlay remains the runtime viewport and should scale/crop the character safely.
- Finance and streak-related presets are available as contract values, but are not exposed as product screens until those domain features exist.
- Audio/haptics remain optional because the current Electron runtime has no required haptic/audio channel.
- Private macOS APIs remain outside the public adapter and signed builds.

## Rive handoff alignment

Use `hibi_root` as the root, preserve modular slots and shared pivots, and bind the eventual `vm_hibi` to the TypeScript fields. Keep motion reduced through `isReduceMotion`; do not encode user-facing text inside character assets.
