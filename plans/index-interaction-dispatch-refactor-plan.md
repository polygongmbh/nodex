# Grand Plan: Eliminate Handler Prop-Drilling by Dispatching at Interaction Sites

## Goal
Refactor `Index.tsx` and the feed/mobile component tree so state flows down and interaction intents flow up via `dispatchFeedInteraction`, with no unnecessary interaction handler props passed through intermediate components.

## Non-Goals
- Rewriting domain/controller hooks (`useIndexFilters`, `useTaskPublishFlow`, etc.) in this pass.
- Changing product behavior, copy, UX sequencing, or keyboard semantics.
- Making globally reusable primitives hard-coupled to feed interactions without an adapter strategy.

## Architecture Rule (Target)
1. `Index.tsx` owns state assembly and intent handler registration only.
2. Components read state from props/context and dispatch intents where user interaction occurs.
3. No handler prop-drilling across layers in feed/mobile shells.
4. Handler props are allowed only at immediate adapter boundaries to third-party/generic controls, never forwarded across multiple layers.

## Current Findings (High-Impact Handler Plumbing)
1. `Index.tsx` still builds callback-heavy objects:
   - `mobileActions`
   - `desktopHeader`
   - `desktopContent` (retry/repost/dismiss/search/depth handlers)
   - `feedTaskViewModel` callback surface (toggle/status/due/priority/new task/etc.)
2. Mobile path (`FeedPageMobileShell -> MobileLayout -> MobileFilters/UnifiedBottomBar`) still uses callback-heavy action contracts.
3. Task views (`TaskTree`, `FeedView`, `ListView`, `KanbanView`, `CalendarView`) still accept many interaction callbacks and only partially fallback to interaction model hooks.
4. Reusable controls (`ViewSwitcher`, `DesktopSearchDock`, `FailedPublishQueueBanner`, etc.) remain callback-driven and are used as pass-through endpoints.

## Target Interaction Taxonomy
Expand `FeedInteractionIntent` so every interactive callback currently passed from `Index` has an intent equivalent.

### UI / Navigation
- `ui.view.change`
- `ui.search.change`
- `ui.kanbanDepth.change`
- `ui.manageRoute.change`
- `ui.openAuthModal`
- `ui.openGuide`
- `ui.openShortcutsHelp`
- `ui.focusSidebar`
- `ui.focusTasks`

### Sidebar / Filters
- Existing `sidebar.*` and `filter.*` intents retained and reused by desktop + mobile.

### Task Commands
- `task.toggleComplete`
- `task.changeStatus`
- `task.updateDueDate`
- `task.updatePriority`
- `task.listingStatus.change`
- `task.focus.change`
- `task.undoPendingPublish`

### Publish Queue
- `publish.failed.retry`
- `publish.failed.repost`
- `publish.failed.dismiss`
- `publish.failed.dismissAll`

### Composer/Creation (decision point)
- Prefer intents for open/close/focus/filter-affecting interactions.
- For request/response operations that require `TaskCreateResult`, keep command callback until bus supports typed response payloads (or add response-capable interaction command layer).

## Execution Plan

## Phase 1: Intent Surface Completion
1. Add missing intents (UI view/search/depth/manage route, publish queue, task metadata/focus/listing).
2. Wire all new intents in `Index.tsx` `feedInteractionHandlers`.
3. Add/extend interaction pipeline tests for all new intent types.

Deliverable: no missing intent for any existing feed/mobile callback path.

## Phase 2: De-plumb Desktop Shell Contracts
1. Replace callback fields in desktop config (`FeedPageDesktopHeaderConfig`, `FeedPageDesktopContentConfig`) with state-only fields.
2. Introduce feed adapters (or local dispatch usage) for:
   - `ViewSwitcher`
   - `NostrUserMenu` sign-in action
   - `DesktopSearchDock`
   - `FailedPublishQueueBanner`
