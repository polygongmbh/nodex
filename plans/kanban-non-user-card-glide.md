# Plan: Smooth glide for Kanban cards moved by non-user actions

## Goal
When a Kanban card changes position due to external updates (sync/hydration, remote edits, sorting updates, keyboard-triggered status changes, or optimistic->canonical reconciliation), cards should glide to their new positions instead of snapping.

## Product Intent
- Animate only non-pointer-driven reordering/moves.
- Preserve existing drag-and-drop behavior from `@hello-pangea/dnd`.
- Respect `prefers-reduced-motion`.

## Opinionated Technical Direction
Use a FLIP-style DOM animation pass in `KanbanView` (same pattern already proven in `TaskTree`) rather than adding another animation library.

Why this path:
- Lowest dependency and integration risk with current DnD stack.
- Precise control to exclude active user drag interactions.
- Reuses existing motion tokens (`--motion-duration-normal`, `--motion-ease-standard`) for consistency.

## Implementation Steps
1. Add per-column container refs in `KanbanView`.
- Track each column’s rendered card node positions (`data-task-id`) between renders.
- Keep previous per-column order and Y positions in refs.

2. Add reduced-motion guard.
- Mirror existing `TaskTree` pattern: subscribe to `matchMedia("(prefers-reduced-motion: reduce)")` and short-circuit animations when enabled.

3. Run FLIP animation after non-drag reorder.
- Use `useLayoutEffect` keyed by stable column order signatures (derived from `tasksByStatus`).
- For each card with same identity before/after in the same column or moved columns, compute `deltaY` from previous top to current top.
- Apply temporary `transform: translateY(deltaY)` then transition to `translateY(0)`.
- Cleanup with `transitionend` + timeout fallback.

4. Explicitly avoid animating user drag phase.
- Skip FLIP when any draggable snapshot indicates active drag state, or when reorder is attributable to immediate DnD drag frame.
- Ensure DnD placeholders and drag shadow remain unaffected.

5. Keep motion scoped and safe.
- Do not animate cards newly inserted/removed from DOM in this first pass (only cards present in both snapshots).
- Clear stale inline transform/transition styles when animation is skipped.

6. Optional extraction (if duplication grows).
- If implementation gets bulky, extract small shared utility/hook (e.g. `useFlipListAnimation`) to reuse with `TaskTree` later.
- Keep first PR localized to `KanbanView` unless extraction clearly reduces complexity.

## Layout Follow-Up: Cutoff + Scrollbar Visibility
Observed issue:
- The Kanban horizontal scrollbar sits directly against the desktop search dock and blends into its top gradient, creating a hard visual cutoff at the bottom of the board.

Recommended path:
1. Add a dedicated top horizontal scrollbar rail for Kanban.
- Render a slim `overflow-x-auto` rail above the columns in `KanbanView`.
- Mirror scroll position both ways (`rail.scrollLeft <-> board.scrollLeft`) so the top rail controls the board.
- Keep the bottom native scrollbar available but de-emphasized (or hide only when top rail is verified accessible).

2. Remove/soften bottom cutoff near the search dock.
- Reduce or conditionally disable the dock’s `-top-8` fade overlay while in Kanban view.
- Add small bottom breathing room in the board scroller (`pb-3` to `pb-4`) so content and scrollbar do not visually collide with the dock border.

3. Improve scrollbar contrast.
- Apply `scrollbar-thin scrollbar-main-view` to the Kanban horizontal scroller as well (not only column vertical scrollers).
- Ensure track/thumb contrast remains visible over translucent backgrounds.

Fallback (lower effort):
- Keep only bottom scrollbar, but add stronger separation line/background above `DesktopSearchDock` and board bottom padding.

## Files Expected
- `src/components/tasks/KanbanView.tsx`
- `src/features/feed-page/views/FeedPageDesktopShell.tsx`
- `src/components/tasks/DesktopSearchDock.tsx`
- `src/components/tasks/KanbanView.test.tsx` (focused behavior tests)

## Test Strategy (focused)
1. Add a test for non-drag movement animation trigger.
- Mock `getBoundingClientRect` for a task before/after status/order change.
- Assert inline transform/transition is applied in response to non-drag reorder path.

2. Add reduced-motion test.
- Mock `matchMedia(...reduce...)` to `true` and verify no transition style is applied.

3. Keep existing optimistic move test intact.
- Confirms behavior remains correct while animation layer is added.

4. Add focused layout tests where practical.
- Verify Kanban renders the top-scroll rail in desktop mode.
- Verify Kanban-specific dock treatment (for example a class/prop toggle that disables the harsh fade overlay).

Notes:
- JSDOM layout limits mean tests should validate style side effects and guard conditions, not pixel-perfect motion.

## Verification Matrix Mapping
- Category: minor localized UI/logic change.
- Required: focused tests for changed area (`npx vitest run src/components/tasks/KanbanView.test.tsx`).
- Recommended: `npm run build`.

## Risks and Mitigations
- Risk: conflict with DnD drag transforms.
  - Mitigation: hard guard to skip FLIP while actively dragging.
- Risk: jank on large columns.
  - Mitigation: animate only changed rows; clear `will-change` immediately after transition.
- Risk: accessibility concerns with motion.
  - Mitigation: strict `prefers-reduced-motion` disable path.

## Definition of Done
- Non-user card moves in Kanban visually glide rather than snap.
- Manual drag interaction remains unchanged.
- Reduced-motion users see no glide animation.
- Focused tests pass for animation guard paths.
