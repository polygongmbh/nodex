# Move Feed Interaction Commands Out Of Index

## Goal

Keep `useFeedInteractionDispatch()` as the UI-facing boundary,
but stop assembling feature command handlers inside `src/pages/Index.tsx`.
`Index` should provide state and high-level dependencies,
while feature-owned providers/hooks expose the actual commands.

## Opinionated Direction

Do not keep `useIndexFeedInteractionBus()` as a central intent-to-handler registry.
Instead:

1. keep the dispatch model for components
2. move command ownership into feature/controller providers
3. let the interaction bus resolve intents from feature command contexts
4. reduce `Index.tsx` to composing providers and derived state

This preserves the useful part of the architecture,
which is intent dispatch from leaf components,
without preserving the useless part,
which is rewrapping `Index` closures in a giant map.

## Current Problems

- `src/pages/Index.tsx` owns sidebar pin/unpin commands that are conceptually sidebar-controller behavior.
- `src/features/feed-page/controllers/use-index-feed-interaction-bus.ts` is mostly a routing table from intent strings to handlers already constructed in `Index`.
- Existing controller contexts such as `feed-sidebar-controller-context.tsx` only carry state, not commands.
- The middleware skeleton is currently a no-op, so the bus hook is not paying for its indirection.

## Target Architecture

### 1. Split state contexts from command contexts

Introduce command providers alongside existing state providers instead of inflating the current state-only contexts.

Suggested command surfaces:

- `FeedSidebarCommandsContext`
  - `pinChannel(channelId)`
  - `unpinChannel(channelId)`
  - `toggleChannel(channelId)`
  - `showOnlyChannel(channelId)`
  - `toggleAllChannels()`
  - `pinPerson(personId)`
  - `unpinPerson(personId)`
  - `togglePerson(personId)`
  - `showOnlyPerson(personId)`
  - `toggleAllPeople()`
  - relay actions that are clearly sidebar-owned
- `FeedViewCommandsContext`
  - `focusSidebar()`
  - `focusTasks()`
  - `setCurrentView(view)`
  - `setSearchQuery(query)`
  - `setKanbanDepth(mode)`
  - `setManageRouteActive(isActive)`
- `FeedTaskCommandsContext`
  - `focusTask(taskId)`
  - `createTask(...)`
  - `toggleComplete(taskId)`
  - `changeStatus(taskId, status)`
  - `updateDueDate(...)`
  - `updatePriority(...)`
  - failed publish actions

Keep these narrow and feature-owned.
Do not create a single giant `FeedCommandsContext`.

### 2. Move command creation into focused controller hooks

Create dedicated controller hooks that live near the current state derivation hooks.

Suggested hooks:

- `useFeedSidebarCommands(...)`
- `useFeedViewCommands(...)`
- `useFeedTaskCommands(...)`

These hooks may still depend on `Index` state setters or publish helpers at first,
but the command objects they produce should be feature-shaped and memoized before entering provider boundaries.

This is the key step:
`Index` can still compose dependencies temporarily,
but it should stop exporting raw business-action closures one by one to a bus registry.

### 3. Replace `useIndexFeedInteractionBus()` with a provider-local resolver

After command contexts exist,
replace the current `useIndexFeedInteractionBus()` with one of these:

- `useFeedInteractionBus()` inside `FeedPageProviders`
- or a plain `createFeedInteractionBus(...)` call colocated with the interaction provider

That bus should read command contexts or receive grouped command objects,
not 30+ raw handlers from `Index`.

The mapping layer then becomes acceptable because it binds intents to feature APIs,
not to page-local closures.

### 4. Migrate incrementally by feature slice

Do not rewrite the whole interaction surface in one pass.
Migrate in this order:

1. sidebar pin/unpin
2. sidebar toggle/exclusive/all actions
3. view/UI actions
4. task mutation actions
5. saved filter actions

Sidebar pinning is the best first slice because:

- the leaf components already dispatch intents
- ownership is obvious
- the current smell is concentrated there
- tests already exist around those interactions

### 5. Keep the dispatch API stable during migration

Do not change leaf components such as:

