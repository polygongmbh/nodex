# Refactor Task Author Metadata to Pubkey-Only

## Goal

Make `Task` follow the Nostr event model for authors:
the task carries only the event author's normalized hex pubkey,
and profile/display metadata is resolved separately from kind `0` people data.

The app-facing field should be named `pubkey` where it represents the Nostr event author.
During migration we can introduce `authorPubkey` as a temporary compatibility alias if that makes the change safer,
but the end state should avoid embedding a whole `Person` on `Task`.

## Current Problem

`Task.author` is currently a full `Person`.
Remote Nostr events only provide `event.pubkey`,
so `nostrEventToTask` fabricates fallback `name` and `displayName` values.
Local publish flow and failed publish drafts also persist full author objects.

That creates ambiguous authority:
kind `0` metadata is the canonical profile source,
but render paths still need to override stale task-embedded labels.

## Current Repo State Check

Checked against the repository on 2026-05-06.

Confirmed current state:

- `src/types/index.ts` still defines `Task.author: Person`.
- `src/types/index.ts` already uses `TaskStateUpdate.authorPubkey: string`;
  state updates are already identifier-based and should remain so.
- `src/infrastructure/preferences/failed-publish-drafts-storage.ts` still stores `FailedPublishDraft.author: Person`.
- No `normalizeNostrPubkey`, `resolvePersonForPubkey`, or `resolvePersonLabelForPubkey` helper exists yet.
- Production call sites still reading task author objects include:
  `src/domain/content/sidebar-people.ts`,
  `src/domain/content/person-filter.ts`,
  `src/domain/content/task-collections.ts`,
  `src/domain/content/task-permissions.ts`,
  `src/domain/content/task-search-document.ts`,
  `src/domain/listings/listing-identity.ts`,
  `src/data/mockData.ts`,
  `src/infrastructure/nostr/task-converter.ts`,
  `src/features/feed-page/controllers/use-task-publish-flow.ts`,
  `src/features/feed-page/controllers/use-pinned-sidebar-people.ts`,
  `src/features/feed-page/controllers/use-focused-task-collapsed-sidebar-preview.ts`,
  `src/features/feed-page/controllers/use-listing-status-publish.ts`,
  `src/features/feed-page/interactions/feed-interaction-intent.ts`,
  `src/components/tasks/FeedView.tsx`,
  `src/components/tasks/feed/FeedTaskCard.tsx`,
  `src/components/tasks/TreeTaskItem.tsx`,
  `src/components/tasks/TaskAssigneeAvatars.tsx`,
  `src/components/tasks/CalendarView.tsx`,
  `src/components/tasks/task-author-profiles-context.tsx`,
  `src/lib/author-color.ts`.
- `src/domain/content/depth-mode-filter.ts` has no author/person dependency and does not need to be touched for this refactor.
- Current working tree has an unrelated `package-lock.json` modification only.

## Persistence Compatibility Policy

No backwards compatibility is required for local persisted state, caches, or drafts.
Permanent application state is saved to relays;
local state is transient recovery/cache state.
When persistence schemas change,
old local state may be ignored, dropped, or overwritten instead of migrated.

Implications for this refactor:

- Do not add migration/read compatibility for older failed publish drafts with `author.pubkey`.
- Do not version local persistence solely to preserve old cache or draft formats.
- Keep persistence schemas simple and aligned with the current app model.
- Document user-visible data loss only when release or push notes are being prepared.

## Proposed Shape

### Task model

Target:

```ts
export interface Task {
  id: string;
  pubkey: string;
  // ...
}
```

Rules:

- `pubkey` is always lowercase normalized hex.
- `pubkey` is the Nostr event author pubkey, not an npub and not a display label.
- No `Person` is embedded in `Task`.
- Existing task fields that point at people should stay identifier-based:
  `mentions?: string[]` and `assigneePubkeys?: string[]` are already acceptable after enforcing normalization.

If the immediate `pubkey` rename is too disruptive,
use a short-lived intermediate shape:

```ts
export interface Task {
  authorPubkey: string;
}
```

Then rename to `pubkey` once call sites are migrated.

### Author display helper

