# Command-bundle split + `Feed*` naming sweep

## Status

**Part A is DONE — but not as written here.** It was superseded and
executed as the "collapse the FeedPageProviders pyramid" refactor
(≈2026-06-27→07-01). Instead of *splitting* the command god-bundles
into more contexts, the bus-only command contexts were *deleted* and
their values passed to the interaction bus as plain props. Net outcome
in the repo now:
- `FeedSidebarCommands` and `FeedViewCommands` are no longer contexts —
  they're plain input types in
  `src/features/feed-page/interactions/feed-interaction-inputs.ts`,
  produced in `Index` and handed to `FeedInteractionBusProvider` as props.
- The failed-publish methods split off `FeedTaskCommands` into a
  `FailedPublishCommands` bus input; the task lifecycle methods into a
  `TaskInteractionCommands` bus input. `FeedTaskCommands` the context now
  holds only `createTask` (has a `// TODO: remove after
  composer-shell-ownership-refactor` marker).
- `FeedSidebarControllerProvider` → demoted to a prop
  (`DesktopAppShell` → `FeedPageSidebar`); context deleted.
- `FeedViewStateProvider` → **deleted entirely**; every field moved to
  its real source (`displayDepthMode`→preferences store,
  `currentView`→prop from `useFeedNavigation`, `canCreateContent`→
  `useAuthActionPolicy`, `profileCompletionPromptSignal`→prop to
  `ProfileCompletionDialog`, onboarding fields→OnboardingController).
- Mobile `manage` is now a **local overlay, not a `/manage` route**
  (that removed `lastContentViewRef` and made `currentView` URL-pure).
- `useOnboarding` was folded out of Index into `OnboardingController`
  (new `useOnboardingStore` holds open-state; the hook dispatches
  intents instead of calling Index setters).

Full narrative + the steers that reshaped it: see
`plans/architecture-decisions-log.md`.

**Part B (the `Feed*` naming sweep) is still valid** and is the only
remaining work in this plan. Run it now. Counts below were **re-verified
2026-07-01** against the post-Part-A tree.

Successor to `counting-roughly-effervescent-nebula.md` (Phases 1–2
done) and `ancient-riding-dewdrop.md` (Steps 1–4 done, Step 7 done).

## Where we are (verified 2026-05-29)

Confirmed gone (grep returns 0): `useFocusedTaskId`,
`searchQueryOverride`, `feed-task-view-model-context` /
`useFeedTaskViewModel`, `SharedTaskViewContext`,
`mobileShellFocusedTaskId`. The carry-bag is dead; `focusedTaskId` and
`posts` are threaded top-down from Index; view-state hooks
(`useTaskViewSource` / `useFeedViewState` / `useListViewState`) no
longer re-export store/surface/prop-backed values; the mobile
search-omission fallback lives inside `useMobileViewScopeMatches` in
`use-task-view-states.ts`.

### Two decisions to carry forward (do NOT re-litigate)

- **Step 5 / Phase 3 (child prop trim) was deliberately SKIPPED.** The
  audit found `TaskTree`, `StatusMyTasksTree`, `FeedView`, `KanbanView`
  do **not** accept these store values as props and forward them —
  they read the store hooks themselves and prop-drill. For the
  **recursive** `TreeTaskItem`, self-sourcing would turn one
  subscription into N (one per tree node) for shared scalars
  (`currentUser`, `isInteractionBlocked`), which is worse, not better.
  For the non-recursive leaf cards (`FeedTaskCard`, `KanbanTaskCard`,
  `StatusTimelineItem`) the parent view keeps the hook anyway, so
  moving the read into the card only adds store coupling to a
  presentational component and complicates its unit tests. Net benefit
  judged too low. **Leave the prop-drilling in place.**

- **Step 6 (`useTaskViewFiltering` 9-param signature) is DEFERRED, not
  forgotten.** `src/features/feed-page/controllers/use-task-view-filtering.ts:29`.
  The params (`searchQuery`, `channels`, `people`, `quickFilters`,
  `channelMatchMode`, `focusedTaskId`, `includeFocusedTask`,
  `hideClosedTasks`, `taskPredicate`) genuinely vary across the ~7 call
  sites (neutral vs scoped channels/people, empty vs real query). This
  reflects real flexibility, not god-bloat. `channelMatchMode` *could*
  move inside (always read from `useFilterStore` at the caller), but
  that's a one-param win. **Only touch this if a clearer trim presents
  itself.**

## Governing principle (unchanged)

One source per value; no god-bundles at any layer; no test
escape-hatch props; names reflect actual scope. **Symbol renames are
mechanical — use `jscodeshift`, not `sed -i` (blocked) and not ad-hoc
Python.** One commit per sub-sweep, each independently green.
MemoryRouter-in-tests purely to inject data is an anti-pattern; pass
props / seed stores instead. Never introduce a new store for
focused-task-id.

---

## Part A — Split the three command god-bundles  ⚠️ HISTORICAL / SUPERSEDED

