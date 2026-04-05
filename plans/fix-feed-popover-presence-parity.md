# Fix Feed Popover Presence Parity

## Goal

Make profile popovers in feed chips and feed author affordances use the same
presence-enriched person data as the sidebar, and treat missing presence status
as offline instead of online.

## Why This Is Happening

- The sidebar uses `deriveSidebarPeople(...)` to compute `onlineStatus`,
  `isOnline`, `lastPresenceAtMs`, `presenceView`, and `presenceTaskId` from
  scoped task activity plus NIP-38 presence.
- Feed popovers resolve people from the broader `people` collection in
  `FeedSurfaceState`, which currently comes from kind-0 metadata derivation and
  hardcodes `isOnline: true`.
- Additional normalization in interactive filter code also defaults missing
  `isOnline` / `onlineStatus` to online.

## Opinionated Fix

Create a single presence-enriched feed person lookup at the feed surface level,
derived from the same presence inputs used by the sidebar, then make feed
popover consumers resolve against that enriched map first. Missing status should
fall back to offline everywhere unless there is explicit computed presence.

## Steps

1. Add a shared presence-enrichment helper for arbitrary `Person[]`.
   - Extract the status computation from `deriveSidebarPeople(...)` into a
     reusable domain helper that can enrich any person list with:
     `isOnline`, `onlineStatus`, `lastPresenceAtMs`, `presenceView`, and
     `presenceTaskId`.
   - Keep sidebar-specific concerns separate:
     minimum-post thresholding, scoring, and sorting stay in
     `deriveSidebarPeople(...)`.

2. Build a feed-wide enriched people list in derived data or `Index.tsx`.
   - Start from the broader `people` collection, not only `sidebarPeople`, so
     mention chips and feed authors can resolve presence even for people not
     eligible for the frequent-people sidebar.
   - Enrich that list using the same scoped task set and `latestPresenceByAuthor`
     inputs already used by the sidebar.
   - Thread this enriched list through `FeedSurfaceState` as the primary
     popover lookup source.

3. Update feed popover lookups to use enriched people.
   - Change `useFeedPersonLookup()` / `FeedSurfaceState` so
     `TaskMentionChips`, `FeedTaskCard`, `FeedView`, and `TreeTaskItem` resolve
     people from the enriched feed-surface list.
   - Preserve existing fallback placeholder behavior for unknown pubkeys, but
     keep those placeholders offline.

4. Remove optimistic online defaults.
   - In `derivePeopleFromKind0Events(...)`, stop hardcoding
     `isOnline: true`; default to offline unless presence enrichment later sets
     a better state.
   - In `useIndexFilters.normalizeInteractivePerson(...)`, change missing
     `isOnline` / `onlineStatus` fallback values from online to offline.
   - Audit other `?? true` / `"online"` fallbacks for `Person` presence and
     align them with offline-by-default behavior.

5. Add regression coverage.
   - Add domain tests for the extracted presence-enrichment helper to prove it
     matches current sidebar thresholds and explicit offline handling.
   - Add component/controller tests showing a feed mention chip hover card and a
     feed author hover card render offline/recent/online consistently with the
     sidebar model.
   - Keep assertions semantic and avoid coupling to translated copy where
     possible.

6. Verify with the required matrix for this scope.
   - Run `npm run lint`.
   - Run `npx vitest run`.
   - Run `npm run build`.

## Key Choices

- Prefer one shared enrichment path over duplicating sidebar logic in feed
  components.
- Keep sidebar eligibility and ordering separate from presence computation.
- Default unknown or uncomputed presence to offline to avoid overstating
  activity.

## Expected Touchpoints

- `src/domain/content/sidebar-people.ts`
- new shared presence helper under `src/domain/content/`
- `src/infrastructure/nostr/people-from-kind0.ts`
- `src/features/feed-page/views/feed-surface-context.tsx`
- `src/pages/Index.tsx`
- `src/components/tasks/TaskMentionChips.tsx`
- feed author popover call sites and related tests
