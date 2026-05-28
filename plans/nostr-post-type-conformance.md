# Nostr protocol conformance: comments, property updates, sub-task scoping

## Context

Nodex currently abuses kind 1 (TextNote) for two distinct things:

1. **Comments under tasks/events/listings** — should be **NIP-22 kind 1111** because the root scope is not a kind-1 note. Today they emit as kind 1 with `["e", parentId, "", "reply"]` and leak into other clients' global timelines.
2. **Task property updates (priority)** — emit kind 1 with `["e", taskId, "", "property"]` + `["priority", N]` + content `"Priority: 42"`. Other clients render this as a cryptic micropost. Flagged in `plans/nostr-protocol-conformance-followups.md` §2.

Two further loose ends fold in:

3. **Sub-task scoping** uses an invented `"parent"` NIP-10 marker (NIP-10 only knows `root`/`reply`/`mention`), so other clients ignore the link.
4. **Calendar back-reference** (§1c of the conformance plan) uses a `"task"` marker on `e` — same custom-marker problem.

**Hard constraint from the user:** tasks (kind 1621) are intentionally **NOT replaceable** for posterity. So this plan does not touch §3 of the conformance doc (move-to-30621) — tasks stay as regular kind 1621 events with immutable bodies.

### Policy decisions (locked by user)

- **Nesting policy (publish-time):**
  - Task → sub-task (1621 → 1621) ✓
  - Task → comment (1621 → 1111) ✓ (implicit from "comments on anything other than kind 1")
  - Calendar event / Listing → comment (1111) ✓
  - Comment → reply (1111 → 1111) ✓
  - **Disallowed:** sub-events or sub-listings under any parent. Tasks link to their calendar event via the existing `d=task-date-{taskId}-{dateType}` mechanism, not via `parentId`.
- **Property-update kind:** new parameterized-replaceable kind in the 30000–39999 range (proposed `30621`, mirroring task kind 1621). One `d` per `(task, propertyName)`. Latest authorized wins. History is intentionally dropped.
- **Back-compat:** **permanent read** — old kind-1 comments and old kind-1 priority events continue to parse forever. Writes go out new-shape only.

## Goals

1. Comments emit as **kind 1111** with proper NIP-22 root + parent scoping.
2. Priority updates emit as **kind 30621** (parameterized-replaceable, `d=task-{prop}-{taskId}`).
3. Sub-tasks use the NIP-10 `"reply"` marker instead of the invented `"parent"`, plus a `["k", "1621"]` kind disambiguator.
4. Calendar back-reference drops the invented `"task"` marker (§1c).
5. Composer/publish layer gates child-of-parent combinations per the policy above. Ingest stays permissive for back-compat.
6. All legacy shapes keep parsing forever.

## Non-goals