Add a small helper that lets views avoid repeated store lookup logic.

Suggested module:

- `src/domain/people/resolve-person.ts`

Suggested API:

```ts
interface ResolvePersonLabelOptions {
  pubkey: string;
  people?: Person[] | Map<string, Person>;
  fallback?: "npub" | "abbreviated" | "hex";
}

export function resolvePersonForPubkey(
  pubkey: string,
  people?: Person[] | Map<string, Person>
): Person;

export function resolvePersonLabelForPubkey(
  options: ResolvePersonLabelOptions
): ReturnType<typeof formatAuthorMetaParts>;
```

Behavior:

- Normalize input pubkey to lowercase hex before lookup.
- Prefer matching kind `0`/people metadata.
- Fall back to a synthetic `Person` with pubkey-derived labels.
- Keep final display formatting in one place via existing `formatAuthorMetaParts`.

This keeps views simple:
they pass `task.pubkey` and `people`,
without each component knowing the lookup or fallback rules.

### Pubkey normalization helper

Add or reuse a protocol-specific helper for author identifiers.

Suggested module:

- `src/lib/nostr/pubkey.ts`

Suggested API:

```ts
export function normalizeNostrPubkey(value: string): string;
export function isNormalizedNostrPubkey(value: string): boolean;
```

Behavior:

- Accept only 64-character hex for task/event author pubkeys.
- Lowercase valid hex.
- Do not silently accept `npub` for `Task.pubkey`; decode elsewhere at input boundaries if needed.
- Use this helper in event conversion, local publish task creation, filters, permissions, and tests.

## File Impact Overview

### Core types and fixtures

- `src/types/index.ts`
  Replace `Task.author: Person` with `Task.pubkey: string`.
- `src/test/fixtures.ts`
  Update `makeTask` to accept `pubkey` and stop manufacturing a full author.
- `src/types/person.ts`
  Keep `Person` and display formatting helpers.
  Add or reuse label helpers if the new resolver naturally belongs here.

### Nostr conversion and protocol-facing code

- `src/infrastructure/nostr/task-converter.ts`
  Set `task.pubkey = normalizeNostrPubkey(event.pubkey)`.
  Remove fabricated author `Person`.
- `src/lib/nostr/event-converter.test.ts`
  Replace author object assertions with normalized `pubkey` assertions.
  Remove tests that expect generated `task.author.displayName`.
- `src/lib/nostr/task-relay-routing.test.ts`
  Update task fixtures to use `pubkey`.
- `src/infrastructure/nostr/task-property-events.ts`
  Inspect for assumptions around task author identity.
- `src/infrastructure/nostr/task-state-events.ts`
  Inspect for assumptions around task author identity.

### People/profile resolution

- `src/infrastructure/nostr/people-from-kind0.ts`
  Keep deriving `Person` records from kind `0` events.
- `src/infrastructure/nostr/use-kind0-people.ts`
  Keep as the owner of people state.
- `src/infrastructure/nostr/use-nostr-profiles.tsx`
  Either keep as-is or adapt to reuse the same display resolver where practical.
- New `src/domain/people/resolve-person.ts`
  Centralize `pubkey -> Person/display label` lookup and fallback.

### Domain logic using task authors

- `src/domain/content/sidebar-people.ts`
  Use `task.pubkey`.
- `src/domain/content/person-filter.ts`
  Match selected people against `task.pubkey`.
- `src/domain/content/task-permissions.ts`
  Use `task.pubkey` for creator checks.
  Use people resolver only for human-readable messages.
- `src/domain/content/task-search-document.ts`
  Search author metadata by resolving `task.pubkey` against known people.
- `src/domain/content/task-collections.ts`
  Dedupe/sort overlays by `task.pubkey`.
- `src/domain/content/task-text-filter.ts`
  Use the resolver for display-name matching.
- `src/domain/content/task-filtering.ts`
  Confirm person filters operate on normalized pubkeys.
- `src/domain/listings/listing-identity.ts`
  Use `task.pubkey`.
- `src/lib/empty-scope.ts`
  Replace any `task.author` references.
- `src/lib/author-color.ts`
  Change API from `Person` to `pubkey` or add `getAuthorColorForPubkey(pubkey)`.

