# Plan: Split `src/pages/Index.tsx`

## Goal

Reduce the size and responsibility load of [`src/pages/Index.tsx`](/Users/tj/IT/nodex/src/pages/Index.tsx) (now ~1,923 lines after several extractions) without changing behavior, by extracting the remaining orchestration hot spots into hooks/modules with clearer dependency boundaries.

## Refactor Principles

1. Extract orchestration, not rendering, first — keep `Index` as the composition root.
2. Prefer domain boundaries over mechanical splits — each hook owns one coherent responsibility.
3. Preserve route contracts — `/:view/:taskId` and `/manage` must stay intact.
4. Extract in small, testable milestones — each independently reviewable and verifiable.

---

## Completed

- `use-feed-navigation.ts` extracted route/view/focus state and relay-scope focus reset.
- `use-index-filters.ts` extracted most relay/channel/people filter orchestration, though `postedTags`, `channelFrecencyState`, and pinned-channel view shaping still remain in `Index`.
- `use-saved-filter-configs.ts` extracted saved filter persistence/apply orchestration.
- `use-index-onboarding.ts` extracted the guide state machine and reset behavior, with NDK/demo bootstrap decisions still injected from `Index`.
- `src/lib/completion-cheer.ts` extracted the DOM completion animation helper.
- `use-task-publish-controls.ts` extracted:
  - auth/disconnected-feed interaction blocking
  - relay URL resolution
  - origin relay resolution
  - primitive publish helpers for state/due/priority
  - shared publish follow-up sequencing
- onboarding overlay rendering was deduplicated across mobile/desktop branches.

These items should be removed from future execution of the plan unless further cleanup is needed inside the extracted hooks.

---

## Remaining Milestone A: Publish + Failed Publish Controller

Treat these as one boundary rather than two separate hooks unless the extracted module becomes too large.

**What moves:**
- `handleNewTask`
- failed publish queue state and persistence
- pending publish undo state
- `clearPendingPublishTask`, `handleUndoPendingPublish`
- `suppressFailedPublishEvent`
- `publishFailedDraft`
- `handleRetryFailedPublish`, `handleRepostFailedPublish`
- `handleDismissFailedPublish`, `handleDismissAllFailedPublish`
- `visibleFailedPublishDrafts`
- `parseStoredDate`
- `handleDueDateChange`, `handlePriorityChange`

**Why combined now:**
- new task publish, retry/repost, and queued undo all share:
  - relay targeting
  - publish result interpretation
  - post-publish follow-ups
  - failure persistence and retry semantics
- splitting these too early would create a noisy dependency graph between `handleNewTask` and the failed-publish queue.

**Suggested interface:**
```ts
// inputs
{ user, relays, allTasks, effectiveActiveRelayIds, people, currentUser,
  demoFeedActive, publishEvent, setLocalTasks, setPostedTags,
  bumpChannelFrecency, setIsAuthModalOpen, queryClient, t,
  guardInteraction, resolveRelayUrlsFromIds, resolveTaskOriginRelay,
  publishTaskStateUpdate, publishTaskDueUpdate, publishTaskPriorityUpdate,
  publishTaskCreateFollowUps }
// outputs
{ handleNewTask, handleDueDateChange, handlePriorityChange,
  failedPublishDrafts, visibleFailedPublishDrafts, pendingPublishTaskIds,
  suppressedNostrEventIds, composeRestoreRequest,
  handleRetryFailedPublish, handleRepostFailedPublish,
  handleDismissFailedPublish, handleDismissAllFailedPublish,
  handleUndoPendingPublish, isPendingPublishTask }
```

**Refactor note:**
- If this extracted controller exceeds reasonable size, split it afterward into:
  - `use-task-publish-flow`
  - `use-failed-publish-queue`
- but only after the shared state machine is first isolated from `Index`.

---

## Remaining Milestone B: Task Status Mutations

**What moves:**
- `sortStatusHoldByTaskId`, `sortModifiedAtHoldByTaskId` state
- `pendingStatusUpdateTimeoutsRef`, `pendingTaskStatusesRef`, `completionConfettiLastAtRef` refs
- `scheduleTaskStatusReorderUpdate`, `clearPendingStatusUpdate`
- `handleToggleComplete`, `handleStatusChange`
- `triggerCompletionFeedback`, `handleToggleCompletionSound`
- `completionSoundEnabled` state
- Cleanup effect for status timeouts

**Keep out of this hook for now:**
- `handleListingStatusChange`

**Why:**
- listing status is effectively a small publish-flow branch, not a generic task-status mutation.
- leaving it with the publish controller avoids mixing task-status UX with NIP-99 listing publishing behavior.

**Interface:**
```ts
// inputs
{ allTasks, currentUser, guardInteraction, publishTaskStateUpdate, t,
  setLocalTasks }
// outputs
{ handleToggleComplete, handleStatusChange,
  sortStatusHoldByTaskId, sortModifiedAtHoldByTaskId,
  completionSoundEnabled, handleToggleCompletionSound }
```