> This section is the ORIGINAL (rejected) approach, kept for context.
> It was NOT executed as written — see the Status note at the top for
> what actually shipped (contexts *collapsed*, not split). Do not
> execute the steps below.

The user's explicit instruction: **"break up rather than renaming."**
So `FeedTaskCommands` / `FeedViewCommands` / `FeedSidebarCommands` are
NOT just renamed to drop the `Feed` prefix — each is decomposed into
concern-specific contexts. Do this BEFORE the naming sweep so the sweep
doesn't rename symbols that are about to be split apart.

Current state (verified): three context files under
`src/features/feed-page/controllers/`:
`feed-task-commands-context.tsx`, `feed-view-commands-context.tsx`,
`feed-sidebar-commands-context.tsx`. Assembled in
`FeedPageProviders.tsx`, produced in `Index.tsx`, consumed broadly
(`FeedTaskCommands` 27 occ / ~9 files; `FeedViewCommands` 18 occ / 3
files; `FeedSidebarCommands` 25 occ / 4 files).

### A.1 `FeedSidebarCommands` (the clearest god-bundle, ~30 methods)

Today one context bundles four unrelated concerns. Split into:

- **`ChannelCommands`** — `pinChannel`, `unpinChannel`, `toggleChannel`,
  `showOnlyChannel`, `toggleAllChannels`, `setChannelMatchMode`.
- **`PeopleCommands`** — `pinPerson`, `unpinPerson`, `togglePerson`,
  `showOnlyPerson`, `toggleAllPeople`.
- **`RelayCommands`** — `selectRelay`, `toggleRelay`, `showOnlyRelay`,
  `toggleAllRelays`, `addRelay`, `reorderRelays`, `removeRelay`,
  `reconnectRelay`.
- **`SavedFilterCommands`** — `applySavedFilter`, `saveCurrentFilter`,
  `renameSavedFilter`, `deleteSavedFilter`.

Each gets its own context + provider + `use*Commands()` hook. Consumers
subscribe only to the concern they use (a channel chip imports
`useChannelCommands`, not the 30-method bundle).

### A.2 `FeedTaskCommands` (15 methods, two concerns)

Split into:

- **`TaskCommands`** — lifecycle/editing: `focusTask`, `createTask`,
  `toggleComplete`, `changeStatus`, `updateDueDate`, `updatePriority`,
  `changeListingStatus`, `deletePost`, `recomposePost`,
  `copyPermalink`, `undoPendingPublish`.
- **`FailedPublishCommands`** — the failed-publish queue:
  `retryFailedPublish`, `repostFailedPublish`, `dismissFailedPublish`,
  `dismissAllFailedPublish`. (Only `FailedPublishQueueBanner` / mobile
  bottom bar use these.)

### A.3 `FeedViewCommands` (5 methods, small + coherent)

`focusSidebar`, `focusTasks`, `setCurrentView`, `setDisplayDepthMode`,
`setManageRouteActive`. This one is already small and single-concern
(imperative view-shell commands). **Do not over-split.** Rename to
`ViewCommands` as part of Part B. Optionally peel `setManageRouteActive`
into a routing concern only if a consumer needs it in isolation —
judgment call, default to leaving it.

### A — sequencing & commits

For each split: create the new concern contexts/providers/hooks →
migrate consumers off the bundle hook to the narrow hook → wire the new
providers in `FeedPageProviders` + produce them in `Index` → delete the
old bundle context. The default (`createContext` default object) makes
each provider independently addable. Commit per bundle:

1. `refactor: split FeedSidebarCommands into channel/people/relay/saved-filter contexts`
2. `refactor: split FeedTaskCommands into task + failed-publish contexts`
3. (`FeedViewCommands` rename folds into Part B.2)

Tests: command-bundle consumers are mocked in several tests
(`TaskCreateComposer.test.tsx`, `UnifiedBottomBar.test.tsx`). Update
mocks to the narrow hooks; do not add MemoryRouter.

---

## Part B — `Feed*` naming sweep (prior plan's Step 8)

Almost everything prefixed `Feed*` predates the era when "feed" was the
only browsing surface. There are now six co-equal surfaces, so
shared infrastructure should drop the prefix. **Run lowest-blast-radius
first, directory rename dead last, one `jscodeshift`-driven commit
each** (include the transform in the commit body for traceability).

Blast radius **re-verified 2026-07-01** (occurrences / files).

### B.1 `useFeedViewState` name collision — ALREADY RESOLVED ✅

Part A **deleted** the UI-state context
(`feed-view-state-context.tsx`), so the collision is gone by deletion,
not renaming. Only the **data** hook remains —
`src/features/feed-page/controllers/use-task-view-states.ts`'s
`useFeedViewState`/`FeedViewState` — and it's genuinely feed-only, so
it keeps its name. Nothing to do here. (If you still want to rename the
data hook for consistency, it's ~4 occ / 3 files, but it's not a
collision fix any more — judgment call, low priority.)

### B.2 Command input-type renames (well-bounded)

