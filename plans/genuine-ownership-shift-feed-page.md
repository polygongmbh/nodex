# Plan: Genuine Ownership Shift for Feed Page Orchestration

## Problem Statement

`useIndexFeedInteractionBus` and `useFeedPageShellConfig` look like ownership shifts but aren't.
They are packaging delegates: Index.tsx still calls every domain hook, collects every output, and
manually routes it into these two hooks. The two hooks just restructure what Index.tsx already owns.
No decision-making or state creation moved. Line count in Index.tsx dropped; actual responsibility
didn't.

This plan describes what genuine ownership shift looks like and how to get there.

---

## Why These Hooks Fail to Shift Ownership

### `useIndexFeedInteractionBus`

Receives ~30 handler functions as props. Each handler was produced by a domain hook already called
in Index.tsx. The bus hook maps intent strings to those handlers. It holds no state, makes no
decisions, and cannot work without first having all handlers manufactured elsewhere.

The symptom: if you add a new interaction, you must add a handler in a domain hook, thread it
through Index.tsx, add it to the bus options interface, and add it to the handler map. Four sites
for one feature, two of which (Index.tsx threading and interface param) carry no information.

### `useFeedPageShellConfig`

Receives ~23 state values as props and groups them into four display-facing objects. It holds no
state and transforms nothing meaningful — it renames/repackages. Shell components could read this
data directly if it were in context.

The symptom: changing which state a shell component displays requires adding a param to the 23-prop
interface, plumbing it through Index.tsx, and reading it from the returned object. Three sites
where one (context read in shell component) would do.

---

## What Genuine Ownership Looks Like

**For the bus**: the bus hook calls domain hooks itself, not receives their outputs as props.
Adding a new interaction means touching the domain hook and the bus handler map — not Index.tsx.

**For shell config**: shell components read domain state from contexts they already have access to,
not from a prop object assembled in Index.tsx. Adding a state dependency in a shell component means
calling a context hook — not threading through Index.tsx.

---

## The Mechanism: Domain Hook Context Providers

Domain hooks currently produce state + handlers. Index.tsx collects both:
- routes handlers → bus (via `useIndexFeedInteractionBus`)
- routes state → contexts (via `FeedPageProviders`) and shell props (via `useFeedPageShellConfig`)

The inversion: each domain hook becomes a context provider. The bus reads handlers from those
contexts. Shell components read display state from those contexts. Index.tsx stops being the
routing hub.

```
Before:
  Index.tsx calls useRelaySelectionController()
    → threads handleRelayToggle into useIndexFeedInteractionBus (bus reads it as a prop)
    → threads activeRelayIds into useFeedPageShellConfig (shell reads it as a prop)

After:
  RelaySelectionProvider calls useRelaySelectionController() and provides it via context
    → bus reads handleRelayToggle from useRelaySelection()
    → shell component reads activeRelayIds from useRelaySelection()
  Index.tsx is no longer in this path
```

---

## Dependency Graph Reality

Domain hooks are not independent. `useTaskPublishFlow` needs `allTasks`; `useIndexFilters` needs
`relays`; `usePinnedSidebarChannels` needs `channelFilterStates`. The provider nesting must
preserve this dependency order. This is manageable but it means the providers stack.

**Dependency order** (outer → inner):
1. NDK (external): `relays`, `publishEvent`, `subscribe`, `user`
2. Event cache: `nostrEvents`
3. Derived data: `allTasks`, `channels`, `people` — from `useIndexDerivedData`
4. Relay selection: `activeRelayIds`, relay handlers — from `useRelaySelectionController`
5. Filters: `channelFilterStates`, filter handlers — from `useIndexFilters`
6. Pinned sidebar: `channelsWithState`, `pinnedChannelIds`, pin handlers
7. Task publish: `handleNewTask`, `failedPublishDrafts`, publish handlers
8. Task status: `handleToggleComplete`, status handlers
9. Navigation: `currentView`, `focusedTaskId`, nav handlers
10. Bus: constructed from above contexts

Layers 2–10 can move into `FeedPageProviders` (renamed `FeedPageRoot` or kept as-is). Layer 1
stays in Index.tsx / NDKProvider as today.

---

## Concrete Plan

### Phase 1: Add `FeedViewStateContext` — eliminates `useFeedPageShellConfig`

This is lowest risk and highest immediate value because it unlocks shell component self-sufficiency.

**New context** `src/features/feed-page/views/feed-view-state-context.tsx`:
```
{
  currentView, setCurrentView,
  focusedTaskId,
  isManageRouteActive, setManageRouteActive,
  kanbanDepthMode, setKanbanDepthMode,
  isSidebarFocused,
  isOnboardingOpen,
  activeOnboardingStepId,
}
```

This consolidates what `useFeedNavigation` and a few Index.tsx locals produce that isn't yet in any
context.

