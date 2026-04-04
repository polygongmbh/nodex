## Goal

Refactor mobile filtering so task views do not decide text-query fallback themselves.

The target design is:

- one canonical `searchQuery` in shared surface state
- central controller logic computes the final task set for the current mobile render
- views receive already-filtered data only
- mobile fallback is resolved inside controller filtering instead of being exposed as a view flag or query override

## Why This Refactor

The current model spreads one concern across three layers:

- `searchQuery` as shared state
- `effectiveSearchQuery` as derived mobile fallback state
- `searchQueryOverride` as a prop escape hatch into views

That creates three failure modes:

- controllers and views can disagree on which query is active
- mobile fallback can look correct in shell state while rendered results stay stale
- filtering work is repeated across multiple views, making mobile feel more fragile and laggy

## Constraints

- There is an unrelated unstaged change in [`src/components/tasks/FeedView.tsx`](/Users/tj/IT/nostr/nodex/src/components/tasks/FeedView.tsx).
- Avoid broad incidental edits there unless the final implementation absolutely requires it.
- Prefer moving filtering decisions into shared controller code and the feed task view model rather than expanding per-view logic.

## Proposed Design

### 1. Keep one canonical search string

- Preserve `searchQuery` in feed surface state as the user-entered filter text.
- Remove the need for mobile to manufacture an alternate search string just to change filtering behavior.

### 2. Resolve fallback entirely inside controller filtering

- Do not expose a fallback flag to views.
- The controller should:
  - compute the normal filtered task set
  - if that set is empty and mobile fallback applies, compute the fallback task set with only text search ignored
  - return one resolved final task set to the view
- The view should not need to know whether that task set came from normal filtering or fallback filtering.

### 3. Centralize filtered task-set computation

- Move the "apply all filters except text query" decision into shared controller code, not view props.
- Each controller path should be able to compute:
  - the fully filtered task set
  - the fallback task set with text query ignored but remaining scope preserved
- If the normal task set is empty and fallback is allowed, the controller should choose the fallback task set before data reaches the view.
- Views should receive one resolved task set rather than raw filtering inputs plus fallback state.

### 4. Narrow view responsibilities

- Task views should render:
  - task collections
  - empty/fallback UI hints
  - view-specific presentation details
- Task views should not be the place where mobile fallback changes which query/filter set is applied.

### 5. Remove override plumbing from mobile

- Remove `searchQueryOverride` from the mobile fallback path once the controller owns the filtered task set decision.
- If `searchQueryOverride` remains for any desktop/specialized cases, keep that scope explicit and avoid using it for mobile fallback.

## Likely Implementation Steps

1. Inspect the shared task-view controller API surface.
   - Focus on:
     - [`src/features/feed-page/controllers/use-task-view-states.ts`](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-task-view-states.ts)
     - [`src/components/mobile/MobileLayout.tsx`](/Users/tj/IT/nostr/nodex/src/components/mobile/MobileLayout.tsx)
     - [`src/pages/Index.tsx`](/Users/tj/IT/nostr/nodex/src/pages/Index.tsx)
   - Identify the minimum shared API change that lets mobile consume a resolved task set instead of an alternate query string or fallback flag.

2. Refactor controller filtering helpers.
   - Do not add a new shared filtering utility. `useFeedViewState` and `createTreeSelectors.getDisplayedTasks` already express the correct pattern — extend the same `isMobile` param to `useListViewState` and `useKanbanViewState` instead.
   - Each view controller gains an `isMobile` param, computes both the normal and fallback task sets internally, and returns one resolved set.
   - Keep channel, people, relay, focused-task, and quick-filter constraints active in fallback mode.
   - Make the controller select the final result set internally before returning data to the view layer.

3. Update mobile shell wiring.
   - The concrete change is: remove `searchQueryOverride: effectiveSearchQuery` from `effectiveTaskViewModel` in `MobileLayout` and drop `effectiveSearchQuery` from `MobileFallbackNoticeState`. No new wiring needed.
   - Ensure the shell only controls notice visibility while consuming the resolved task set from the controller.

4. Update views to consume controller output.
   - Prefer passing resolved task collections over raw filter override props.
   - Remove per-view branching that re-applies mobile text fallback independently.

5. Clean up obsolete props and dead branches.
   - Remove now-unused override plumbing where possible.
   - Keep the diff focused; do not mix unrelated view cleanup into this change.

## Testing Plan

Add or update tests before/during implementation so the refactor protects behavior rather than only types:

- controller-level tests proving:
  - normal filtering uses text query
  - when the normal result is empty, controller fallback ignores only text query
  - channel/person/relay/quick-filter scope remains active during fallback
- mobile layout tests proving:
  - fallback still shows the notice
  - adding another scope filter after fallback keeps results constrained
  - fallback remains stable when filter combinations change
- if practical, add one higher-level regression for "works initially, then still works after additional filter changes"

## Verification

Because this touches shared filtering/controller behavior, treat it as a major verification path:

- required:
  - `npm run lint`
  - `npx vitest run`
  - `npm run build`

## Risks To Watch

- duplicating task-set computation in multiple controller branches
- preserving desktop behavior while changing mobile filtering ownership
- accidental coupling to the unrelated local edits in [`src/components/tasks/FeedView.tsx`](/Users/tj/IT/nostr/nodex/src/components/tasks/FeedView.tsx)
- overcorrecting by removing useful controller flexibility that is still needed outside mobile fallback

## Expected Outcome

- mobile filtering becomes deterministic and easier to reason about
- fallback no longer depends on override-prop plumbing
- views stop disagreeing with controller fallback state
- mobile filter changes should feel more stable and less lag-prone because filtering decisions live in one place