These are no longer *contexts* — Part A turned them into plain input
types in
`src/features/feed-page/interactions/feed-interaction-inputs.ts`:
- `FeedViewCommands` → `ViewCommands` (6 occ / 3 files).
- `FeedSidebarCommands` → `SidebarCommands` (7 occ / 3 files) — optional
  but consistent; it's produced by `use-feed-sidebar-commands-controller`
  and consumed by the bus.
- Leave `FeedTaskCommands` alone until
  `composer-shell-ownership-refactor` removes it (see its `// TODO`).
- New in Part A, also `Feed*`-prefixed, fold into whichever sweep fits:
  `FeedInteractionInputs` concept, `FailedPublishCommands`,
  `TaskInteractionCommands` (already unprefixed), and
  `FeedInteractionBusProvider` (renames with B.7).

### B.3 Navigation + shells (small)

- `useFeedNavigation` → `useViewNavigation` (8 occ / 3 files).
- `FeedPageMobileShell` → `MobileShell` (4 occ / 2 files);
  `DesktopAppShell` → `DesktopShell` (4 occ / 2 files). Watch for a
  name clash with `src/components/mobile/` if one exists. (Both shrank
  in Part A — they no longer forward onboarding/view state.)

### B.4 Providers / policy (small-medium)

- `FeedPageProviders` → `BrowsingProviders` (7 occ / 3 files).
- `FeedRelayProvider` → `RelayProvider` (7 occ / 3 files).
- `useFeedAuthPolicy` → `usePostAuthPolicy` (the symbol is the hook in
  `use-feed-auth-policy.ts`; there is no bare `FeedAuthPolicy`) — ~3
  occ / 2 files.

### B.5 View components (medium)

- `TaskTree` → `TreeView` (19 occ / 6 files) — mirrors
  `KanbanView`/`ListView`/`CalendarView`.
- `ListView` → `TableView` (22 occ / 5 files) — it's a tabular/row
  view, not a generic list.

Note: these touch `VIEW_ORDER` / `ViewSwitcher` and route handling —
verify the `/:view` URL slugs are unaffected (slugs are `tree`/`list`,
not the component names, per CLAUDE.md — confirm before renaming).

### B.6 Surface state (broad — grew since 2026-05-29)

- `FeedSurfaceState` (22 occ / 7 files) / `FeedSurfaceProvider` (46 occ
  / 12 files) / `useFeedSurfaceState` (73 occ / **35 files**) →
  `BrowsingSurfaceState` / `BrowsingSurfaceProvider` /
  `useBrowsingSurfaceState` (or shorter `SurfaceState` — pick one and
  apply uniformly). Single jscodeshift pass.

### B.7 Interaction bus (broadest symbol sweep)

- `useFeedInteractionDispatch` → `useInteractionDispatch` (118 occ / **69
  files** — the largest symbol footprint after the directory).
- `FeedInteractionProvider` → `InteractionProvider` (38 occ / 10 files).
- Fold in the Part-A additions: `FeedInteractionBusProvider` →
  `InteractionBusProvider`, and the `feed-interaction-*` module/type
  names if you want full consistency.
- Own commit, jscodeshift only, no logic changes.

### B.8 Directory rename (biggest blast radius — DEAD LAST)

`src/features/feed-page/` → `src/features/posts/` (or keep `feed-page`
meaning "the page hosting the feed and sibling views" if the team
prefers — decide explicitly). **96** ts/tsx files, **372**
`@/features/feed-page` import references. Do this as its own commit with
**no other changes** so the diff is purely path moves + import-path
rewrites. `git mv` the dir, then a single jscodeshift/`grep`-driven
import-path rewrite. Note: onboarding now has repo state outside this
dir (`src/components/onboarding/onboarding-store.ts`) — unaffected by
the move.

---

## Verification (after every commit)

1. `npx tsc -b --force` — zero errors. The baseline-tolerance list that
   used to live here was cleared after the 125-error sweep; `tsc -b`
   is now an enforceable regression signal again.
2. `npx vitest run src/components/tasks src/components/mobile
   src/components/people src/features/feed-page src/domain/auth`
   (path changes after B.8 — adjust to `src/features/posts`). Baseline
   ~500+ green.
3. `npm run lint`.
4. `npm run dev` smoke (after the bigger sweeps): view switching,
   sidebar channel/people/relay toggles, saved-filter apply/save,
   compose + `@`-mention, URL-driven focus, status toggles, failed-publish
   retry/dismiss, onboarding guide composer.

## Commit strategy

Part A first (2 commits + the `FeedViewCommands` rename in B.2). Then
Part B in the B.1 → B.8 order, one jscodeshift-driven commit per
sub-sweep, transform included in each commit body. Never combine a
rename sweep with a logic change. Directory rename is the final,
isolated commit.

## Out of scope (separate plans)

- Step 5 / Phase 3 child prop trim — decided against (see above).
- `useTaskViewFiltering` rewrite — deferred (see above).
- `[hydration-perf]` instrumentation stripping; StatusView slow-render
  investigation; further `useFeedNavigation` splitting beyond the
  rename.