- `src/components/layout/sidebar/ChannelItem.tsx`
- `src/components/layout/sidebar/PersonItem.tsx`
- other consumers of `useFeedInteractionDispatch()`

Those components are already on the right side of the boundary.
Only the command resolution side should move.

## Concrete Implementation Steps

### Phase 1: Sidebar command extraction

1. Add `FeedSidebarCommandsContext` with a strict typed interface and a small `useFeedSidebarCommands()` hook.
2. Create `useFeedSidebarCommandsController(...)` that composes:
   - existing filter handlers
   - relay sidebar handlers
   - `usePinnedSidebarChannels()`
   - `usePinnedSidebarPeople()`
3. In `Index.tsx`, replace individual sidebar handler variables passed into the bus with a single `sidebarCommands` object passed into a provider.
4. Update bus resolution for:
   - `sidebar.channel.pin`
   - `sidebar.channel.unpin`
   - `sidebar.person.pin`
   - `sidebar.person.unpin`
5. Verify `ChannelItem` and `PersonItem` tests still pass unchanged.

Exit criterion:
`Index.tsx` no longer passes `handleChannelPin`, `handleChannelUnpin`, `handlePersonPin`, or `handlePersonUnpin` into the interaction bus.

### Phase 2: Sidebar action consolidation

1. Move channel/person toggle and exclusive actions into the same sidebar command surface.
2. Move relay sidebar actions there as well if they are not shared elsewhere.
3. Shrink `filterHandlers` or split it so sidebar-owned behavior stops leaking through generic handler maps.

Exit criterion:
most sidebar intents resolve through `FeedSidebarCommandsContext`.

### Phase 3: View/task command extraction

1. Add `FeedViewCommandsContext` for view focus/navigation/search commands.
2. Add `FeedTaskCommandsContext` for task mutations and failed-publish actions.
3. Convert `useTaskViewServices()` and similar helpers to use command contexts directly where that improves clarity.

Exit criterion:
`Index` provides grouped command providers instead of a broad handler map.

### Phase 4: Bus simplification

1. Delete `use-index-feed-interaction-bus.ts` once feature command contexts are in place.
2. Replace it with a smaller bus factory colocated with `FeedInteractionProvider`, or inline the resolver in `FeedPageProviders`.
3. Keep pipeline/effect support only if there are real middleware/effect use cases.
4. If middleware remains a placeholder, remove the skeleton and keep only effect hooks that are actually used.

Exit criterion:
the interaction layer is either:

- a small provider-local resolver over feature command contexts, or
- removed entirely where direct command hooks are clearer

## File-Level Change Sketch

Likely new files:

- `src/features/feed-page/controllers/feed-sidebar-commands-context.tsx`
- `src/features/feed-page/controllers/use-feed-sidebar-commands-controller.ts`
- `src/features/feed-page/controllers/feed-view-commands-context.tsx`
- `src/features/feed-page/controllers/feed-task-commands-context.tsx`

Likely changed files:

- `src/pages/Index.tsx`
- `src/features/feed-page/views/FeedPageProviders.tsx`
- `src/features/feed-page/controllers/use-index-feed-interaction-bus.ts` or its replacement
- `src/components/tasks/use-task-view-services.ts`

## Risks

- Over-centralizing commands into one huge context would recreate the same problem under a new name.
- Moving too many actions at once will blur ownership and make regressions harder to isolate.
- If the bus starts consuming contexts directly, provider ordering must stay explicit and tested.

## Testing Strategy

For the first migration slice, run focused tests first:

- `src/components/layout/sidebar/ChannelItem.test.tsx`
- `src/components/layout/sidebar/PersonItem.test.tsx`
- tests for `use-pinned-sidebar-channels`
- tests for `use-pinned-sidebar-people`

After broader command extraction, follow the major-change matrix:

- `npm run lint`
- `npx vitest run`
- `npm run build`

## Definition Of Done

- `Index.tsx` no longer wires individual sidebar/task/view handlers into a giant interaction-bus hook.
- feature-owned commands are exposed through typed controller contexts
- dispatching from leaf components remains unchanged
- the interaction bus, if retained, binds intents to feature command surfaces rather than page-local closures
- `Index.tsx` gets materially smaller and more compositional
