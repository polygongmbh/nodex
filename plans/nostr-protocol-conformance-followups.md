# Nostr protocol conformance follow-ups

Remaining findings from the protocol-level audit after the legacy
due-date cleanup (commit `f5d5d1b8`). Items are roughly ordered by
impact-to-effort. Each is independently shippable.

## Context, briefly

- Kinds 1621 / 1630–1633 are reused from NIP-34 (git issues + state)
  by design — a git issue is a task. The only soft cost is that
  NIP-34-aware clients (gitworkshop.dev, ngit, etc.) will try to render
  Nodex tasks as issues without a `repository` (`a` → kind 30617)
  anchor, so they will not know where to file them. Not a bug, just
  the limit of free interop with that client family.
- Kind 30315 is NIP-38 (User Statuses), not custom; `d="nodex-presence"`
  namespaces the entry, and NIP-40 `expiration` is used correctly for
  ephemerality. Touched only where noted below.
- Due dates live exclusively in companion NIP-52 calendar events (kind
  31922 date-based, 31923 time-based) keyed by
  `d=task-date-{taskId}-{dateType}`. The previous on-task `due`/
  `due_time`/`date_type` legacy read path has been removed; the
  redundant `due_time` tag on calendar events has been removed.

## 1. NIP-52 conformance gaps on calendar events

File: `src/infrastructure/nostr/nip52-task-calendar-events.ts`

### 1a. Missing `D` day-bucket tag on kind 31923

NIP-52 requires kind 31923 events to carry
`["D", String(Math.floor(unixSeconds / 86400))]` in addition to the
unique `d` tag. Relays use it to serve day-window queries efficiently.

**Fix:** emit `D` alongside `d` when `hasValidTime` is true. Parser
already doesn't need it, but adding it is one line.

```ts
if (hasValidTime) {
  tags.push(["D", String(Math.floor(Number(dateValue) / 86400))]);
}
```

### 1b. No `start_tzid` when a time is encoded

`applyDueTime` merges HH:MM using `setHours` (local time of the
publisher). The resulting unix-seconds carries no zone info. A reader
in another TZ sees a different HH:MM than the publisher intended.
NIP-52 defines `start_tzid` / `end_tzid` (IANA zone strings) exactly
for this.

**Fix:** when emitting kind 31923, also emit
`["start_tzid", Intl.DateTimeFormat().resolvedOptions().timeZone]`
(and `end_tzid` if `dateType === "end"`). Parser can pass it through
or use it later for display.

Without this, today's behavior is "due time renders in the reader's
local TZ" — usually fine for same-TZ teams, breaks for cross-TZ.

### 1c. Non-standard `"task"` marker on the back-reference `e` tag

`["e", taskId, relayUrl, "task"]` invents a NIP-10 marker. NIP-10
defines only `reply` / `root` / `mention`; NIP-52 has no convention
for "this calendar event belongs to that thing". Other NIP-52
clients will ignore the back-reference entirely (they'll just show
a free-floating calendar entry with a `title`).

**Two options:**

- **Easy:** keep the marker, but also emit a NIP-22 / general `q` or
  bare `e` tag (no marker) so other clients at least see a reference.
- **Better:** if tasks become parameterized-replaceable (see §3),
  reference them via an `a` tag (`kind:pubkey:d`) instead of `e`.
  That is what NIP-52 expects for cross-event references.

## 2. Property-update events leak into other clients' feeds

Files: `src/infrastructure/nostr/task-property-events.ts`,
`src/features/feed-page/controllers/use-task-publish-flow.ts`

Priority changes (and similar metadata mutations) are published as
**kind 1 (TextNote)** with `["e", taskId, "", "property"]` and a
`["priority", N]` tag. Content is `"Priority: N"`.

Other Nostr clients have no concept of the `"property"` marker, so
they render these as ordinary text notes — meaning Nodex users
emit cryptic "Priority: 40" microposts to the global timeline of
anyone following them.

**Options, ranked:**

1. Move priority updates to a dedicated **parameterized-replaceable**
   kind (e.g. 30000-range, after reserving via a NIP PR or a stable
   intra-app number). Each (taskId, propertyName) pair gets a stable
   `d` and replaces cleanly — no event-stream pollution and no
   per-update history bloat.
2. If a NIP number is too ceremonial, at least move off kind 1 to an
   addressable kind that other clients filter out by default.
3. Short-term mitigation: prefix content with an invisible/zero-width
   sentinel and have the converter filter such notes more
   aggressively — but this is a hack and not the right fix.

## 3. Tasks themselves are non-replaceable

Tasks (kind 1621) are regular events, so the task body is immutable.
Every edit (priority, due date, state) is a separate event keyed back
via `e` or as a NIP-52 calendar event. This works, but:

- Every reader pays a fan-in cost: load N property events to compute
  one current value per task.
- Late-arriving older events from a slow relay can briefly "revert"
  state until the merge logic catches up.
- It blocks editing the task content itself (title/description).
  Currently impossible without orphaning all children whose `e` tag
  points at the old id.

**Direction:** move tasks to a parameterized-replaceable kind
(e.g. 30621, reserved via NIP PR) with `["d", <stable-task-id>]`.
Parent/child links and `a` references become addressable. State
updates can keep using NIP-34 1630–1633 (still works against an `a`
target). Due-date calendar events already use `d`-keyed replaceable
state, so they continue unchanged once the back-reference becomes
`a` (see §1c).

This is a meaningful migration — needs a read path that accepts both
shapes during transition, plus thinking about what happens to
historical task IDs in URLs (see §5).

## 4. ~~Calendar-event auth check coverage~~ — not a real gap

Initially flagged as needing extra test coverage for `dueTime` and
`dateType`. On re-read, `canPubkeyUpdateTask` in the calendar merge
loop (`task-converter.ts`) gates the whole event — if the publisher
is unauthorized, the entire calendar event is skipped, so all three
fields are inherently protected together. The existing
"ignores unauthorized due-date and priority updates" test asserting
`dueDate === undefined` already proves the rejection happened. No
action needed.

## 5. Task URLs use bare hex event IDs (not NIP-19)

File: `src/App.tsx` (`<Route path="/:view/:taskId" />`),
`src/pages/Index.tsx` (consumption)

A shared `https://nodex.app/feed/<64hex>` link is technically
resolvable on any relay that holds the event, but:

- No relay hint — recipient on a different relay set sees nothing.
- Not a `nostr:` URI — no interop with non-Nodex clients.

**Fix path:**

1. Generate `nostr:nevent1...` URIs (with 1–2 relay hints) in the
   "share" flow and in any "copy link" affordance.
2. Accept `nevent1...` and `naddr1...` in the URL path so
   `https://nodex.app/feed/nevent1...` resolves the same as the
   bare hex. The decoder
   (`src/lib/nostr/content-references.ts`) is already there.
3. Once tasks become parameterized-replaceable (§3), the canonical
   shareable id becomes `naddr` and works across edits.

## 6. ~~NIP-99 dual `published_at` / `publishedAt`~~ — already fixed

The audit's claim of dual emission was wrong. `nip99-metadata.ts:73`
emits only `["published_at", ...]` (snake_case); the `publishedAt`
token elsewhere in the file is just an internal JS variable name.
No action.

## 7. NIP-38 presence content is structured JSON

File: `src/lib/presence-status.ts` (`buildActivePresenceContent`)

NIP-38 says the `content` field "should be" plain text describing
the user's status (the spec gives `"Sad"`, `"Listening to ..."` as
examples). Nodex stuffs `{state, view, taskId}` JSON in there, so
non-Nodex NIP-38 viewers (Amethyst, etc.) show literal JSON to the
user.

**Fix:** put the structured fields in tags (e.g.
`["view", ...]`, `["a", ...]` for the focused task once tasks are
addressable per §3) and a short human-readable summary in `content`
(e.g. `"focused on: <task title>"` or just `""` for plain "active").

## 8. ~~NIP-04 kind 4 declared but unused~~ — already fixed

The enum in `src/lib/nostr/types.ts` no longer contains an
`EncryptedDirectMessage = 4` entry (jumps from `Contacts = 3` to
`EventDeletion = 5`). If/when DMs are added later, default to
NIP-44 + NIP-17, not NIP-04.

## What's intentionally NOT in this plan

- Kind 1621 / 1630–1633 reuse from NIP-34 — confirmed intentional.
- Kind 30315 (UserStatus) — confirmed standard NIP-38, used correctly
  modulo §7.
- The on-task `due` / `due_time` / `date_type` legacy read path —
  removed in `f5d5d1b8`.
- The redundant `due_time` tag on calendar events — removed in
  `f5d5d1b8`; HH:MM now derives from the unix-seconds `start`.

## Suggested rollout order

1. §1a (`D` tag) — ~5-line fix, fully spec-conformant, no behavior
   change for Nodex.
2. §1b (`start_tzid`) — small write, parser stub, enables proper
   cross-TZ display later.
3. §5 (NIP-19 sharing) — modest UX win, no schema change required.
4. §7 (NIP-38 content shape) — small write change, breaks no Nodex
   consumer if read path tolerates either shape during transition.
5. §2 (property events) and §3 (replaceable tasks) — larger, do
   together since §2 wants a new kind and §3 changes addressing.
   §1c folds into §3.
