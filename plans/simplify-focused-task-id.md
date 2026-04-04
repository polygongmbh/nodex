## Goal

Make `focusedTaskId` a single canonical app-level concept instead of a value that shifts between
`string`,
`null`,
and `undefined`
depending on which layer is holding it.

The intended steady state is:

- route parsing normalizes once
- controller/view-model state carries `string | null`
- shared helpers and view props consume `string | null`
- only APIs that truly distinguish "omitted" from "empty focus" are allowed to accept `undefined`

## Current Shape

The route layer already behaves like a canonical source:

- [use-feed-navigation.ts](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-feed-navigation.ts) derives `const focusedTaskId = urlTaskId || null`

But that invariant is widened again in shared types and component props:

- [index.ts](/Users/tj/IT/nostr/nodex/src/types/index.ts) exposes `focusedTaskId?: string | null` on `SharedTaskViewContext`
- view components like [FeedView.tsx](/Users/tj/IT/nostr/nodex/src/components/tasks/FeedView.tsx), [TaskTree.tsx](/Users/tj/IT/nostr/nodex/src/components/tasks/TaskTree.tsx), [ListView.tsx](/Users/tj/IT/nostr/nodex/src/components/tasks/ListView.tsx), [KanbanView.tsx](/Users/tj/IT/nostr/nodex/src/components/tasks/KanbanView.tsx), and [CalendarView.tsx](/Users/tj/IT/nostr/nodex/src/components/tasks/CalendarView.tsx) accept `focusedTaskId?: string | null`
- those views immediately normalize again with `focusedTaskId ?? null`
- helper/controller inputs repeat the same optional typing in places like [task-view-filtering.ts](/Users/tj/IT/nostr/nodex/src/domain/content/task-view-filtering.ts), [depth-mode-filter.ts](/Users/tj/IT/nostr/nodex/src/domain/content/depth-mode-filter.ts), [use-empty-scope-model.ts](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-empty-scope-model.ts), and [use-task-view-filtering.ts](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-task-view-filtering.ts)
- compose call sites then convert back the other way with `focusedTaskId || undefined` for `parentId`

That creates three kinds of noise:

1. Repeated normalization.
2. Wider-than-real types that force defensive branching.
3. Blurred ownership of where focus is supposed to be canonicalized.

## Opinionated Simplification

Treat `focusedTaskId` as nullable state, not optional state.

Concretely:

1. Introduce a small shared alias such as `type FocusedTaskId = string | null`.
2. Make all internal app state, context, and view props use that alias without `?`.
3. Normalize only at ingress boundaries:
   - router params
   - legacy provider defaults
   - any external persistence/hydration inputs if they can be missing
4. Keep `parentId` conversion localized at compose submission boundaries, because that field has a different semantic contract than focus state.

This is better than trying to preserve optionality everywhere because the application logic does not appear to use a meaningful distinction between:

- "focus missing"
- "focus explicitly cleared"

Internally, both already behave as `null`.

## Proposed Refactor Steps

### 1. Establish the invariant in shared types

Change shared contracts first so the rest of the app compiles toward one shape:

- add `FocusedTaskId` in [index.ts](/Users/tj/IT/nostr/nodex/src/types/index.ts) or a nearby focused type module
- update `SharedTaskViewContext.focusedTaskId` from optional to required nullable
- update `FeedTaskViewModel` defaults in [feed-task-view-model-context.tsx](/Users/tj/IT/nostr/nodex/src/features/feed-page/views/feed-task-view-model-context.tsx) so the default model explicitly includes `focusedTaskId: null`

Expected effect:

- providers stop leaking `undefined`
- downstream props can become stricter without extra migration glue

### 2. Tighten controller and domain helper signatures

Update helper inputs that are internal-only and already semantically nullable:

- [task-view-filtering.ts](/Users/tj/IT/nostr/nodex/src/domain/content/task-view-filtering.ts)
- [depth-mode-filter.ts](/Users/tj/IT/nostr/nodex/src/domain/content/depth-mode-filter.ts)
- [use-empty-scope-model.ts](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-empty-scope-model.ts)
- [use-task-view-filtering.ts](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-task-view-filtering.ts)
- any selector/controller helpers in [use-task-view-states.ts](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-task-view-states.ts)