3. Remove `handleDispatch*` wrappers in `Index` that exist only to pass callbacks down.

Deliverable: desktop shell receives state/config only; interactions dispatch from leaf controls.

## Phase 3: De-plumb Mobile Action Contracts
1. Remove `MobileLayoutActions` handler object pattern.
2. Refactor `MobileLayout`, `MobileFilters`, `MobileNav`, `UnifiedBottomBar` to dispatch intents directly at event points.
3. Keep mobile state payloads (relays/channels/people/current view, etc.) as state-only.

Deliverable: no `mobileActions` callback object created in `Index`.

## Phase 4: Convert Feed Task View Model to State-First
1. Split `FeedTaskViewModel` into:
   - state slice (tasks, filters, focused task, pending flags, restore requests, etc.)
   - optional command slice only where unavoidable (`onNewTask` initially).
2. Remove interaction callbacks from context where intent dispatch can be used directly:
   - toggle/status/due/priority/listing/focus/undo/retry/repost/dismiss.
3. Update `FeedPageViewPane` and all view components to consume state and dispatch intents at interaction points.

Deliverable: task views no longer receive interaction handlers from `Index`.

## Phase 5: Leaf Dispatch Completion in Task Components
1. Push dispatch to the true event origin in:
   - `TaskItem`
   - `TaskMetadataEditors`
   - `FocusedTaskBreadcrumb`
   - `TaskTagChipRow` / mention chips
   - `FailedPublishQueueBanner`
2. Remove pass-through callback props from intermediate components (`TaskTree`, `FeedView`, `ListView`, `KanbanView`, `CalendarView`, `SharedViewComposer`) unless command-response is required.

Deliverable: intermediate view components are state composition + rendering only.

## Phase 6: Generic Boundary Strategy
1. For generic reusable components used outside feed scope:
   - keep callback APIs if necessary
   - add feed-specific adapters near usage sites (not in `Index`)
2. Explicitly document allowed callback exceptions:
   - command-response APIs (e.g., submit returning `TaskCreateResult`)
   - external library adapters requiring callback signatures.

Deliverable: no cross-layer callback propagation; only local adapter callbacks.

## Phase 7: Guardrails and Verification
1. Add a static audit command to CI or review checklist:
   - detect `onX` prop interfaces in feed/mobile subtree.
   - whitelist explicit exception files.
2. Add integration tests proving dispatch path for:
   - view switching
   - mobile manage/filter actions
   - task status + metadata updates
   - failed publish queue actions
3. Run required matrix for each milestone:
   - `npm run lint`
   - `npx vitest run`
   - `npm run build`

Deliverable: enforceable rule that prevents handler prop-drilling regressions.

## Milestone Slicing (Recommended Commits)
1. `refactor: expand feed interaction intents for view/mobile/task commands`
2. `refactor: remove desktop shell callback plumbing`
3. `refactor: remove mobile action callback plumbing`
4. `refactor: convert feed task view model to state-first contract`
5. `refactor: push task view interactions to leaf dispatch sites`
6. `test: add interaction dispatch coverage and prop-drilling guard checks`

## Risks and Mitigations
1. High-frequency dispatch (`search` typing) may increase render churn.
   - Mitigation: debounce/transition at handler level, keep state updates minimal.
2. Async command flows needing return values (`TaskCreateResult`) are not pure intent fire-and-forget.
   - Mitigation: keep command callbacks temporarily or add typed command-response extension to bus.
3. Reusable component coupling to feed interaction context.
   - Mitigation: prefer feed-specific adapter wrappers over hard-coupling shared primitives.

## Definition of Done
1. `Index.tsx` no longer constructs `mobileActions`, callback-heavy header/content configs, or task interaction callback bundles for downstream components.
2. Feed/mobile shells and views receive state-only payloads (plus documented command exceptions).
3. User interactions dispatch intents at the leaf where the event occurs.
4. Lint/tests/build green and dispatch-path tests cover major flows.
