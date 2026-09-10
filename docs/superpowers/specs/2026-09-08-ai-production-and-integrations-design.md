# Production AI and integrations design

## Objective

Make Hibi's configured AI dependable in daily use and add an owned integration
platform for external services without exposing credentials, silently modifying
remote content, or compromising the offline-first workspace.

This is delivered as two independently releasable slices:

1. production AI: streaming, cancellation, classified failures, bounded retry,
   consumption accounting, model guidance, transparent provenance, and fallback;
2. integrations: connection lifecycle, Notion, Slack, email, webhooks, public
   API, import, sharing, and remote notifications.

## Decisions

- The existing local heuristic provider remains always available and is the final
  offline fallback. A remote failure never blocks local planning.
- Remote mutation is never implicit. Every connector write, external message,
  webhook delivery with sensitive data, share invite, and remote notification
  requires a Hibi confirmation token immediately before execution.
- OAuth refresh tokens, API keys, SMTP passwords, webhook signing secrets, and
  public API tokens live only in the macOS Keychain. Workspace backups and UI
  exports contain connection metadata but never secrets.
- Hibi stores a durable, append-only local integration audit that records intent,
  provider, remote resource ID, result, retry count, and safe error class; it
  never stores message bodies, authorization headers, or raw provider errors.
- All remote work is opt-in per connector. Disconnected is the default state.
- The public API is local-only by default (loopback + bearer token) and must not
  bind to a network interface until a later, separately approved security design.
- Provider "real" tests are a separately gated test suite. They run only when an
  operator supplies explicit test credentials and an allowlisted test endpoint;
  ordinary CI uses deterministic protocol fixtures and must not reach the network.

## Production AI

### Provider contract

The provider layer gains a streaming event contract rather than leaking vendor
SSE frames into React. Each event is one of `started`, `delta`, `usage`,
`completed`, `retrying`, or `failed`. The runtime assembles deltas into the same
bounded structured reply contract used today, while the UI shows text as it
arrives and keeps the final proposal/tool validation atomic.

An OpenAI-compatible request uses server-sent events when the configured server
supports `stream: true`; otherwise it uses the current JSON completion path and
emits one terminal delta. Provider metadata includes the exact reported model,
request ID when supplied, finish reason, and normalized usage values.

### Errors, retry, cancellation, fallback

The Electron main process converts remote errors into safe classifications:

| Class | User-facing meaning | Retry | Fallback |
| --- | --- | --- | --- |
| `invalid_credentials` (401/403) | Key or permission must be fixed | never | optional local answer |
| `rate_limited` (429) | Provider is busy; retry time shown | retry once using Retry-After or bounded backoff | local answer after final failure |
| `unavailable` (408/5xx/network/timeout) | Provider is temporarily unavailable | retry twice with capped exponential jitter | local answer after final failure |
| `invalid_response` | Provider returned unusable data | never | local answer |
| `cancelled` | You stopped this response | never | none |

Only retry-safe generation requests are retried. Tool execution and external
connector mutation are never retried automatically. Cancellation is visible from
the first generating state, aborts the main-process request, stops deltas, and
renders a clear cancelled state instead of an error.

Fallback is user-configurable: `ask`, `automatic`, or `never`. The default is
`ask` for credential failures and `automatic` for temporary availability errors.
Every reply identifies its actual provider and model, including local fallback.

### Consumption and model selection

Usage records hold timestamp, provider, model, input tokens, output tokens,
total tokens, estimated cost when a configured price table is known, outcome,
and fallback flag. They are local, bounded by a retention setting, exportable as
safe CSV/JSON, and never sent elsewhere.

The AI settings view offers model presets by task: balanced, fast/low-cost, and
high-reasoning. A custom model remains available, but configuration validates the
selection against an optional provider model-list endpoint or uses declared
compatible presets. The conversation header and every historical assistant entry
show the provider/model actually used.

## Integration platform

### Core contracts

`src/integrations` owns connector-neutral types: connection state, capabilities,
credential references, resource snapshots, import candidates, outgoing actions,
sync cursors, audit records, and typed safe errors. Each connector implements a
small `IntegrationConnector` interface:

- authenticate and revoke;
- read/iterate remote resources;
- normalize import candidates;
- prepare a write action without executing it;
- execute an approved action;
- report health and sync status.

