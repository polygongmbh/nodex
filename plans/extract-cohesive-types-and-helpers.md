# Plan: Extract More Cohesive Types And Helpers

## Goal

Continue the same cleanup pattern used for `Person`:

- reduce oversized mixed-concern files
- colocate type-specific helpers with the type or domain they belong to
- remove low-signal barrels and “god files”
- prefer cohesive extractions over cosmetic file shuffling

This plan focuses on the next highest-signal candidates already visible in the current codebase.

## Guiding Principles

1. Extract by domain responsibility, not by line count alone.
2. Avoid introducing compatibility re-exports by default.
3. Move helper logic next to the type/domain it actually serves.
4. Prefer behavior-preserving refactors before semantic model changes.
5. Separate broad structural refactors from behavior fixes.

## Recommended Execution Order

1. Split the remaining oversized type barrel in [`src/types/index.ts`](/Users/tj/IT/nostr/nodex/src/types/index.ts)
2. Extract shared composer/listing helpers from [`src/components/tasks/TaskComposer.tsx`](/Users/tj/IT/nostr/nodex/src/components/tasks/TaskComposer.tsx) and [`src/components/mobile/UnifiedBottomBar.tsx`](/Users/tj/IT/nostr/nodex/src/components/mobile/UnifiedBottomBar.tsx)
3. Split [`src/features/feed-page/controllers/use-task-publish-flow.ts`](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-task-publish-flow.ts) by responsibility
4. Decompose [`src/lib/linkify.tsx`](/Users/tj/IT/nostr/nodex/src/lib/linkify.tsx)
5. Extract sidebar state/navigation logic from [`src/components/layout/Sidebar.tsx`](/Users/tj/IT/nostr/nodex/src/components/layout/Sidebar.tsx)
6. Reassess large view files (`FeedView`, `CalendarView`, `ListView`) after the shared helper moves

That order is opinionated on purpose: it removes foundational coupling first, which makes later view/controller extraction easier and less repetitive.

---

## Phase 1: Finish Breaking Up `src/types/index.ts`

### Why this should go first

[`src/types/index.ts`](/Users/tj/IT/nostr/nodex/src/types/index.ts) still owns several unrelated domains:

- relay types
- channel/filter types
- task/post types
- compose/publish types
- saved filter types

This is exactly the same structural smell `Person` had before the split.

### Proposed target files

- [`src/types/relay.ts`](/Users/tj/IT/nostr/nodex/src/types/relay.ts)
  - `Relay`
- [`src/types/channel.ts`](/Users/tj/IT/nostr/nodex/src/types/channel.ts)
  - `Channel`
  - `PostedTag`
  - `ChannelMatchMode`
  - legacy `Tag` alias only if still needed
- [`src/types/task.ts`](/Users/tj/IT/nostr/nodex/src/types/task.ts)
  - `Task`
  - `TaskStateUpdate`
  - `TaskStatus`
  - `TaskInitialStatus`
  - `RawNostrEvent`
  - `TaskEntryType`
  - `FeedMessageType`
  - `PostType`
  - legacy `TaskType` alias only if still needed
- [`src/types/compose.ts`](/Users/tj/IT/nostr/nodex/src/types/compose.ts)
  - `PublishedAttachment`
  - `ComposeAttachment`
  - `ComposeRestoreState`
  - `ComposeRestoreRequest`
  - `TaskCreateFailureReason`
  - `TaskCreateResult`
  - `OnNewTask`
- [`src/types/filters.ts`](/Users/tj/IT/nostr/nodex/src/types/filters.ts)
  - `FilterState`
  - `QuickFilterState`
  - `SavedFilterConfiguration`
  - `SavedFilterState`
  - `SavedFilterController`
  - legacy `TagFilterState` alias if still necessary
- [`src/types/listing.ts`](/Users/tj/IT/nostr/nodex/src/types/listing.ts)
  - `Nip99ListingStatus`
  - `Nip99Metadata`
- [`src/types/task-dates.ts`](/Users/tj/IT/nostr/nodex/src/types/task-dates.ts)
  - `TaskDateType`

### Execution notes

- Do not add re-exports back into `index.ts` if the goal is actually reducing barrel ownership.
- Update imports directly at call sites to the new files.
- Keep the split semantic, not merely alphabetical.

### Risks

- `Task` references many other moved types; import cycles must be watched closely.
- Some files currently import many unrelated symbols from `@/types`; those imports will need deliberate cleanup rather than blind rewriting.

### Verification

- `npm run lint`
- `npx vitest run`
- `npm run build`

---

## Phase 2: Extract Shared Composer And Listing Helpers

### Why this is next

