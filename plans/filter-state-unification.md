# Plan: Filter State Unification

## Goal

Make `useFilterStore` (`src/features/feed-page/stores/filter-store.ts`) the canonical home for every filter dimension nodex's task views consume, and stop new filter dimensions from accreting in scattered `useState` / controller-local hooks.

The end state:

- one store owns `activeRelayIds`, `channelFilterStates`, `channelMatchMode`, `searchQuery`, **plus** the remaining scattered dimensions (people selection, quick filters)
- a single `setFilter(partial)` action exists alongside the per-dimension setters, so a single user action that touches multiple dimensions (e.g. apply a saved preset, clear all filters, exclusive-select a person) is one atomic write rather than several
- consumers read filter state directly from the store via `useFilterStore(selector)` rather than receiving setters as args from a common ancestor
- the page-level orchestrator no longer holds filter `useState` cells just to thread setters into controller hooks (Fault 1 in [`project-analysis-zustand.md`](/Users/tj/IT/nostr/nodex/plans/project-analysis-zustand.md))

## Why This Plan Exists

[`project-analysis-zustand.md`](/Users/tj/IT/nostr/nodex/plans/project-analysis-zustand.md) already diagnosed the structural fault: shared mutable state lives in `Index.tsx` because every reader and writer needs a common ancestor. Its remedy explicitly names a `filterStore` holding `channelFilterStates`, `channelMatchMode`, `quickFilters`, people selection state, and `activeRelayIds`.

[`useFilterStore`](/Users/tj/IT/nostr/nodex/src/features/feed-page/stores/filter-store.ts) exists today and holds three of those five dimensions plus `searchQuery`. **The store landed; the consolidation didn't finish.** People selection state and quick filters still live elsewhere, and per-dimension controllers (`use-channel-filter-controller.ts` at 403 LOC, `use-relay-filter-controller.ts` at 157 LOC) still expose setter-returning APIs that callers thread through arguments.

This plan picks up where `project-analysis-zustand.md` left off, for the filter dimension specifically. It is **complementary** to:

- [`split-index-page-remaining.md`](/Users/tj/IT/nostr/nodex/plans/split-index-page-remaining.md) — Index.tsx shrinks naturally as filter setters stop flowing through it
- [`refactor-mobile-filtering-centralization.md`](/Users/tj/IT/nostr/nodex/plans/refactor-mobile-filtering-centralization.md) — narrower scope (search query + mobile fallback); does not conflict

## What Already Exists

[`src/features/feed-page/stores/filter-store.ts`](/Users/tj/IT/nostr/nodex/src/features/feed-page/stores/filter-store.ts), 145 LOC, Zustand + `persist`:

- state: `activeRelayIds: Set<string>`, `channelFilterStates: Map<string, Channel["filterState"]>`, `channelMatchMode`, `searchQuery`
- per-dimension setters using `SetStateUpdater<T>` (value or updater function)
- persistence via `filterStorage` writing to three distinct `localStorage` keys with zod-validated reads
- a `merge` that rejects malformed persisted entries (consistent with the CLAUDE.md cache policy)

[`src/features/feed-page/stores/saved-filter-store.ts`](/Users/tj/IT/nostr/nodex/src/features/feed-page/stores/saved-filter-store.ts), 68 LOC — preset management; stays separate (different lifecycle).

Per-dimension controllers wrapping the store with derived/command logic:

- [`use-channel-filter-controller.ts`](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-channel-filter-controller.ts) (403 LOC)
- [`use-relay-filter-controller.ts`](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-relay-filter-controller.ts) (157 LOC)
- [`use-task-scope-specific-filters.ts`](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-task-scope-specific-filters.ts) (117 LOC)
- [`use-task-view-filtering.ts`](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-task-view-filtering.ts)
- [`use-filter-url-sync.ts`](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-filter-url-sync.ts) (313 LOC)

## What's Still Scattered

To be inventoried as Step 1 (do not pre-commit to file paths until inspected):