- Making tasks replaceable (explicitly rejected — posterity).
- Migrating existing historical events to the new shape (we don't rewrite; we just read both).
- Touching state events 1630–1633 — they're already NIP-34 conformant.
- Anything else from the conformance doc (§1a, §1b, §5, §7) — those are independent.

## Design

### 1. Kind 1111 comments

#### Type system
- `src/lib/nostr/types.ts`: add `Comment = 1111` to `NostrEventKind`.
- `src/domain/content/task-kind.ts`: `isCommentKind` returns true for `TextNote` **and** `Comment`. Add `isLegacyCommentKind` (TextNote-only) for places that need to distinguish.
- `src/types/index.ts`: extend `CommentPost.kind` to `TextNote | Comment`.

#### Publish — new helper
New file `src/infrastructure/nostr/nip22-comment-events.ts`:
- `buildNip22CommentTags({ parent, root, mentionPubkeys, hashtags, attachments }) → string[][]` where `parent` and `root` carry `{ id, kind, pubkey, dTag?, relayHint? }`.
- Emit, per NIP-22 (`/Users/tj/IT/nostr/nips/22.md`):
  - Root scope (uppercase) — addressable root → `A`+`K`+`P`; regular root → `E`+`K`+`P` (E tag's 4th positional is root pubkey per the spec example).
  - Parent scope (lowercase) — same shape but `a`/`e`/`k`/`p`. For top-level, parent == root (both emitted, as the NIP example does).
  - For addressable parents, also emit lowercase `e` with the parent's current event id (NIP-22 example, line 80 of `22.md`).

#### Publish — wiring
- `src/features/feed-page/controllers/use-task-publish-flow.ts`:
  - Around line 506, when `normalizedPostType === "comment"` AND the resolved parent is **not** kind 1: choose `publishKind = NostrEventKind.Comment` (1111). Otherwise keep `TextNote`.
  - Look up the parent post in `allTasks` (already in scope) to get `parentKind`, `parentPubkey`, and `dTag` if addressable.
  - Walk the chain to the root (NIP-22 wants the *thread* root, not just the immediate parent) — small helper `findRootPostFor(allTasks, parentId)`.
  - Build tags via `buildNip22CommentTags` instead of the current bare-`["t", ...]`/mention path.
  - Stop passing `publishParentId` to `publishEvent` for kind 1111 — the helper above already emitted parent tags; we don't want `signEvent` to auto-inject another `e reply`.
- `src/infrastructure/nostr/provider/use-publish.ts`:
  - Around line 65, the auto `e reply` injection should only run for `TextNote` (kind 1 NIP-10 replies). Skip for `Comment` (1111) and `Task` (1621) — those already include their own parent tags.

#### Ingest
- `src/infrastructure/nostr/task-converter.ts`:
  - Add `Comment` to the accepted-kind list (line 243-251 area). Treat as `CommentPost`.
  - For 1111 events: parent comes from lowercase `e` or `a` tag. For `a` tags, resolve via the event-address map already maintained by the converter (calendar events use this pattern — look at how `parseLinkedTaskDueFromCalendarEvent` resolves an `e`-tag target task; mirror for `a`).
  - Keep existing kind 1 → comment ingest path unchanged for back-compat (the converter already accepts both `parent` and `reply` markers at line 108-110).

### 2. Property-update events: kind 30621

#### New file
`src/infrastructure/nostr/task-property-update-events.ts` — replaces the kind-1 emission in `task-property-events.ts:49`. (Keep `task-property-events.ts` for the **read** parsers of legacy kind-1 priority; rename if it becomes confusing.)

Emit shape:
```ts
{
  kind: 30621,
  content: "",                                   // intentionally empty; humans don't read these
  tags: [
    ["d", `task-${propertyName}-${taskId}`],    // stable per (task, property)
    ["e", taskId, relayHint],                   // no custom marker
    ["k", "1621"],
    ["p", taskOwnerPubkey, relayHint],
    [propertyName, String(value)],              // e.g. ["priority", "70"]
  ],
}
```

Properties to migrate now: `priority`. Helper is generic so future property kinds (e.g. `assignees`-as-deltas if ever needed) reuse it.

#### Wiring
- `src/features/feed-page/controllers/use-task-publish-controls.ts:112-121`: call the new builder; publish kind 30621.
- `src/infrastructure/nostr/task-converter.ts` (line ~346-373 priority merge):
  - Accept both kind 1 (legacy, content `"Priority: N"` + `["priority", N]` tag) and kind 30621 (`["priority", N]` tag with `d`-keyed addressable).
  - Latest by `created_at` wins across both shapes, gated by `canPubkeyUpdateTask` as today.
- `src/lib/nostr/types.ts`: add `TaskPropertyUpdate = 30621` to `NostrEventKind`.

#### Subscription filters
Any subscription filters that fetch property events need to add kind 30621. Check `src/lib/nostr/provider/use-subscriptions.ts` (or wherever subscription filters are assembled) and add the kind to the existing priority-event filter.

### 3. Sub-task marker fix

- `src/infrastructure/nostr/task-publish-tags.ts:16-18`: change marker from `"parent"` to `"reply"`. Add `["k", String(parentKind)]` companion tag. Builder needs to receive `parentKind` (publish flow already has access to the parent post — pass `parentKind` through).
- `src/features/feed-page/controllers/use-task-publish-flow.ts:525-533`: thread `parentKind` into `buildTaskPublishTags`.
- Ingest: no change. The converter at line 108-110 already accepts both `parent` and `reply` markers, so legacy `"parent"`-marker events keep parsing and new `"reply"`-marker events also parse.

### 4. Calendar back-reference marker fix (§1c)

- `src/infrastructure/nostr/nip52-task-calendar-events.ts:83`: change `["e", taskEventId, relayUrl || "", "task"]` to `["e", taskEventId, relayUrl || ""]` (drop the marker) plus `["k", "1621"]`.
- Ingest at line 180-183 already falls back to a bare `e` tag if the `"task"`-marker lookup fails, so legacy events keep working.

### 5. Composer publish-time gating

New helper `src/domain/content/nesting-policy.ts`:
```ts
type ChildKind = "task" | "comment" | "event" | "listing";
export function canParent(parentKind: NostrEventKind | undefined, childKind: ChildKind): boolean
```

Rules per locked policy:
- `parentKind === undefined` (top-level): any childKind ✓.
- `parentKind === Task (1621)`: childKind ∈ {task, comment} ✓.
- `parentKind ∈ {CalendarDateBased, CalendarTimeBased, ClassifiedListing}`: childKind === comment only.
- `parentKind === Comment (1111)`: childKind === comment only.
- `parentKind === TextNote (1)`: childKind === comment only (publishes as legacy kind-1 NIP-10 reply).

Apply in the composer:
- `src/features/feed-page/controllers/use-task-publish-controls.ts` (or the composer-runtime layer) gates the available post-type chips based on the focused-parent kind.
- `use-task-publish-flow.ts`: as a safety net, if `canParent` returns false at publish time, clear `submissionParentId` (degrade to top-level) and warn via console — don't silently drop the publish.

### 6. Back-compat read paths

All existing read paths stay. Specifically:
- `task-converter.ts:108-110` keeps both `parent` and `reply` marker handling.
- `task-converter.ts:243-251` keeps `TextNote` in the accepted kinds → legacy comments parse.
- Priority merge keeps the kind-1 content-parsing branch alongside the new kind-30621 branch.
- Calendar back-reference keeps the `"task"`-marker fallback.

## Critical files

**New:**
- `src/infrastructure/nostr/nip22-comment-events.ts` — comment tag builder.
- `src/infrastructure/nostr/task-property-update-events.ts` — kind 30621 builder.
- `src/domain/content/nesting-policy.ts` — `canParent` rules.
- Tests for each new file.

**Modified:**
- `src/lib/nostr/types.ts` — add `Comment = 1111`, `TaskPropertyUpdate = 30621`.
- `src/domain/content/task-kind.ts` — extend `isCommentKind`.
- `src/types/index.ts` — `CommentPost.kind` widened.
- `src/features/feed-page/controllers/use-task-publish-flow.ts` — kind selection, NIP-22 tag emission, root walk, gating safety net.
- `src/features/feed-page/controllers/use-task-publish-controls.ts` — property-update kind swap; composer gating.
- `src/infrastructure/nostr/task-publish-tags.ts` — marker `parent` → `reply`, add `k` tag.
- `src/infrastructure/nostr/provider/use-publish.ts` — skip auto `e reply` injection for non-TextNote kinds.
- `src/infrastructure/nostr/task-converter.ts` — accept 1111, accept 30621 priority, address-resolution for `a` parents.
- `src/infrastructure/nostr/nip52-task-calendar-events.ts` — drop `"task"` marker, add `k` tag.
- Any subscription filter file that currently lists priority kinds — add 30621 (likely `src/lib/nostr/provider/use-subscriptions.ts`).

## Verification

1. **Unit tests** (`npx vitest run`):
   - `nip22-comment-events.test.ts`: tag shapes for (top-level on task), (top-level on calendar event), (reply to comment), (reply to comment under a calendar event with addressable root).
   - `task-property-update-events.test.ts`: kind 30621, correct `d` per (task, prop), tag shape, content empty.
   - `task-converter.test.ts`: legacy kind-1 comment still parses; new kind-1111 comment parses; both `a`-parent and `e`-parent resolve; legacy kind-1 priority parses; new kind-30621 priority parses; latest-wins across shapes.
   - `nesting-policy.test.ts`: full truth table.
   - `nip52-task-calendar-events.test.ts`: back-ref without marker still resolves on ingest.
   - `task-publish-tags.test.ts`: sub-task gets `"reply"` marker and `k` companion.

2. **Manual end-to-end** (`npm run dev`):
   - Create a task, focus it, post a comment → inspect outbound event in dev tools → kind 1111, has `E`/`K`/`P` root + `e`/`k`/`p` parent matching the task.
   - Reply to that comment → kind 1111, root still points at task, parent at the comment.
   - Create a calendar event (standalone), post comment under it → kind 1111 with `A` root pointing at the calendar event's address.
   - Create a sub-task under a task → kind 1621 with `["e", parentId, ..., "reply"]` + `["k", "1621"]`. No `"parent"` marker.
   - Change priority on a task → outbound kind 30621 with `d=task-priority-<id>`, no kind-1 events emitted.
   - Verify legacy events still render: load a relay populated by an older Nodex build (or seed a fixture via `npx vitest`) and confirm legacy comments and legacy priority both appear as before.
   - Verify gating: while focused on a calendar event, the composer offers only "comment" (no "task"/"event"/"listing" chip).

3. **Cross-client sanity** (optional, manual):
   - Publish a kind-1111 comment from Nodex; open Amethyst or another NIP-22-aware client and confirm it threads under the task. (No leak into the global timeline.)
   - Publish a priority change; confirm it does **not** appear in Amethyst's home feed.

## Rollout

Three independent commits, in order:

1. **Comments → NIP-22** (the user-visible win — stops feed pollution from comments). Includes the type-system additions, new builder, publish wiring, ingest extension, tests, back-compat verification.
2. **Property updates → kind 30621**. Includes new builder, publish swap, ingest extension, subscription-filter update, tests.
3. **Marker fixes + nesting policy** (sub-task `parent`→`reply`, calendar `"task"` drop, `canParent` gating). Smaller, mostly hygienic.

Each commit is shippable on its own and leaves the read path back-compatible.