Rules for this step:

- prefer `focusedTaskId: FocusedTaskId` over `focusedTaskId?: ...`
- remove internal defaults like `focusedTaskId = null` when the caller can provide the canonical value directly
- preserve optionality only where a helper is intentionally public and omission has a separate meaning

### 3. Tighten component props and remove redundant normalization

Update task view components and shared UI pieces to require the canonical nullable value:

- [FeedView.tsx](/Users/tj/IT/nostr/nodex/src/components/tasks/FeedView.tsx)
- [TaskTree.tsx](/Users/tj/IT/nostr/nodex/src/components/tasks/TaskTree.tsx)
- [ListView.tsx](/Users/tj/IT/nostr/nodex/src/components/tasks/ListView.tsx)
- [KanbanView.tsx](/Users/tj/IT/nostr/nodex/src/components/tasks/KanbanView.tsx)
- [CalendarView.tsx](/Users/tj/IT/nostr/nodex/src/components/tasks/CalendarView.tsx)
- [FocusedTaskBreadcrumb.tsx](/Users/tj/IT/nostr/nodex/src/components/tasks/FocusedTaskBreadcrumb.tsx)
- [TaskViewStatusRow.tsx](/Users/tj/IT/nostr/nodex/src/components/tasks/TaskViewStatusRow.tsx)
- mobile wrappers like [MobileLayout.tsx](/Users/tj/IT/nostr/nodex/src/components/mobile/MobileLayout.tsx) and [UnifiedBottomBar.tsx](/Users/tj/IT/nostr/nodex/src/components/mobile/UnifiedBottomBar.tsx)

Expected cleanup:

- remove `focusedTaskId ?? null` before calling hooks/selectors
- reduce `focusedTaskId = null` prop defaults that only compensate for widened typing
- make memo/effect dependencies compare a single normalized shape

### 4. Isolate nullable-to-optional conversion at compose boundaries

Do not try to force every consumer to use nullable focus if the target API expects omission.

Keep this pattern only where semantics differ:

- `parentId={focusedTaskId ?? undefined}`

Centralize that conversion where practical:

- either inline only at `TaskCreateComposer` / `SharedViewComposer` boundaries
- or add a tiny helper like `toParentTaskId(focusedTaskId)`

This keeps the focus model clean without pretending `parentId` has the same contract.

### 5. Backfill and trim tests around the invariant

Target the places that currently prove focus derivation and scoped filtering:

- [use-feed-navigation.test.tsx](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-feed-navigation.test.tsx)
- [task-view-filtering.test.ts](/Users/tj/IT/nostr/nodex/src/domain/content/task-view-filtering.test.ts)
- view tests such as [FeedPageViewPane.test.tsx](/Users/tj/IT/nostr/nodex/src/features/feed-page/views/FeedPageViewPane.test.tsx)

Useful assertions to add or preserve:

- route without `taskId` yields `null`, never `undefined`
- provider/default model exposes `null` focus
- scoped filtering and breadcrumb rendering behave the same with the stricter type
- compose still omits `parentId` when there is no focused task

## Suggested Execution Order

1. Tighten shared types and provider defaults.
2. Fix controller/helper signatures.
3. Fix view/component props and remove `?? null`.
4. Run tests and trim any remaining `undefined`-driven branching.
5. Optionally do a small follow-up refactor that extracts `FocusedTaskId` conversions if any remain noisy.

## Risks

- [use-task-view-states.ts](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-task-view-states.ts) already has local unstaged changes, so this file needs careful merge handling if the plan is implemented now.
- Some provider/test helpers may currently rely on omitted `focusedTaskId` properties; tightening the type will surface those quickly.
- `parentId` and `focusedTaskId` should not be over-unified. They are related, but they are not the same domain concept.

## Verification

For the implementation itself, this should be treated as a minor localized logic/type cleanup unless the refactor expands significantly.

Minimum checks:

- focused tests around navigation/filtering/view-model behavior

Recommended:

- `npm run build`

If the change grows into a broad cross-view refactor, promote verification to:

- `npm run lint`
- `npx vitest run`
- `npm run build`
