# Plan: Extract More Cohesive Types And Helpers

## Goal

Continue reducing mixed-concern files by extracting cohesive type and helper clusters into obvious homes, with priorities driven by architecture rather than whatever happens to be locally dirty at the moment.

## Current State

### Already done

- `Person` is no longer in the shared type barrel.
- Person-specific helper logic now lives with the type in [`src/types/person.ts`](/Users/tj/IT/nostr/nodex/src/types/person.ts).

### Still true

- [`src/types/index.ts`](/Users/tj/IT/nostr/nodex/src/types/index.ts) is still a broad mixed-domain bucket for:
  - relay types
  - channel/filter types
  - task/post types
  - compose/publish types
  - listing types
- [`src/components/tasks/TaskComposer.tsx`](/Users/tj/IT/nostr/nodex/src/components/tasks/TaskComposer.tsx) and [`src/components/mobile/UnifiedBottomBar.tsx`](/Users/tj/IT/nostr/nodex/src/components/mobile/UnifiedBottomBar.tsx) still share extractable composer/listing helper logic.
- [`src/features/feed-page/controllers/use-task-publish-flow.ts`](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-task-publish-flow.ts) still mixes several responsibilities.
- [`src/lib/linkify.tsx`](/Users/tj/IT/nostr/nodex/src/lib/linkify.tsx) still mixes several unrelated concerns.
- [`src/components/layout/Sidebar.tsx`](/Users/tj/IT/nostr/nodex/src/components/layout/Sidebar.tsx) still combines rendering and navigation/state logic.

## Guiding Principles

1. Extract by responsibility, not by file size alone.
2. Do not reintroduce compatibility barrels unless there is a strong temporary migration reason.
3. Prefer direct imports from the new type/helper file.
4. Keep behavior-preserving refactors separate from semantic data-model changes.
5. Do not let transient worktree state distort the long-term extraction order.

## Revised Execution Order

1. Finish breaking up [`src/types/index.ts`](/Users/tj/IT/nostr/nodex/src/types/index.ts)
2. Extract shared composer/listing/data-transfer helpers from `TaskComposer` and `UnifiedBottomBar`
3. Split [`use-task-publish-flow.ts`](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-task-publish-flow.ts) by responsibility
4. Decompose [`linkify.tsx`](/Users/tj/IT/nostr/nodex/src/lib/linkify.tsx)
5. Extract sidebar navigation/state logic from [`Sidebar.tsx`](/Users/tj/IT/nostr/nodex/src/components/layout/Sidebar.tsx)
6. Reassess the large view/controller surfaces (`FeedView`, `CalendarView`, `ListView`, `use-task-view-states`)

That order is intentionally architecture-first.

---

## Phase 1: Finish Breaking Up `src/types/index.ts`

### Why this is the best first move

- It has the highest architectural leverage.
- It continues the exact cleanup pattern that already worked well for `Person`.

### Proposed target files

- [`src/types/relay.ts`](/Users/tj/IT/nostr/nodex/src/types/relay.ts)
  - `Relay`
- [`src/types/channel.ts`](/Users/tj/IT/nostr/nodex/src/types/channel.ts)
  - `Channel`
  - `PostedTag`
  - `ChannelMatchMode`
  - legacy `Tag` alias only if still needed
- [`src/types/listing.ts`](/Users/tj/IT/nostr/nodex/src/types/listing.ts)
  - `Nip99ListingStatus`
  - `Nip99Metadata`
- [`src/types/task-dates.ts`](/Users/tj/IT/nostr/nodex/src/types/task-dates.ts)
  - `TaskDateType`
- [`src/types/compose.ts`](/Users/tj/IT/nostr/nodex/src/types/compose.ts)
  - `PublishedAttachment`
  - `ComposeAttachment`
  - `ComposeRestoreState`
  - `ComposeRestoreRequest`
  - `TaskCreateFailureReason`
  - `TaskCreateResult`
  - `OnNewTask`
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
- [`src/types/filters.ts`](/Users/tj/IT/nostr/nodex/src/types/filters.ts)
  - `FilterState`
  - `QuickFilterState`
  - `SavedFilterConfiguration`
  - `SavedFilterState`
  - `SavedFilterController`
  - legacy `TagFilterState` alias only if still needed

### Important boundary

Do not re-export these back through `src/types/index.ts` if the actual goal is to reduce barrel ownership.

### Practical migration order inside the phase

