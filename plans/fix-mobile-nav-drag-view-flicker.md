# Fix mobile nav drag flicker

## Problem

On mobile, the segmented nav supports press-and-drag selection across views.
The observed flicker is not just explained by crossing intermediate tabs:
even dragging between `tree` and `timeline` can briefly jump to `calendar`, which is not on that path.

That points to a second issue in `src/components/mobile/MobileNav.tsx`:
captured pointer movement can leave the segmented control bounds, and the fallback path in `getSegmentFromX(...)` currently resolves some out-of-bounds positions to the last segment (`calendar`).
Because drag currently commits live route changes during movement, that stray fallback can briefly render `calendar` before the final target wins on pointer-up.

## Opinionated approach

Treat drag as a local selection preview inside `MobileNav`, then commit exactly once on release.

This is the right fix because:

- the bug is caused by eager route commits during pointer movement
- the pill can still visually track the finger without changing the actual page
- a single commit on `pointerup` removes transient view jumps and avoids unnecessary full-view renders during drag

## Planned changes

1. Refactor `src/components/mobile/MobileNav.tsx`
   - Add local drag-selection state or refs, separate from `currentView`.
   - While dragging, update only the nav’s highlighted segment/pill target.
   - Stop calling `onViewChange` from `handlePointerMove`.
   - On `pointerup`, commit the last hovered segment once if it differs from the active view.
   - Keep simple taps working as they do now, with duplicate click suppression still intact.
   - Ensure cancel/abort paths clear the temporary drag selection cleanly.
   - Tighten `getSegmentFromX(...)` so out-of-bounds pointer positions clamp safely instead of defaulting to `calendar` from stray captured moves.

2. Extend `src/components/mobile/MobileNav.test.tsx`
   - Add a regression test that drags across multiple tabs and asserts no view-change callback fires during `pointermove`.
   - Assert the callback fires once on `pointerup` with the final hovered segment.
   - Add a regression test for an out-of-bounds captured drag so a stray move outside the segmented control cannot resolve to `calendar` unless the pointer is actually on the calendar side.
   - Add a coverage case for drag cancel to confirm no stale selection leaks into later taps.

3. Add or adjust a narrow mobile integration regression if needed
   - If unit coverage is not enough, add a small assertion in `src/components/mobile/MobileLayout.test.tsx` around drag-triggered dispatch count so the route layer only sees the final chosen view.

## Verification

Required for this localized interaction fix:

- `npx vitest run src/components/mobile/MobileNav.test.tsx src/components/mobile/MobileLayout.test.tsx`

Recommended:

- `npm run build`

## Risks to watch

- The pressed-state pill should still feel responsive during drag even though the actual view does not change yet.
- Manage-to-view transitions should keep their current no-flicker behavior.
- Tap, drag, and tap-after-drag suppression logic can interfere with each other if temporary state is not reset carefully.
- Pointer capture means move/up events can arrive from outside the control, so bounds handling needs to be explicit rather than relying on last-segment fallback.
