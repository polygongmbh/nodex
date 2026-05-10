# Composer Shell Ownership Refactor

## Goal

Move the shared composer for desktop `tree` / `feed` / `list` views out of the individual view components and into the shell that already switches between those views.

This should:

- make composer placement/layout a shell concern instead of a per-view concern
- reduce repeated composer gating and prop plumbing in `TaskTree`, `FeedView`, and `ListView`
- narrow the view model surface so view components receive only data they actually render

## Current Shape

- `DesktopViewsPane` owns desktop view switching and the shared empty-state overlay.
- `TaskTree`, `FeedView`, and `ListView` each render `SharedViewComposer` near the top of their own layout.
- composer inputs such as `forceShowComposer`, `composeGuideActivationSignal`, `composeRestoreRequest`, `mentionRequest`, and `onMentionRequestConsumed` are passed through the shared view model even when a given view does not need all of them.
- `SharedViewComposer` already reads some of its own dependencies from context (`allTasks`, relays, auth policy), so its explicit prop surface is partly redundant.

## Proposed Ownership Split

### 1. Shell owns composer rendering

Create a desktop-only shared composer slot in `DesktopViewsPane` and render it for:

- `tree`
- `feed`
- `list`

Do not move the inline composers that are specific to calendar day creation or kanban column creation. Those are contextual tools, not the shared page-level composer.

### 2. Views expose composer state, not composer UI

Views should stop rendering `SharedViewComposer` directly.

Instead, the shell should derive or receive the minimal state needed to render the composer:

- current focused task id
- default composer content for the active view/scope
- whether comments are allowed
- whether feed-only message types are allowed
- whether the composer should be hidden for this surface entirely

The shell can choose these values from the active view type rather than forwarding raw composer props into every view.

### 3. Reduce the shared view model

After composer rendering moves upward, remove composer-only props from the generic view model where they are no longer broadly needed:

- `forceShowComposer`
- `composeGuideActivationSignal`
- `mentionRequest`
- `onMentionRequestConsumed`
- `composeRestoreRequest`

Two reasonable end states:

1. preferred: move these into a dedicated composer context/provider used by the desktop shell
2. acceptable: keep them on the page container but pass them only into the shell composer, not into all views

I would avoid leaving them on `FeedTaskViewModel` unless a view still consumes them directly.

## Implementation Plan

1. Extract shared desktop composer config
   - Add a small helper or hook under `src/features/feed-page/views/` that returns composer config for the active desktop view.
   - Inputs should be `currentView`, `focusedTaskId`, and the existing per-view derived defaults.
   - Output should be a compact object such as:
     - `visible`
     - `focusedTaskId`
     - `defaultContent`
     - `allowComment`
     - `allowFeedMessageTypes`

2. Make `DesktopViewsPane` render the shared composer
   - Place it above the active view pane and below `TaskViewStatusRow`, preserving the current visual position.
   - Keep the existing desktop-only behavior there rather than inside each child view.
   - Preserve read-only-parent hiding and warning behavior through `SharedViewComposer`.

3. Remove embedded shared composer blocks from view components
   - `src/components/tasks/TaskTree.tsx`
   - `src/components/tasks/FeedView.tsx`
   - `src/components/tasks/ListView.tsx`
   - delete local `isComposerExpanded` state from `TaskTree` if it becomes unnecessary, or relocate that concern to the shell if keyboard navigation still needs it

4. Replace broad props with narrower contracts
   - stop passing composer-only props into `TaskTree`, `FeedView`, and `ListView`
   - keep view props focused on rendering and interaction data
   - if keyboard navigation still needs composer-expanded state, expose a typed shell-level interaction model rather than another loose prop bundle

5. Update tests around ownership boundaries
   - add or update `DesktopViewsPane` tests to assert composer presence/absence by view
   - update `SharedViewComposer` tests only if its external contract changes
   - remove view-level tests that assume each view owns composer rendering

## Design Choices

### Why `DesktopViewsPane`

`DesktopViewsPane` already owns two cross-view shell concerns:

- active view selection
- empty-state overlay behavior

The shared desktop composer belongs in the same layer. Moving it only to `DesktopAppShell` would push view-specific decisions too far upward and make the pane/shell boundary less coherent.

### Why not unify calendar/kanban now

Those composers are not layout duplicates of the shared top composer.

- calendar composer is scoped to a selected day
- kanban composer is scoped to a column/status

Folding them into the shell would overgeneralize the abstraction and make the contract worse.

### Why reduce props after the move

If the shell owns the composer but the old prop bundle still flows into every view, the ownership change does not actually simplify the architecture. The point is to remove composer concerns from view interfaces, not only relocate JSX.

## Risks

- `TaskTree` currently disables keyboard task navigation while its local composer is expanded. That behavior will need a shell-owned equivalent or an explicit decision to relax it.
- `FeedView` and `TaskTree` currently accept mention restore/consume props; moving the composer must preserve mention insertion and draft restore behavior.
- default composer text is view-derived today (`composerDefaultContent` from tree/feed/list selectors). The shell needs a stable way to access that without recomputing inconsistent logic in two places.

## Verification

Because this is a cross-view UI change, treat it as a major verification path:

- `npm run lint`
- `npx vitest run`
- `npm run build`

Add focused test coverage for:

- composer renders for desktop `tree`, `feed`, and `list`
- composer does not render as a shared top bar for `calendar` and `kanban`
- view switching preserves the correct composer mode (`allowComment`, `allowFeedMessageTypes`, default content)
- focused-task read-only parent still hides replies and shows the warning toast once

## Suggested Execution Order

1. expose the active view's composer config in a shell-friendly form
2. move rendering into `DesktopViewsPane`
3. remove composer code and props from the three views
4. tighten tests and clean up stale state/interfaces

## Open Question To Resolve During Implementation

The only notable design decision is where composer-expanded state should live for tree keyboard navigation:

- shell-local state, if expansion should block keyboard navigation across shared desktop views
- tree-only derived interaction state, if that behavior is truly specific to tree navigation

My bias is shell-local only if the expanded-state effect becomes genuinely cross-view. Otherwise keep that behavior specific and avoid inventing a larger abstraction.
