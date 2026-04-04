# Plan: Mobile `/feed`-Style Loads Should Open Manage

## Goal

When the app is opened on mobile at a content route such as `/feed`, `/tree`, `/list`,
or `/calendar`, show the manage pane first instead of the content pane.

The route-derived content view should still be remembered so that leaving manage returns
to the originally requested view.

## Opinionated Approach

Implement this in `useFeedNavigation`.
That hook already owns:

- path-derived `currentView`
- manage-route state
- last non-manage view memory

The mobile shell should keep reacting to `isManageRouteActive`.
It should not decide on its own whether an initial route needs to be rewritten.

## Implementation Steps

1. Add one-time mobile boot logic in `useFeedNavigation`.
   Detect initial app load on a mobile device when the current path resolves to a normal content view
   rather than `/manage`.
   On that first mount, redirect to `/manage`.

2. Preserve the requested content view before redirecting.
   Keep using the existing `lastContentViewRef` so opening `/feed` on mobile
   still remembers `feed`, opening `/tree` remembers `tree`, and so on.
   Closing manage should therefore return to the originally requested content route.

3. Keep the behavior tightly scoped.
   Do not change desktop behavior.
   Do not change direct `/manage` loads.
   Do not interfere with focused-task routes unless explicitly desired.
   Default recommendation: apply only to plain content routes without a focused task first,
   because forcing `/feed/task-id` into manage may be a separate product decision.

4. Add navigation tests first in `use-feed-navigation.test.tsx`.
   Cover:
   - mobile load at `/feed` opens manage and remembers `feed`
   - mobile load at `/tree` opens manage and returns to `tree` when manage closes
   - desktop load at `/feed` stays on `feed`
   - direct mobile load at `/manage` remains on manage
   - focused-task routes are unchanged unless product scope expands

5. Verify the changed area.
   Required for this scope:
   - `npx vitest run src/features/feed-page/controllers/use-feed-navigation.test.tsx`
   Recommended:
   - `npm run build`

## Notes / Risks

- The key product choice is whether this applies only to plain view routes
  or also to focused-task routes like `/feed/<taskId>`.
  This plan assumes plain view routes only.
- Because the redirect is mobile-only and one-time, the implementation should guard against
  repeated navigation loops after the app is already on `/manage`.
