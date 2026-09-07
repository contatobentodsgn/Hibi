# Notch confirmation design

## Goal

Allow a companion presentation in the macOS notch to request an explicit approval without allowing the renderer to execute arbitrary actions.

## Flow

1. The main process creates an opaque confirmation request with an ID, expiry and fixed action payload.
2. It presents a `confirmation` companion card with `capture` interaction and two action IDs: `confirm` and `cancel`.
3. The overlay sends only `{ requestId, actionId }` through the preload bridge.
4. The main process validates the request is active and unexpired. It invokes the registered approval callback only for `confirm`; either outcome closes the card.
5. Passive presentations remain click-through. Escape does not resolve an active confirmation.

## Invariants

- A renderer never receives callable actions or mutable tool arguments.
- A request resolves at most once.
- Unknown, expired or stale requests are rejected.
- Confirmation controls are keyboard accessible and retain focus within the card.

## Verification

- Main-process tests cover approved, cancelled, stale and expired requests.
- Renderer tests cover the action payload and Escape behavior.
- Existing notch passive-click-through tests remain green.
