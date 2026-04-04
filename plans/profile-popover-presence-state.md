# Profile Popover Presence State Plan

## Goal

Show richer online state in the user profile hover card/popover:

- whether the person is currently online/recent/offline
- when their latest presence was reported
- what view they are currently looking at
- which task they are looking at when the presence payload includes a task id

## Opinionated Approach

Extend the existing NIP-38 presence pipeline to keep a full per-author snapshot instead of collapsing presence down to a timestamp early.
Drive the hover card from that normalized snapshot through the shared `Person` model so every existing `PersonHoverCard` callsite benefits automatically.
Keep the UI read-only and descriptive for now; do not add navigation/actions until the presence wording and data reliability feel stable.

## Why This Path

The current code already publishes the exact fields we need via `buildActivePresenceContent(view, taskId)`, but `deriveLatestActivePresenceByAuthor` throws away `view` and `taskId`.
If the hover card fetched presence ad hoc, we would create another state path that can drift from sidebar online badges.
Keeping one normalized presence snapshot avoids duplicating “online/recent/offline” rules and lets sidebar status and hover-card detail stay in sync.

## Implementation Plan

### 1. Introduce a shared presence snapshot model

Update [src/lib/presence-status.ts](/Users/tj/IT/nostr/nodex/src/lib/presence-status.ts) so the derived result carries:

- `reportedAtMs`
- `state`
- `view`
- `taskId`

Add a new exported type such as `ActivePresenceSnapshot`.
Prefer adding a new helper like `deriveLatestPresenceByAuthor(...)` and leaving the current timestamp-only helper as a thin compatibility wrapper until callsites are migrated.
That keeps the refactor incremental and limits churn in unrelated code.

### 2. Preserve presence detail in the people/data layer

Update [src/infrastructure/nostr/use-kind0-people.ts](/Users/tj/IT/nostr/nodex/src/infrastructure/nostr/use-kind0-people.ts) to expose both:

- the detailed presence snapshot map for UI consumers
- the existing latest-activity timestamp map for ranking/sorting

Compute the timestamp map from the richer snapshot so the sort logic still works without duplication.
This hook is the right boundary because it already merges kind 0 profile state with Nostr presence-derived activity.

### 3. Extend the shared `Person` shape carefully

Add optional presence detail fields to [src/types/person.ts](/Users/tj/IT/nostr/nodex/src/types/person.ts), for example:

- `lastPresenceAtMs?: number`
- `presenceView?: string`
- `presenceTaskId?: string | null`

Do not overload `onlineStatus` with timestamps or prose.
Keep `onlineStatus` as the coarse badge state and add separate fields for detailed hover-card rendering.
Update fixtures in [src/test/fixtures.ts](/Users/tj/IT/nostr/nodex/src/test/fixtures.ts) only as needed to keep tests readable.

### 4. Thread presence detail into derived people

Update the people derivation path so presence details survive into the `Person` instances rendered across the app:

- [src/domain/content/sidebar-people.ts](/Users/tj/IT/nostr/nodex/src/domain/content/sidebar-people.ts)
- [src/features/feed-page/controllers/use-index-derived-data.ts](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-index-derived-data.ts)

Keep the existing online/recent/offline window logic in `deriveSidebarPeople`, but source it from the richer presence snapshot map instead of a plain timestamp map.
When presence exists, attach the detailed fields to the returned `Person`.
When it does not, leave the new fields undefined so older/non-presence users still render cleanly.

### 5. Resolve human-readable “what they are looking at”

Update [src/components/people/PersonHoverCard.tsx](/Users/tj/IT/nostr/nodex/src/components/people/PersonHoverCard.tsx) to render a compact presence section below the identity block.

Recommended content order:

1. current status badge (`online`, `recent`, `offline`)
2. last reported time (`just now`, `5m ago`, `2h ago`)
3. current view label (`Feed`, `List`, `Kanban`, etc.) when present
4. task context when `presenceTaskId` matches a known task

For task labels, avoid adding store lookups directly inside the hover card.
Instead, pass a small optional resolver/context into the hover card layer, or add a lightweight task-label lookup hook near existing feed/task providers.
Fallback behavior should be:

- known task id -> show trimmed task title
- unknown task id -> show generic “viewing a task”
- missing task id -> omit task line

### 6. Add localized copy for presence detail

Add strings in:

- [src/locales/en/common.json](/Users/tj/IT/nostr/nodex/src/locales/en/common.json)
- [src/locales/de/common.json](/Users/tj/IT/nostr/nodex/src/locales/de/common.json)
- [src/locales/es/common.json](/Users/tj/IT/nostr/nodex/src/locales/es/common.json)

Expect keys for:

- section labels like “Last active” / “Viewing”
- view-name mappings for the presence `view` values
- generic task fallbacks
- relative-time phrasing if an existing shared formatter is not already suitable

Before adding new wording, check whether there is already a reusable relative-time formatter in the codebase.
If not, keep the first pass minimal and consistent with existing timestamp language.

### 7. Test the behavior at three layers

Add or update focused tests for:

- [src/lib/presence-status.test.ts](/Users/tj/IT/nostr/nodex/src/lib/presence-status.test.ts)
  Validate that newer offline events clear active presence and that active snapshots retain `view` and `taskId`.
- [src/domain/content/sidebar-people.test.ts](/Users/tj/IT/nostr/nodex/src/domain/content/sidebar-people.test.ts)
  Validate that detailed presence is attached to `Person` while online status windows still behave the same.
- [src/components/people/PersonHoverCard.test.tsx](/Users/tj/IT/nostr/nodex/src/components/people/PersonHoverCard.test.tsx)
  Validate rendering of status, last-seen text, current view, and task fallback behavior.

Because this crosses data derivation and shared UI, treat it as a major enough change to run:

- `npm run lint`
- `npx vitest run`
- `npm run build`

## Risks And Constraints

- Presence `view` values are currently raw strings; the UI should not assume they are already user-facing.
- Task ids in presence may point to tasks outside the current hydrated relay scope, so the hover card needs a graceful fallback.
- Hover cards appear in multiple surfaces; avoid coupling the component directly to a single page controller.
- Existing unstaged changes are present in task composer files, so implementation should avoid mixing with that work unless necessary.

## Recommended Milestones

1. Presence snapshot refactor with tests.
2. Propagate presence detail into derived `Person` data.
3. Render hover-card UI plus i18n.
4. Run lint, tests, and build.

## Out Of Scope

- Clicking the presence row to navigate to the reported view/task.
- Publishing any new presence payload fields.
- Changing presence refresh cadence or relay targeting.
