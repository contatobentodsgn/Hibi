# Taby conversations design

## Objective

Keep what a person said to Taby. Today `TabyView` holds the exchange in `useState`,
so leaving the screen discards it: there is no way to reread yesterday's reasoning,
resume a thread, or find the answer that was already given. Add saved conversations
with a list, search and an explicit "new chat", without turning the workspace backup
into a transcript archive.

## Decisions

| Topic | Decision |
| --- | --- |
| Where it lives | `localStorage` key `hibi-conversations`, **outside** `StudyData`. `createWorkspaceBackup` serializes `StudyData` wholesale, so storing conversations there would put every transcript into every exported backup. The document promises a "backup JSON sem segredos"; a chat log is the most intimate data in the app. Precedent: `hibi-events` and `hibi-ai-history` already live outside the repository. |
| Cost of that choice | Conversations do **not** travel in the backup. Restoring on another machine brings tasks, notes and activity — not the chats. This is stated in the UI and in the status document rather than left to be discovered. |
| What is stored | The full text of both sides. A summary defeats the purpose: the feature exists to reread the exchange. Each message passes through the same redaction the AI audit already uses (`Bearer`, `sk-`, `api_key`, `token`), so a key pasted by accident is not persisted. |
| Relationship to the AI audit | `src/ai/history.ts` stays as it is. It records *what the AI did* (types, provider, model, tools, a 400-char summary) and is capped at 200. Conversations record *what was said*. Two stores, two purposes; neither replaces the other. |
| Retention | At most 50 conversations, and a total serialized budget; the oldest is pruned first. `localStorage` holds roughly 5 MB, and silently exceeding it would be worse than pruning on a stated rule. |
| Deleting | One conversation, or all of them — mirroring how the Instrumentation screen already clears the AI history. |
| Palette | Questions asked through `⌘K` join the active conversation. The palette and `TabyView` already share one `AssistantTurnControls`; recording only one surface would leave unexplained gaps in a thread. |
| Creation | A conversation is created when the first message is sent, not when the screen opens. Opening Taby and leaving must not litter the list with empty threads. |
| Titles | Derived from the first user message, trimmed to a short label. No model call to name a thread: that would spend tokens and, with a remote provider, send the text somewhere for a cosmetic gain. |

## Decisions after implementation

Settled while building `feat/taby-conversations`. Where they differ from the sections
below, these win.

- **Opening Taby opens an empty thread.** `useConversations` seeds `activeId` as
  `null`, so a new session — and every reload — starts on a blank thread with the
  earlier conversations listed beside it. The first question then starts a new
  conversation, because `recordTurn` creates one whenever there is no active
  conversation. This is the same rule as the "Nova conversa" button, which only
  clears `activeId`: a thread is never created by arriving, only by speaking. The
  cost is that resuming yesterday's conversation is one click, not automatic; the
  gain is that the list never fills with empty threads, and reopening the app never
  silently appends to a conversation the person has stopped thinking about.
- **The duplicate guard lives in `useConversations` and is keyed on
  `status:requestId`.** The assistant's reply is written from an effect watching
  `turn.state`, and the timestamp is taken with `new Date().toISOString()` at the
  moment the effect runs — so under `React.StrictMode`, which runs effects twice,
  the same reply arrives with two different `at` values. Comparing the message
  content (the `sameMessage` check inside `recordTurn`) therefore cannot catch it:
  the two copies genuinely differ. The `handled` ref keyed on the turn's
  `status:requestId` identifies the *transition*, not the text, and is the only
  guard that holds. `recordTurn`'s own comparison stays as a second line of defence
  for a caller that replays an identical message.
- **`conversations` is a required prop on `CommandPalette`, not optional.** The
  palette asks questions while `TabyView` is unmounted, so it is the surface most
  likely to be wired up wrong. Making the prop optional would let a call site
  compile while silently dropping every question asked at `⌘K` into a thread that
  does not exist. Required, `tsc` names the file that forgot.
- **Conversations are ordered by instant, not by string.** `pruneConversations`
  compares `Date.parse(updatedAt)` rather than `localeCompare`. String order matches
  chronological order only while every timestamp is UTC with a `Z` and a fixed
  width; one `updatedAt` carrying an offset (`2026-09-11T09:00:00-03:00`) sorts
  before an earlier UTC instant and prunes the wrong conversation. The same class of
  bug already broke the Day and Week views outside São Paulo.

## Data

`src/domain/conversations.ts` owns the shape and the pure rules:

```ts
export type ConversationMessage = Readonly<{ role: 'user' | 'assistant'; text: string; at: string; provenance?: string }>;
export type Conversation = Readonly<{ id: string; title: string; createdAt: string; updatedAt: string; messages: readonly ConversationMessage[] }>;
```

Pure functions, all total and side-effect free: `createConversation(first, at)`, `appendMessage(conversation, message)`, `titleFor(text)`, `searchConversations(list, query)`, `pruneConversations(list, limits)`, `sanitizeConversation(value)` for anything read back from storage.

`src/data/conversation-store.ts` owns persistence only: `load(storage)`, `save(storage, list)`. It validates every record on read — an unparseable or malformed store degrades to an empty list rather than throwing, following `loadAiAuditHistory`.

## User interface

`TabyView` gains a conversation list beside the thread: each entry shows the derived
title and when it was last updated, the active one marked with `aria-current`. A search
input filters by message text. "Nova conversa" starts an empty thread without deleting
anything. Each entry has a delete control; clearing everything lives next to it and
asks for confirmation, as destructive controls elsewhere in the app do.

All strings come from `src/i18n/dictionary.ts` in both `pt` and `en`. The greeting is
currently hardcoded in Portuguese inside `TabyView`; it moves to the dictionary as part
of this work, since the component is being rewritten anyway.

The screen states plainly that conversations stay on this Mac and are not included in
the workspace backup.

## Error handling

Storage can be full or unavailable. A failed save never interrupts the conversation:
the exchange continues in memory, an instrumentation event is logged with result
`fail`, and the existing inline error surface explains that the conversation could not
be saved. This follows the rule already used for the activity ledger: the action stands,
only the recording is reported as failed.

Malformed data read from storage is discarded per record, not per store: one corrupt
conversation does not erase the rest.

## Testing

Pure domain functions are tested directly, including pruning at the boundary, search
matching message text rather than titles alone, and redaction of a pasted credential.
The store is tested against a fake storage host, including a full-quota failure and a
corrupt record among valid ones. `TabyView` is covered with `renderToStaticMarkup`
following the project's idiom (there is no DOM environment), asserting the list, the
active marker, the search filter and the empty state. One Playwright test covers the
round trip: ask something, reload, and find the conversation still there.

## Out of scope

Exporting conversations, renaming them by hand, folders, sharing, and any model call
used to summarize or title a thread. Syncing conversations across machines is out of
scope by the same reasoning that keeps them out of the backup.

## Acceptance criteria

- A conversation survives leaving the screen and reloading the app.
- Questions asked through the palette appear in the active conversation.
- Search finds a conversation by words inside its messages, not only its title.
- Deleting one conversation leaves the others intact; clearing all asks first.
- A pasted `sk-…` or `Bearer …` is not present in what is written to storage.
- An exported workspace backup contains no conversation text.
- With storage unavailable, the exchange continues and the failure is surfaced once.