[`src/components/tasks/TaskComposer.tsx`](/Users/tj/IT/nostr/nodex/src/components/tasks/TaskComposer.tsx) and [`src/components/mobile/UnifiedBottomBar.tsx`](/Users/tj/IT/nostr/nodex/src/components/mobile/UnifiedBottomBar.tsx) still duplicate listing/composer text helper logic.

Confirmed overlap:

- `normalizeListingTextFromContent`
- `truncateWordSafe`

`TaskComposer` also contains closely-related NIP-99 autofill helpers and input-transfer helpers that belong in shared utility files.

### Proposed target files

- [`src/lib/composer/listing-text.ts`](/Users/tj/IT/nostr/nodex/src/lib/composer/listing-text.ts)
  - `normalizeListingTextFromContent`
  - `truncateWordSafe`
  - `deriveNip99AutofillFromContent`
- [`src/lib/composer/data-transfer.ts`](/Users/tj/IT/nostr/nodex/src/lib/composer/data-transfer.ts)
  - `extractFilesFromDataTransfer`
  - `hasFilesInDataTransfer`
  - `extractPlainTextFromDataTransfer`

### Desired end state

- `TaskComposer` keeps orchestration and UI state
- `UnifiedBottomBar` keeps mobile-specific interaction state
- shared content/clipboard/listing logic lives in focused helpers

### Optional follow-up

If the shared composer logic grows, create:

- [`src/lib/composer/nip99-autofill.ts`](/Users/tj/IT/nostr/nodex/src/lib/composer/nip99-autofill.ts)

instead of overloading a broader helper file.

### Risks

- `TaskComposer` and `UnifiedBottomBar` are already large; the extraction should not accidentally change behavior around compose mention/tag syncing.
- Avoid mixing UI-only state helpers into generic utility files.

---

## Phase 3: Split `use-task-publish-flow.ts` By Responsibility

### Why this is high value

[`src/features/feed-page/controllers/use-task-publish-flow.ts`](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-task-publish-flow.ts) is a single controller doing several jobs:

- pending publish queue lifecycle
- publish undo behavior
- failed-publish suppression/cache cleanup
- partial-publish notifications
- publish-time mention/tag/task/listing construction
- task creation orchestration

That makes it hard to reason about and hard to test in slices.

### Proposed split

- [`src/features/feed-page/controllers/use-pending-publish-queue.ts`](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-pending-publish-queue.ts)
  - `failedPublishDrafts`
  - `pendingPublishTaskIds`
  - `clearPendingPublishTask`
  - `handleUndoPendingPublish`
  - queue cleanup effects
- [`src/features/feed-page/controllers/use-publish-cache-suppression.ts`](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-publish-cache-suppression.ts)
  - `suppressFailedPublishEvent`
  - cache/query cleanup logic
- [`src/features/feed-page/controllers/use-publish-result-feedback.ts`](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-publish-result-feedback.ts)
  - `notifyIfPartialPublish`
  - related publish success/failure feedback helpers
- keep [`use-task-publish-flow.ts`](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-task-publish-flow.ts) as the orchestration shell that calls into those helpers/hooks

### Alternative

If extracting multiple hooks feels too granular, at minimum split out:

- a pure `task-publish-flow-helpers.ts`
- a dedicated pending-publish hook

### Risks

- This file coordinates many callbacks with shared closure state; extraction should preserve memoization and callback identity where relied upon.
- Undo/pending publish behavior is user-facing and high-impact; tests must stay strong here.

### Verification emphasis

- target focused tests first around undo/pending publish and suppression paths
- then full:
  - `npm run lint`
  - `npx vitest run`
  - `npm run build`

---

## Phase 4: Decompose `src/lib/linkify.tsx`

### Why this matters

[`src/lib/linkify.tsx`](/Users/tj/IT/nostr/nodex/src/lib/linkify.tsx) currently mixes:

- mention-person resolution
- fallback person creation
- embeddable-media URL classification
- markdown token preprocessing
- markdown component rendering
- standalone media embed rendering

This is several distinct concerns inside one very dense file.

### Proposed split

- [`src/lib/linkify/person-mentions.ts`](/Users/tj/IT/nostr/nodex/src/lib/linkify/person-mentions.ts)
  - `resolveMentionPerson`
  - `buildFallbackMentionPerson`
- [`src/lib/linkify/media-embeds.tsx`](/Users/tj/IT/nostr/nodex/src/lib/linkify/media-embeds.tsx)
  - `getUrlExtension`
  - `getYouTubeEmbedUrl`
  - `getEmbeddableMediaKind`
  - `isEmbeddableUrl`
  - `renderStandaloneEmbed`
- [`src/lib/linkify/markdown.tsx`](/Users/tj/IT/nostr/nodex/src/lib/linkify/markdown.tsx)
  - `preprocessMarkdownTokens`
  - `renderMarkdownBlock`