1. extract `relay.ts`, `channel.ts`, `listing.ts`, `task-dates.ts`
2. extract `compose.ts`
3. extract `task.ts`
4. extract `filters.ts`
5. shrink `index.ts` to only what truly still belongs there, or delete it if feasible

### Risks

- `Task` depends on several other moved types, so import cycles must be checked carefully.
- A blind import rewrite will make the diff noisy; prefer domain-by-domain edits.

### Commit shape

- `refactor: split remaining shared type domains out of types barrel`

---

## Phase 2: Extract Shared Composer / Listing / Data-Transfer Helpers

### Why this remains a strong second step

[`TaskComposer.tsx`](/Users/tj/IT/nostr/nodex/src/components/tasks/TaskComposer.tsx) and [`UnifiedBottomBar.tsx`](/Users/tj/IT/nostr/nodex/src/components/mobile/UnifiedBottomBar.tsx) still duplicate or closely mirror helper logic.

### Confirmed overlap or cohesive clusters

- [`normalizeListingTextFromContent`](/Users/tj/IT/nostr/nodex/src/components/tasks/TaskComposer.tsx#L109)
- [`truncateWordSafe`](/Users/tj/IT/nostr/nodex/src/components/tasks/TaskComposer.tsx#L117)
- NIP-99 autofill logic in [`deriveNip99AutofillFromContent`](/Users/tj/IT/nostr/nodex/src/components/tasks/TaskComposer.tsx#L127)
- drag/drop + clipboard transfer helpers:
  - [`extractFilesFromDataTransfer`](/Users/tj/IT/nostr/nodex/src/components/tasks/TaskComposer.tsx#L162)
  - [`hasFilesInDataTransfer`](/Users/tj/IT/nostr/nodex/src/components/tasks/TaskComposer.tsx#L173)
  - [`extractPlainTextFromDataTransfer`](/Users/tj/IT/nostr/nodex/src/components/tasks/TaskComposer.tsx#L181)

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

- `TaskComposer` stays responsible for task-composer UI/orchestration
- `UnifiedBottomBar` stays responsible for mobile-composer UI/orchestration
- shared pure helpers live in one predictable place

### Commit shape

- `refactor: extract shared composer text and transfer helpers`

---

## Phase 3: Split `use-task-publish-flow.ts` By Responsibility

### Why this is still high-value

[`use-task-publish-flow.ts`](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-task-publish-flow.ts) still combines:

- pending publish queue lifecycle
- publish undo behavior
- suppression/cache cleanup
- partial publish notifications
- task/listing publish orchestration

### Proposed split

- [`src/features/feed-page/controllers/use-pending-publish-queue.ts`](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-pending-publish-queue.ts)
  - queue state
  - `clearPendingPublishTask`
  - `handleUndoPendingPublish`
  - timeout/toast cleanup
- [`src/features/feed-page/controllers/use-publish-cache-suppression.ts`](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-publish-cache-suppression.ts)
  - `suppressFailedPublishEvent`
  - related query/cache invalidation
- [`src/features/feed-page/controllers/use-publish-result-feedback.ts`](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-publish-result-feedback.ts)
  - `notifyIfPartialPublish`
  - publish result feedback helpers
- keep [`use-task-publish-flow.ts`](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-task-publish-flow.ts) as the orchestration layer

### Alternative if you want a smaller first cut

Start with one helper file plus one queue hook:

- `task-publish-flow-helpers.ts`
- `use-pending-publish-queue.ts`

### Risks

- callback identity and closure coupling
- undo/pending publish behavior is user-facing and must remain stable

### Commit shape

- `refactor: split pending publish and feedback responsibilities from task publish flow`

---

## Phase 4: Decompose `src/lib/linkify.tsx`

### Why this remains a clean extraction target

[`src/lib/linkify.tsx`](/Users/tj/IT/nostr/nodex/src/lib/linkify.tsx) still mixes distinct concerns:

- mention-person resolution
- fallback mention person creation
- media URL classification
- markdown preprocessing/rendering
- standalone media embedding

### Proposed split

- [`src/lib/linkify/person-mentions.ts`](/Users/tj/IT/nostr/nodex/src/lib/linkify/person-mentions.ts)
  - [`resolveMentionPerson`](/Users/tj/IT/nostr/nodex/src/lib/linkify.tsx#L29)
  - [`buildFallbackMentionPerson`](/Users/tj/IT/nostr/nodex/src/lib/linkify.tsx#L44)
- [`src/lib/linkify/media-embeds.tsx`](/Users/tj/IT/nostr/nodex/src/lib/linkify/media-embeds.tsx)
  - [`getUrlExtension`](/Users/tj/IT/nostr/nodex/src/lib/linkify.tsx#L76)
  - [`getYouTubeEmbedUrl`](/Users/tj/IT/nostr/nodex/src/lib/linkify.tsx#L88)
  - [`getEmbeddableMediaKind`](/Users/tj/IT/nostr/nodex/src/lib/linkify.tsx#L116)
  - [`isEmbeddableUrl`](/Users/tj/IT/nostr/nodex/src/lib/linkify.tsx#L134)
  - [`renderStandaloneEmbed`](/Users/tj/IT/nostr/nodex/src/lib/linkify.tsx#L143)
- [`src/lib/linkify/markdown.tsx`](/Users/tj/IT/nostr/nodex/src/lib/linkify/markdown.tsx)
  - [`preprocessMarkdownTokens`](/Users/tj/IT/nostr/nodex/src/lib/linkify.tsx#L274)
  - [`renderMarkdownBlock`](/Users/tj/IT/nostr/nodex/src/lib/linkify.tsx#L315)

Keep [`src/lib/linkify.tsx`](/Users/tj/IT/nostr/nodex/src/lib/linkify.tsx) as the public composition layer.

### Commit shape

- `refactor: split linkify mention media and markdown helpers`

---

## Phase 5: Extract Sidebar State / Navigation Logic

### Why this should stay after the lower-risk utility work

[`src/components/layout/Sidebar.tsx`](/Users/tj/IT/nostr/nodex/src/components/layout/Sidebar.tsx) mixes:

- render tree
- expanded/collapsed section state
- collapsed preview computation
- keyboard navigation
- focused-item scrolling

That is a good hook extraction, but it touches interactive behavior and should come after the simpler structural wins above.

### Proposed target

- [`src/components/layout/use-sidebar-navigation.ts`](/Users/tj/IT/nostr/nodex/src/components/layout/use-sidebar-navigation.ts)
  - expanded section state
  - focusable item list building
  - focus index handling
  - keyboard handlers
  - scroll-into-view effect

### Commit shape

- `refactor: extract sidebar navigation and focus state hook`

---

## Phase 6: Reassess Large View / Controller Surfaces

### Why this stays later in the sequence

- these are bigger behavior-rich files
- earlier shared-helper extractions may simplify them naturally
- the remaining complexity will be easier to judge after lower-level cleanup

### Reassessment goal

- `FeedView`
- `CalendarView`
- `ListView`
- `use-task-view-states`

for shared status-menu helpers, breadcrumb helpers, empty-state helpers, and view-controller hooks.

---

## Optional Later Phase: `ndk-provider.tsx`

### Why it is not an immediate target

[`src/infrastructure/nostr/provider/ndk-provider.tsx`](/Users/tj/IT/nostr/nodex/src/infrastructure/nostr/provider/ndk-provider.tsx) is still one of the largest files in the repo, but it is also one of the most coupled and risky to split.

### Only attempt after earlier wins

Potential split dimensions:

- relay lifecycle and reconnect behavior
- auth/session actions
- publish/subscription transport wiring
- cache/profile hydration coordination

This should come after the lighter-weight structural extractions above.

---

## Milestone Plan

### Milestone A

Finish splitting the remaining type barrel.

Commit:

- `refactor: split remaining shared type domains out of types barrel`

### Milestone B

Extract shared composer/listing/data-transfer helpers.

Commit:

- `refactor: extract shared composer text and transfer helpers`

### Milestone C

Split pending publish queue/cache feedback from `use-task-publish-flow.ts`.

Commit:

- `refactor: split pending publish and feedback from task publish flow`

### Milestone D

Split `linkify.tsx` into mention/media/markdown helpers.

Commit:

- `refactor: split linkify mention media and markdown helpers`

### Milestone E

Extract sidebar navigation/state hook.

Commit:

- `refactor: extract sidebar navigation state hook`

### Milestone F

Reassess and then split the large view/controller surfaces where the remaining complexity is still intrinsic.

---

## Verification

Treat each milestone as a broad refactor:

- before implementation:
  - `git pull --rebase --autostash`
- after each milestone:
  - `npm run lint`
  - focused tests for the touched area when useful
  - `npx vitest run`
  - `npm run build`

---

## Recommended Next Step

If implementation starts immediately, do Milestone A now.

It is still the highest-value structural win and the cleanest foundation for the later helper and controller extractions.