**Shell component changes**:
- `FeedPageDesktopShell`: calls `useFeedViewState()` and `useFeedSurface()` directly instead of
  accepting `desktopHeader` and `desktopContent` prop objects
- `FeedPageMobileShell`: calls `useFeedViewState()` and `useFeedTaskViewModel()` directly instead
  of accepting `mobileController` prop object
- `FeedPageViewPane` / `DesktopSearchDock`: read `currentView` / `kanbanDepthMode` from context
  instead of receiving them as props

**Result**: `useFeedPageShellConfig` is deleted. Index.tsx loses its 23-prop call and the
`mobileController` / `desktopHeader` / `desktopContent` / `desktopSidebarController` locals.
The shell components become genuine owners of their own display configuration.

`FeedSidebarControllerContext` already exists — it should be always-mounted (not desktop-only) so
mobile shell can also read sidebar state for collapsed previews without special-casing.

---

### Phase 2: Move Domain Hook Orchestration into `FeedPageProviders`

Currently `FeedPageProviders` is a thin JSX wrapper over pre-constructed values.
It should become the orchestrator for the domain hooks.

**Approach**: replace the prop-accepting context wrappers with hook calls inside the component.

`FeedPageProviders` calls `useNDK()` itself (it's a React component, this is fine). It calls:
- `useNostrEventCache(...)`
- `useIndexDerivedData(...)`
- `useRelaySelectionController(...)` → provides `RelaySelectionContext`
- `useIndexFilters(...)` → provides `FiltersContext` (or expands `FeedSurfaceContext`)
- `usePinnedSidebarChannels(...)` → provides into `FeedSidebarControllerContext`
- `useTaskPublishFlow(...)` → provides `TaskPublishContext`
- `useTaskStatusController(...)` → provides `TaskStatusContext`
- `useFeedNavigation(...)` → provides `FeedViewStateContext`
- `useFeedInteractionFrecency(...)` → effects available to bus

The bus is then created inside `FeedPageProviders` with no props — it reads handlers from the
above contexts.

`Index.tsx` slim-down result:
- Calls only NDK-boundary hooks (`useNDK`, `useAuthModalRoute`, `useIsMobile`)
- Owns demo feed toggle state (it's truly route-level)
- Renders onboarding overlays (these are modal overlays outside the provider tree)
- Selects mobile vs desktop shell
- Mounts `<FeedPageProviders demoConfig={...}>`

---

### Phase 3: Dissolve `useIndexFeedInteractionBus`

Once domain contexts exist (Phase 2), the bus hook no longer needs props:

```ts
// Before
export function useIndexFeedInteractionBus(options: { handleRelayToggle, handleNewTask, ... })

// After
export function useFeedInteractionBus() {
  const { handleRelayToggle } = useRelaySelection();
  const { handleNewTask } = useTaskPublish();
  // ...
  return createFeedInteractionBus({ handlers, effects });
}
```

The 30-prop interface and its corresponding 30 lines in Index.tsx are deleted.

`useIndexFeedInteractionBus` is renamed `useFeedInteractionBus` — it's no longer Index-specific.

---

## Phasing and Risk

| Phase | Lines removed from Index.tsx | Risk | Blocking? |
|-------|------------------------------|------|-----------|
| 1: FeedViewStateContext + shell self-read | ~80 | Low — additive | No |
| 2: Hoist domain hooks into FeedPageProviders | ~200 | Medium — hook deps reordered | No |
| 3: Bus reads contexts | ~40 | Low once Phase 2 done | Needs Phase 2 |

Each phase leaves the build green. Phase 1 and Phase 2 are independent.

---

## What This Plan Does NOT Do

- Does not create a mega `useFeedPageController` that just recombines everything in one hook
- Does not invent new domain abstractions — it only moves existing ones into context providers
- Does not change what any domain hook computes or what state it owns
- Does not touch child components below the shell level

---

## Success Criteria

- `useFeedPageShellConfig` file is deleted
- `useIndexFeedInteractionBus` is renamed and its options interface is empty or close to it
- `Index.tsx` < 300 lines, consists mostly of NDK wiring, auth modal, onboarding overlays,
  demo config, and mobile/desktop branch
- Adding a new interaction type requires changes in one domain hook + bus handler map, not Index.tsx
- Adding a state dependency to a shell component requires reading a context hook, not Index.tsx

---

## Relation to Existing Plan

This plan addresses `split-index-page-remaining.md` Milestone 3 ("Collapse View-State Assembly").
That plan's guardrail said "do not create one giant prop-builder if that only hides the complexity".
`useIndexFeedInteractionBus` and `useFeedPageShellConfig` violated that guardrail.
This plan corrects it.

Milestones 1 and 2 in the existing plan are complete. This plan replaces Milestone 3 and Milestone 4
with the context-inversion approach described above.