- **People selection state** — currently appears to live across `use-sidebar-people.ts`, `use-pinned-sidebar-people.ts`, possibly a `useState` in `Index.tsx`. Verify.
- **Quick filters** — referenced in CLAUDE.md ("quick filters") and `project-analysis-zustand.md`'s prescribed shape, but no `quick-filters-store.ts` exists. Confirm where the current source of truth is (likely controller-local or page-local).
- **Search query** — present in `useFilterStore` *and* an `effectiveSearchQuery` lives in mobile shell state; [`refactor-mobile-filtering-centralization.md`](/Users/tj/IT/nostr/nodex/plans/refactor-mobile-filtering-centralization.md) is the place that handles this; do not duplicate that work here.
- **Focused task id** — *not* a filter dimension in the sidebar sense but participates in the rendered "context"; see CLAUDE.md "Context" section. Out of scope for this plan; tracked elsewhere ([`simplify-focused-task-id.md`](/Users/tj/IT/nostr/nodex/plans/simplify-focused-task-id.md)).

## Proposed Design

### 1. Extend `useFilterStore` to hold every filter dimension

Add state and per-dimension setters for:

- `peopleFilterStates: Map<string, PeopleFilterState>` (mirroring `channelFilterStates` shape)
- `quickFilters: QuickFilterId[]` (or whatever the existing enum is — discover in Step 1)

Both get `persist` integration with the same "reject malformed entries" merge policy already in use.

### 2. Add a single `setFilter(partial)` action

Alongside the per-dimension setters, expose:

```ts
setFilter: (partial: Partial<FilterStoreSnapshot>) => void;
```

Use cases this enables as atomic single writes (each currently requires 2+ separate set calls):

- "apply preset" — replaces channels + people + relays + match mode in one write
- "clear all" — resets every dimension in one write
- "exclusive select" — sets one entry to `included`, others to `neutral`, in one write
- "URL-sync hydration" — restores the full filter state from the URL on first render

This pattern matches what `refactor-mobile-filtering-centralization.md` is doing for its controller and what `project-analysis-zustand.md` advocates (write outputs straight to the store).

### 3. Migrate scattered consumers, dimension by dimension

For each dimension (channels are already done; do people, then quick filters):

1. Add the dimension to the store
2. Have its controller hook (e.g. `use-people-filter-controller.ts`, create if missing) read from the store directly
3. Replace consumer call sites that take a setter as an argument with consumers that call the store action directly
4. Remove the now-unused `useState` cells in `Index.tsx` and the prop threading that fed them

### 4. Replace setter-returning controller APIs with store-write patterns

Current pattern (from `project-analysis-zustand.md` Fault 3):

```ts
const { commands, derivedState, uiPref } = useTaskStatusController(allTasks, setLocalTasks, ...);
// Index.tsx then unpacks and routes each piece
```

Target pattern:

```ts
const { commands } = useTaskStatusController();
// derivedState and uiPref are written into their respective stores by the hook
// Consumers read directly from those stores
```

For filter-touching controllers (`use-channel-filter-controller.ts`, `use-relay-filter-controller.ts`), the equivalent is: the controller stops returning `setChannelFilterStates` / `setActiveRelayIds` and instead exposes only the derived helpers and the command-style actions (`toggleChannel`, `exclusiveSelectChannel`, etc.) that call `useFilterStore.getState().setFilter(...)` internally.

### 5. URL sync becomes a one-way subscription, not a controller

`use-filter-url-sync.ts` (313 LOC) currently couples reads and writes. After the store owns all dimensions:

- on URL change → call `useFilterStore.getState().setFilter(parsedFromUrl)`
- on store change → subscribe via `useFilterStore.subscribe` and update the URL

This is straightforward to express because both sides terminate at the store.

## Likely Implementation Steps

1. **Inventory pass.** Grep for current people-filter and quick-filter state. Confirm where each lives today and what writes it. **Do not start migrating until this is written down inside this plan** (update the "What's Still Scattered" section with file paths).
2. **Add `peopleFilterStates` to `useFilterStore`** with the same shape and persistence pattern as `channelFilterStates`. Tests in `filter-store.test.ts`.
3. **Migrate people consumers** to the store. Drop the scattered state cells. Commit per natural checkpoint per CLAUDE.md workflow: "store field added", "consumers switched", "old state removed".
4. **Add `quickFilters` to `useFilterStore`.** Tests.
5. **Migrate quick-filter consumers.** Commit per checkpoint.
6. **Add `setFilter(partial)` action** and a paired test covering each multi-dimension use case (preset apply, clear-all, exclusive-select, URL hydration). Migrate the obvious call sites that currently make 2+ sequential setter calls.
7. **Refactor `use-channel-filter-controller.ts`** to stop returning setters; expose only command actions and derived state. The controller is the largest of the filter hooks (403 LOC); this is the highest-leverage cleanup. Same for `use-relay-filter-controller.ts`.
8. **Simplify `use-filter-url-sync.ts`** to the two-direction subscription pattern (§5 above). Should drop substantially below 313 LOC.
9. **Verify Index.tsx shrunk.** The expectation per [`split-index-page-remaining.md`](/Users/tj/IT/nostr/nodex/plans/split-index-page-remaining.md) is that filter setter threading is among the page-owned responsibilities to remove; this work should advance that.

