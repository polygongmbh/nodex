# Plan: Reset Active Task When Switching Relays/Feeds

## Goal

When the user changes the active relay/feed scope, clear the currently focused task so the app does not keep showing a task that may no longer belong to the visible feed.

## Current Behavior

- Active task state is route-driven in [`src/pages/Index.tsx`](/Users/tj/IT/nodex/src/pages/Index.tsx): `/:view/:taskId`.
- `focusedTaskId` is derived directly from `urlTaskId`.
- Relay/feed changes currently update filter state through [`src/hooks/use-relay-filter-state.ts`](/Users/tj/IT/nodex/src/hooks/use-relay-filter-state.ts), but they do not clear the route task segment.
- As a result, switching relay selection can leave the UI focused on a stale task from the old feed scope.

## Proposed Implementation

1. Add a single "reset active task" callback in [`src/pages/Index.tsx`](/Users/tj/IT/nodex/src/pages/Index.tsx).
   - Reuse the existing `setFocusedTaskId(null)` route behavior instead of introducing a second navigation path.
   - Keep the reset logic close to the route state owner, since `focusedTaskId` lives there.

2. Wrap relay/feed switching handlers at the `Index` level.
   - Create `handleRelayToggleAndReset`, `handleRelayExclusiveAndReset`, and `handleToggleAllRelaysAndReset` style wrappers.
   - Each wrapper should:
     - no-op on task reset when no task is focused
     - otherwise clear the focused task first or immediately after the filter mutation
   - Pass these wrappers to both desktop `Sidebar` and `MobileLayout` so behavior stays consistent across form factors.

3. Decide the exact reset timing based on URL consistency.
   - Preferred: clear the focused task in the same event handler that changes relay selection.
   - Reason: this avoids relying on a later `useEffect` keyed on relay ids, which would be more implicit and easier to trigger accidentally during initialization/onboarding.
   - Guard against unintended resets from non-user relay state changes such as initial auto-selection in `useRelayFilterState`.

4. Verify whether "feeds" should include only relay-scope changes or also other feed-scope filters.
   - Based on the current code, the safest interpretation is relay/feed selection only.
   - If product intent also includes channel/people feed filters, extend the same wrapper pattern to those handlers after confirming expected UX.

## Tests

1. Add/extend an `Index`-level routing test if one already exists or is practical to add.
   - Start on a route like `/feed/task-123`.
   - Trigger relay toggle/exclusive/select-all from the rendered handler surface.
   - Assert navigation lands on `/feed` and the focused task breadcrumb/detail context is cleared.

2. If `Index` integration coverage is too heavy, add a focused regression test around the extracted wrapper behavior.
   - The assertion still needs to prove the task-reset side effect happens when relay handlers are invoked.

3. Keep existing hook tests in [`src/hooks/use-relay-filter-state.test.tsx`](/Users/tj/IT/nodex/src/hooks/use-relay-filter-state.test.tsx) focused on relay-selection semantics.
   - Do not move route-reset expectations into the hook test unless the hook API is deliberately expanded to own that responsibility.

## Verification

- Required for this localized behavior change:
  - targeted Vitest coverage for the new reset behavior
- Recommended:
  - `npm run build`

## Risks / Checks

- Avoid clearing the active task during relay auto-initialization or onboarding-driven filter resets unless that is already intended.
- Keep the reset scoped to user-triggered relay/feed switching so startup hydration does not unexpectedly rewrite routes.
- Ensure mobile Manage/filter interactions and desktop sidebar interactions share the same behavior.
