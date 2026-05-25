# Composer Shell Ownership Refactor

## Goal

Move the shared composer for desktop `tree` / `feed` / `list` views out of the individual view components and into the shell that already switches between those views.

This should:

- make composer placement/layout a shell concern instead of a per-view concern
- reduce repeated composer gating and prop plumbing in `TaskTree`, `FeedView`, and `ListView`
- narrow the view model surface so view components receive only data they actually render
- make keyboard navigation ownership explicit across sidebar and task views

## Current Shape

- `DesktopViewsPane` owns desktop view switching and the shared empty-state overlay.
- `TaskTree`, `FeedView`, and `ListView` each render `SharedViewComposer` near the top of their own layout.
- composer inputs such as `forceShowComposer`, `composeGuideActivationSignal`, `composeRestoreRequest`, `mentionRequest`, and `onMentionRequestConsumed` are passed through the shared view model even when a given view does not need all of them.
- `SharedViewComposer` already reads some of its own dependencies from context (`allTasks`, relays, auth policy), so its explicit prop surface is partly redundant.
- keyboard task navigation is implemented with the shared `useTaskNavigation` hook in multiple views, including tree, feed, list, and kanban.
- both the sidebar and task views currently register global `window` key handlers. When the sidebar is focused, `J` / `K` can move focus in both the sidebar and active task view because `preventDefault()` does not prevent another listener on the same target from running.

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

### 4. Shell coordinates keyboard navigation ownership

Keyboard navigation should not be treated as a `TaskTree` special case.

The shared navigation model should make exactly one surface active at a time:

- sidebar navigation when `isSidebarFocused` is true
- task-view navigation when `isSidebarFocused` is false and the active view supports task navigation
- no global task navigation while a form field, contenteditable element, modal dialog, or composer text input has focus

The composer should not need a separate expanded-state gate for normal typing. Its inputs should catch keypresses through the existing "interactive target" checks. If that check is incomplete, fix the target detection rather than adding composer-specific state wiring.

The immediate reliability bug is the sidebar/view double-handling. The implementation should ensure task-view navigation is disabled while the sidebar is focused, and should also stop propagation in the sidebar handler after it consumes navigation keys.

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
   - delete local `isComposerExpanded` state from `TaskTree`; do not replace it with shell composer-expanded state unless a concrete bug proves the generic input-target guards are insufficient

4. Replace broad props with narrower contracts
   - stop passing composer-only props into `TaskTree`, `FeedView`, and `ListView`
   - keep view props focused on rendering and interaction data

5. Generalize active-surface keyboard coordination
   - make `useTaskNavigation` accept an active-surface gate from `FeedViewState` or from a shell-level navigation context
   - disable task navigation while `isSidebarFocused` is true
   - ensure the sidebar handler stops propagation for consumed navigation keys
   - keep the existing interactive-target guard so composer inputs, selects, textareas, and contenteditable fields own their keystrokes
   - review kanban's custom movement behavior separately because it uses the same hook plus column-aware movement

6. Update tests around ownership boundaries
   - add or update `DesktopViewsPane` tests to assert composer presence/absence by view
   - update `SharedViewComposer` tests only if its external contract changes
   - remove view-level tests that assume each view owns composer rendering
   - add focused keyboard tests for sidebar/task-view mutual exclusion
   - add or update `useTaskNavigation` tests for interactive-target suppression and disabled state behavior

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

### Why keyboard navigation belongs with shell coordination

`useTaskNavigation` is already a shared task-view behavior rather than tree-specific behavior.
The missing piece is ownership coordination between surfaces.

The shell already knows whether focus belongs to the sidebar or the task area, so it is the right layer to decide which global keyboard handler is active. Individual task views can still provide their visible task IDs and view-specific movement semantics.

### Why no composer-specific keyboard gate

Composer expansion should not control task navigation directly.
Typing targets should own their keystrokes by being recognized as interactive elements.

That keeps the behavior consistent for the composer, search inputs, selects, metadata editors, and any future editable controls.

## Risks

- removing `TaskTree`'s composer-expanded navigation gate depends on the generic interactive-target suppression being correct for the composer and its nested controls.
- `FeedView` and `TaskTree` currently accept mention restore/consume props; moving the composer must preserve mention insertion and draft restore behavior.
- default composer text is view-derived today (`composerDefaultContent` from tree/feed/list selectors). The shell needs a stable way to access that without recomputing inconsistent logic in two places.
- kanban has column-aware keyboard movement and task-moving shortcuts. Shared navigation ownership must not flatten away those semantics.
- sidebar and task views currently use separate global listeners. Fixing double-handling may require both active-state gating and event propagation cleanup to avoid future regressions.

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
- `J` / `K` move only the sidebar focus while the sidebar is focused
- `J` / `K` move only the active task-view focus while the task area is focused
- composer input keystrokes do not trigger task navigation

## Suggested Execution Order

1. expose the active view's composer config in a shell-friendly form
2. add task/sidebar active-surface gating to keyboard navigation
3. move composer rendering into `DesktopViewsPane`
4. remove composer code and props from the three views
5. tighten tests and clean up stale state/interfaces

## Implementation Notes

Prefer fixing the keyboard issue before removing `TaskTree`'s local composer state.
That keeps the behavior change easy to reason about:

- first make task navigation inactive when the sidebar is active
- then remove the tree-only composer-expanded navigation guard
- then verify composer typing is protected by the generic interactive-target guard

The intended end state is that task views own task ordering and highlighting, while the shell owns which surface is allowed to react to global navigation keys.