### Publish flow and draft persistence

- `src/features/feed-page/controllers/use-task-publish-flow.ts`
  Build local `Task` with `pubkey`, not `author`.
  Keep current user/person metadata only where the composer or profile logic needs it.
- `src/infrastructure/preferences/failed-publish-drafts-storage.ts`
  Replace `author: Person` with `pubkey: string`.
  This schema does not need to match `Task`.
  Drop older persisted drafts that still have `author.pubkey`.
- `src/features/feed-page/stores/failed-publish-drafts-store.ts`
  Adapt schema use and tests.
- `src/features/feed-page/stores/task-mutation-store.ts`
  Ensure local pending tasks are keyed with `pubkey`.

### Feed/page controllers

- `src/features/feed-page/controllers/use-index-derived-data.ts`
  `nostrTasks` already come from events; ensure all merged tasks have normalized `pubkey`.
  `mentionAutocompletePeople` and `sidebarPeople` can continue to derive people separately.
- `src/features/feed-page/controllers/use-pinned-sidebar-people.ts`
  Use `task.pubkey`.
- `src/features/feed-page/controllers/use-focused-task-collapsed-sidebar-preview.ts`
  Use `task.pubkey`.
- `src/features/feed-page/controllers/use-listing-status-publish.ts`
  Check ownership against `task.pubkey`.
- `src/features/feed-page/controllers/use-task-status-controller.ts`
  Already uses `authorPubkey` in update calls; rename only if needed for consistency.
- `src/features/feed-page/controllers/use-feed-interaction-frecency.ts`
  Prefer intent payloads that carry pubkey identifiers rather than whole `Person` where possible.

### View components

- `src/components/tasks/FeedView.tsx`
  Stop building `resolvedAuthor` from `task.author`.
  Use the new resolver with `task.pubkey`.
- `src/components/tasks/feed/FeedTaskCard.tsx`
  Accept either `authorPubkey` plus `resolvedAuthor`,
  or just `task` plus `people` and call the resolver internally.
  Preferred: resolve in `FeedView` and pass `resolvedAuthor` to keep card focused.
- `src/components/tasks/TreeTaskItem.tsx`
  Replace direct `task.author` fallback logic with resolver/profile cache.
- `src/components/tasks/task-author-profiles-context.tsx`
  Collect pubkeys from `task.pubkey`.
- `src/components/tasks/TaskAssigneeAvatars.tsx`
  Treat creator as `task.pubkey`; resolve labels via helper.
- `src/components/tasks/CalendarView.tsx`
  Replace color/title use of `task.author` with pubkey resolver/color helper.
- `src/components/tasks/list/ListTaskRow.tsx`
  Replace author label access with resolver.
- `src/components/tasks/kanban/KanbanTaskCard.tsx`
  Replace author label access with resolver.
- `src/components/tasks/ListView.tsx`
  Update any props/tests that pass `currentUser={task.author}`.

### Mock/demo data

- `src/data/mockData.ts`
  Replace task author `Person` input with `pubkey`.
- `src/data/demo-feed.ts`
  Likely follows converted events; verify no task author snapshots remain.
- `src/data/basic-nostr-events.ts`
  Keep event-shaped data unchanged.

### Tests

Primary updates:

- `src/components/tasks/FeedView.test.tsx`
  Replace embedded-author override test with a simpler assertion:
  a task with only `pubkey` displays kind `0` metadata.
- `src/components/tasks/FeedView.kind0-name.test.tsx`
  Currently deleted in worktree; if restored, update similarly.
- `src/components/tasks/TreeTaskItem.test.tsx`
  Update author fixtures and profile resolution expectations.
- `src/components/tasks/ListView.test.tsx`
  Update fixtures and `currentUser` assumptions.
- `src/components/tasks/KanbanView.test.tsx`
  Update fixtures and author color/display checks.
- `src/components/tasks/CalendarView.test.tsx`
  Update fixtures if direct author assertions exist.
- `src/domain/content/*.test.ts`
  Replace `task.author` fixture setup with `pubkey` and people arrays.
- `src/features/feed-page/controllers/*.test.tsx`
  Update publish, filter, sidebar, and frecency tests.