The Electron main process owns all outbound HTTP and OS credential operations.
The renderer receives bounded connection state and sanitized data only through a
narrow preload bridge. A connector cannot call arbitrary URLs: its request client
enforces an allowlist registered by the connector, HTTPS, body limits, redirect
rejection, and redacted errors.

### Service behavior

| Service | First release capabilities |
| --- | --- |
| Notion | OAuth connect, select databases, import tasks/pages, create/update approved Hibi-linked tasks |
| Slack | OAuth connect, choose channels, import starred/saved items, post approved reminders/statuses |
| Email | OAuth IMAP/Graph/Gmail-compatible provider connection, import flagged messages, compose/send only after confirmation |
| Webhooks | Signed outbound events and inbound loopback receiver with replay protection |
| Public API | Local bearer-token REST API for read/write workspace operations, OpenAPI document, confirmation required for destructive writes |
| Import | ICS plus normalized CSV/JSON task imports; deduplication preview and conflict resolution before commit |
| Sharing | Signed, expiring read-only local/export shares; no public hosting without an explicit remote service configuration |
| Remote notifications | Explicit provider connection with user-selected events and confirmation for test/send; local macOS notifications remain independent |

Where a provider requires product-specific OAuth client registration or a paid
remote notification account, Hibi presents a connection setup screen and remains
fully usable offline until credentials are supplied. The implementation is real
but does not embed vendor secrets.

### Sync and conflicts

Imports produce a preview with new, changed, duplicate, and conflicting records.
The user chooses per item: keep Hibi, keep remote, duplicate, or skip. Hibi
stores a connector-specific remote ID and revision/updated timestamp only after
an approved import/export succeeds. Pull sync is manual by default and may be
scheduled later per connector; push occurs only from an approved user action.
Connection status exposes last successful sync, pending actions, recoverable
error, and retry affordance.

## UI

Settings gains an AI "Runtime" subsection for provider/model, streaming state,
fallback policy, usage summary, and safe export. The assistant view gains a
live response area, Stop button, retry/fallback actions, classified error card,
and a provenance chip on each assistant message.

Settings also gains an Integrations section showing each connector's status,
capabilities, last sync, and connection/revoke actions. Imports, writes,
webhooks, sharing, and remote notifications use confirmation cards consistent
with the existing AI confirmation flow. The native notch remains visual-only;
all buttons render in the normal companion/action card below it.

## Security and privacy

- No secret crosses Electron preload or enters localStorage, telemetry, audit
  exports, support bundles, or workspace backup.
- Remote services receive the least data necessary for the action in question.
- OAuth uses PKCE, loopback callback validation, state validation, and encrypted
  token storage in Keychain.
- Webhook verification checks signature, timestamp, replay nonce, body size, and
  allowlisted source before any local action; inbound actions require the same
  confirmation policy as AI tools.
- Public API is disabled until explicitly enabled, uses a revocable Keychain token
  and loopback binding, limits requests, logs safe audit events, and exposes no
  arbitrary file/system capabilities.

## Testing and verification

- Unit tests cover streaming assembly, retry selection, cancellation, error
  classification, usage normalization, model-policy selection, and fallback.
- Main-process tests simulate OpenAI-compatible SSE and JSON responses, including
  abort, 401/403, 429 Retry-After, timeout, 5xx, malformed frames, and response
  size limits.
- UI tests cover live delta rendering, Stop, retry, fallback choice, accessible
  status/error text, and per-message provenance.
- Connector contract tests run each connector against a local fake server;
  integration tests cover OAuth state/PKCE, Keychain boundaries, import preview,
  conflict decisions, confirmation, audits, and secret redaction.
- A manually enabled `test:providers:live` suite uses only configured sandbox/test
  accounts and never runs by default. Its report proves real endpoint behavior
  without storing credentials or prompt content.

## Acceptance criteria

- A configured provider streams visible content; stopping it is immediate and
  clearly reflected in the interface.
- Every completed answer shows the actual provider/model and safe usage data.
- Failure handling is classified, bounded, retry-safe, and has a truthful local
  fallback path.
- The product remains useful offline with no connected service.
- Each connector is safely connectable, auditable, importable, and can perform
  only confirmed remote writes.
- Credentials and secrets remain outside all backups, exports, renderer state,
  logs, and tests.
- All deterministic tests pass; live provider verification is optional, explicit,
  and credential-gated.