## Testing Plan

Tests added or updated as each step lands (not batched at the end):

- store-level tests in `filter-store.test.ts` for each new dimension: initial state, per-dimension setter, `setFilter(partial)` atomicity, persistence round-trip, malformed-entry rejection on hydration
- controller-level tests proving:
  - channel/people/relay commands write to the store, not to a prop-passed setter
  - exclusive-select, toggle, clear-all behave identically to today (regression coverage)
  - preset apply remains atomic (one render, not N renders)
- URL sync tests proving:
  - inbound URL → store hydration applies the full snapshot in one write
  - store change → URL update reflects every dimension
- mobile filter behavior regression — coordinate with [`refactor-mobile-filtering-centralization.md`](/Users/tj/IT/nostr/nodex/plans/refactor-mobile-filtering-centralization.md) so its tests don't drift

Behavior-level invariants worth pinning explicitly because they're easy to break in this refactor (per `USER_GUIDE.md`):

- channel `AND` vs `OR` match mode applies to included channels and is preserved across preset apply
- excluded channels hide items regardless of match mode
- people exclusive-select clears other people while preserving channel filter state
- preset apply does not bounce the view through an empty filter state mid-render

## Verification

Per [`USER_GUIDE.md`](/Users/tj/IT/nostr/nodex/USER_GUIDE.md) "Channel and Tag Filtering" / "People Filtering" / "Feed Filtering and Publishing" / "Saved Filter Presets" sections, this refactor touches load-bearing behavior. Treat as a major verification path:

- `npm run lint`
- `npx vitest run`
- `npm run build`
- Manual smoke: exclusive-select a channel; apply a preset; clear-all; toggle people; reload page (persistence round-trip); back/forward (URL sync round-trip)

## Risks To Watch

- **Persistence schema bump.** Adding `peopleFilterStates` to the persisted slice changes the stored shape. Per CLAUDE.md: do not write migration code; bump the storage key prefix for a clean cut, or rely on the existing reject-malformed-entries `merge` pattern (which is the better choice — additive read tolerance, no key bump needed).
- **Customer-launch timing.** This is a structural refactor of filter state, which is the most-touched user surface. Sequence the dimension migrations between feature pushes, not concurrent with them. Each step ships independently; do not batch.
- **Setter-removal regression risk.** Removing `setChannelFilterStates` from `use-channel-filter-controller.ts`'s return type will surface as compile errors at every caller. Use the type system to find them all before changing runtime behavior. Don't introduce a deprecation phase that leaves both APIs alive — that doubles the surface.
- **Coordination with `refactor-mobile-filtering-centralization.md`.** Both touch `searchQuery` ownership. Land the mobile-centralization plan's changes first if they're in flight, then proceed here; otherwise this plan's `setFilter(partial)` can subsume that work.
- **Don't expand scope to focused task or saved presets.** Both are separate concerns with their own plans / stores. Keep this plan narrowly about sidebar filter dimensions.

## Expected Outcome

- `useFilterStore` is the single source of truth for every sidebar filter dimension
- `Index.tsx` no longer holds filter `useState` cells nor threads filter setters into hooks
- the per-dimension controllers shrink (especially `use-channel-filter-controller.ts` at 403 LOC); their job becomes derived data and commands, not setter relay
- a single `setFilter(partial)` action enables atomic multi-dimension writes (preset apply, clear-all, exclusive-select, URL hydration) — eliminating intermediate render states
- new filter dimensions (future quick-filter categories, future scope toggles) land in the store directly; CLAUDE.md's "new filter dimensions go through the canonical filter slice" rule becomes enforceable
- progress on this plan visibly advances [`split-index-page-remaining.md`](/Users/tj/IT/nostr/nodex/plans/split-index-page-remaining.md) Milestone 4 ("Re-home the Remaining Relay/Profile Glue") because relay filter ownership stops being page-local