---

## Remaining Milestone C: View-State / Derivation Cleanup

After the remaining controllers are extracted, reduce `Index` to composition and view-state derivation.

**Cleanup also:**
- keep `allTasks`, `filteredTasks`, `channels`, `channelsWithState`, and `sidebarPeople` in one narrow memo section
- consider extracting pinned-channel shaping:
  - `activeRelayIdList`
  - `channelRelayIds`
  - `channelsWithState`
  - `handleChannelPin` / `handleChannelUnpin`
- unify `nostrRelays` memo with `relays` memo or remove the redundant remap
- consolidate `DEMO_RELAY_ID = "demo"` to a single canonical source if other files still re-declare it

**Target:** ~350–450 lines, no `useState` beyond what the hooks return, no inline DOM manipulation.

---

## Coupling Risks

### `suppressedNostrEventIds` threading
Produced by the combined publish/failed-publish controller but consumed in `filteredNostrEvents` in `Index`. Keep event filtering in `Index`, but return the suppression set from the controller.

### `guardInteraction` fanout
Used by status mutations, listing status change, new task, due date, priority, and retry. It now lives in `use-task-publish-controls`, so future controllers should receive it as an input rather than recreating auth/disconnected-feed logic.

### Onboarding depends on M1/M2 setters
Already addressed via `use-index-onboarding`, but keep following the same rule for any remaining callbacks injected into that hook.

### `ensureGuideDataAvailable` crosses four state domains
Still a smell: it touches guide state, local tasks, relay filter, and profile cache. Keep it injected into onboarding rather than moving the NDK/demo bootstrap details into the hook unless more cleanup is needed.

### `allTasks` sort-hold overlay
Still unresolved. `sortStatusHoldByTaskId` / `sortModifiedAtHoldByTaskId` should be produced by the status hook and applied in the `allTasks` merge memo. Keep the merge memo in `Index`, but plan for a `mergedTasks` + overlay application split if the dependency graph demands it.

### `demoFeedActive`
Still valid. Keep deriving `demoFeedActive` once in `Index` and pass it to downstream hooks.

---

## Additional Smells / Follow-Up Refactors

- `handleListingStatusChange` is adjacent to publish logic, not task-status UX. Keep it with the future publish controller or extract it into a tiny listing-publish helper rather than pushing it into a generic status hook.
- `ensureGuideDataAvailable` still embeds demo bootstrap and navigation side effects; if it grows further, extract a small `bootstrapGuideDemoData` helper rather than bloating onboarding again.
- `channelsWithState` now does three jobs:
  - apply filter state
  - apply pinned-channel stubs
  - sort pinned channels by active relay scope
  This is a likely future extraction candidate if `Index` remains large after the publish/status work.
- `nostrRelays` is still a separate remap from `relays`; that may be acceptable, but it is a good candidate for a narrower sidebar/relay diagnostics adapter if more relay-specific UI logic accumulates.
- `allTasks` still mixes merge, dedupe, and optimistic-sort overlay concerns in one memo. If the status hook extraction gets stuck on dependencies again, split this into:
  - `mergedTasks`
  - `decorateTasksWithStatusOverlays`
  - final sort
- `resolveMentionPubkeys` and the author fallback logic inside `handleNewTask` are still tucked into `Index`; if the combined publish/failed-publish controller becomes too large, extract a small publish-input normalization helper rather than more ad hoc callbacks.

- `nostrRelays` memo: trivial remap near-duplicating the `relays` memo; unify or drop
- `DEMO_RELAY_ID = "demo"` re-declared in two places; consolidate
- Duplicate async chains after task publish (immediate vs delayed path): extract shared `publishPostCreateFollowUps` helper
- `triggerCompletionCheer`: 60-line DOM particle function inside a React component; move to `src/lib/completion-cheer.ts`
- `<OnboardingGuide>` + `<OnboardingIntroPopover>` rendered twice with identical props in mobile and desktop branches; render once outside the conditional
- `buildPendingPublishDedupKey`: module-level pure function; move to `src/lib/nostr/task-dedup.ts` or inline into `use-failed-publish-queue.ts`

---

## Testing Strategy

For each milestone:
1. Add focused unit tests for the new hook where business logic moves.
2. Keep or add one integration-level test around `Index` behavior for the moved contract.
3. Run the verification matrix after each milestone: `npm run lint` → `npx vitest run` → `npm run build`.

High-priority regression coverage:
- Route/view/task focus behavior (M1)
- Relay/channel/people filter behavior (M2)
- Saved filter apply/reset behavior (M3)
- Onboarding-driven filter resets and navigation (M4)
- Task publish / retry / undo flows (M5b/M5c)

---

## Execution Notes

- Do not attempt this as one large refactor.
- Land each milestone before starting the next.
- Keep public child-component props stable during early milestones to limit blast radius.
- Amend fixup commits; use new commits for each milestone.