Then keep [`src/lib/linkify.tsx`](/Users/tj/IT/nostr/nodex/src/lib/linkify.tsx) as the public composition layer.

### Important constraint

Do not let this become a “micro-file explosion.” The split is justified only because these are real independent subdomains, not because the file is long.

---

## Phase 5: Extract Sidebar State And Navigation Logic

### Why this is a coherent extraction

[`src/components/layout/Sidebar.tsx`](/Users/tj/IT/nostr/nodex/src/components/layout/Sidebar.tsx) combines:

- rendering
- expanded/collapsed section state
- collapsed preview computation
- keyboard navigation/focus movement
- focused item scroll-into-view behavior

That is an ideal hook extraction.

### Proposed target

- [`src/components/layout/use-sidebar-navigation.ts`](/Users/tj/IT/nostr/nodex/src/components/layout/use-sidebar-navigation.ts)
  - expanded section state
  - focusable item list building
  - focused index state
  - keyboard handlers
  - scroll-into-view side effect

Potential second helper:

- [`src/lib/sidebar-preview.ts`](/Users/tj/IT/nostr/nodex/src/lib/sidebar-preview.ts)
  - collapsed preview selection rules if the logic grows further beyond the current helper usage

### Why not split into many components first

The rendering tree is not the primary problem here; mixed state/navigation logic is.

---

## Phase 6: Reassess The Large View Files

### Candidates

- [`src/components/tasks/FeedView.tsx`](/Users/tj/IT/nostr/nodex/src/components/tasks/FeedView.tsx)
- [`src/components/tasks/CalendarView.tsx`](/Users/tj/IT/nostr/nodex/src/components/tasks/CalendarView.tsx)
- [`src/components/tasks/ListView.tsx`](/Users/tj/IT/nostr/nodex/src/components/tasks/ListView.tsx)

### Why these should wait

A lot of the complexity in these files is downstream of missing shared helpers:

- person label helpers
- status-menu helpers
- shared filter/empty-state helpers
- shared task-card metadata fragments

After earlier phases, a second pass can identify what complexity is still intrinsic versus what was only duplicated support logic.

### Likely extraction targets after earlier phases

- shared task-status interaction helpers
- shared breadcrumb/task-focus helpers
- shared task-card metadata subcomponents
- view-specific controller hooks for scroll/reveal/open-menu behavior

---

## Optional Phase 7: Provider / Nostr Service Layer Splits

### Highest-value candidate

- [`src/infrastructure/nostr/provider/ndk-provider.tsx`](/Users/tj/IT/nostr/nodex/src/infrastructure/nostr/provider/ndk-provider.tsx)

### Recommended split dimensions

- relay lifecycle and reconnect behavior
- auth/session actions
- publish/subscribe transport wiring
- cache/profile hydration coordination

### Why this is optional for now

It is high-value but also high-risk and likely to cascade across many tests. It should follow the easier structural wins above, not precede them.

---

## Concrete Milestone Plan

### Milestone A

Split the remaining type barrel:

- relay
- channel/filter
- task/post
- compose/publish
- listing

Commit as:

- `refactor: split shared type domains out of types barrel`

### Milestone B

Extract shared composer/listing/data-transfer helpers.

Commit as:

- `refactor: extract shared composer text and data-transfer helpers`

### Milestone C

Split pending publish queue/cache feedback responsibilities from `use-task-publish-flow.ts`.

Commit as:

- `refactor: split pending publish and publish feedback from task publish flow`

### Milestone D

Decompose `linkify.tsx` into mention/media/markdown helpers.

Commit as:

- `refactor: split linkify media and mention helpers`

### Milestone E

Extract sidebar navigation/state hook.

Commit as:

- `refactor: extract sidebar navigation state hook`

---

## Verification Strategy

Treat each milestone as a broad refactor:

- before implementation:
  - `git pull --rebase --autostash`
- after each milestone:
  - `npm run lint`
  - focused tests for touched area when useful
  - `npx vitest run`
  - `npm run build`

---

## Refactor Review Checklist

For each milestone, explicitly review:

- duplication removed
- file ownership clearer
- no new barrels introduced without strong reason
- imports made more direct, not more indirect
- behavior preserved
- tests still describing product behavior rather than file layout

## Recommended First Implementation Pass

If you want me to start implementing, I’d begin with Milestone A:

- split `Relay`
- split `Channel` + filter-related types
- split `Task`/compose/listing types
- remove more responsibility from [`src/types/index.ts`](/Users/tj/IT/nostr/nodex/src/types/index.ts)

That creates the best foundation for every other extraction in this plan.