- `src/features/feed-page/stores/failed-publish-drafts-store.test.ts`
  Assert draft schema uses `pubkey`.

## NDK-Aligned Direction

There is a broader design option:
model tasks around event-shaped data, closer to NDK/Nostr structures,
then layer app-specific extensions on top.

Suggested long-term split:

```ts
interface TaskEventModel {
  id: string;
  pubkey: string;
  kind: NostrEventKind;
  created_at: number;
  tags: string[][];
  content: string;
  sig?: string;
  relayUrls?: string[];
}

interface TaskProjection {
  event: TaskEventModel;
  contentPreview: string;
  tags: string[];
  status?: TaskStatusValue;
  dueDate?: Date;
  assigneePubkeys?: string[];
  priority?: number;
}
```

This is cleaner but larger than the immediate author refactor.
Recommended approach:

1. Do the `Task.author -> Task.pubkey` refactor first.
2. Keep derived task fields as the current projection for now.
3. After that lands, decide whether to introduce an explicit `TaskEventModel`/`TaskProjection` split.

That avoids mixing a model rewrite with the author metadata cleanup.

## Migration Steps

### Step 1: Add normalized pubkey and display resolver helpers

- Add `normalizeNostrPubkey` and tests.
- Add `resolvePersonForPubkey` / `resolvePersonLabelForPubkey` and tests.
- Keep existing `Task.author` temporarily.

Verification:

- `npx vitest run src/types/person.test.ts src/infrastructure/nostr/people-from-kind0.test.ts`
- Add focused tests for new helpers.

### Step 2: Change `Task` and event conversion

- Replace `Task.author` with `Task.pubkey`.
- Update `nostrEventToTask` and tests.
- Update fixtures to use `pubkey`.

Verification:

- `npx vitest run src/lib/nostr/event-converter.test.ts`

Protocol note:

- Commit message should mention Nostr event author pubkey normalization.

### Step 3: Update domain logic

- Convert filters, search documents, permissions, collections, listings, sidebar derivation, and color helpers.
- Use resolver only when display metadata is needed.
- Keep pure identity checks on normalized pubkeys.

Verification:

- `npx vitest run src/domain/content src/domain/listings src/lib`

### Step 4: Update publish flow and failed draft schema

- Store draft `pubkey`, not `author`.
- Drop older persisted drafts with `author.pubkey`.
- Restore tasks from drafts with `pubkey`.

Verification:

- `npx vitest run src/features/feed-page/controllers/use-task-publish-flow.test.tsx src/features/feed-page/stores/failed-publish-drafts-store.test.ts`

### Step 5: Update views

- Feed, tree, list, kanban, calendar, avatars, and author profile context use `task.pubkey`.
- Use the new display helper so views do not repeat people lookup/fallback logic.
- Remove tests about task-embedded author names.

Verification:

- `npx vitest run src/components/tasks`

### Step 6: Cleanup and compatibility removal

- Remove temporary aliases if any.
- Search for remaining `task.author`, `draft.author`, and `author: Person` on task-like records.
- Update comments and test names to reflect pubkey-only task authors.

Verification:

- `rg "task\\.author|draft\\.author|author: Person" src`
- `npm run lint`
- `npx vitest run`
- `npm run build`

## Risk Notes

- This is a major cross-module model change.
  It should be done on a clean branch after reconciling current test deletions/modifications.
- Existing persisted failed publish drafts may contain `author`.
  They can be dropped under the no-backwards-compatibility persistence policy.
- `currentUser` and filter intent APIs still use `Person`.
  That is fine for UI/person state, but task identity should be pubkey-only.
- Any place comparing against names for ownership should be tightened.
  Creator permissions should use pubkey, while names/nip05 should only affect labels.

## Commit Plan

Use small commits:

1. `refactor: add pubkey author resolution helpers`
2. `refactor: store task author as nostr pubkey`
3. `refactor: resolve task author labels outside task model`
4. `refactor: store failed publish draft author as pubkey`
5. `test: update task author pubkey coverage`

Because protocol-facing task identity changes are involved,
include Nostr pubkey normalization in the relevant commit body.
