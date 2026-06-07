# Command-bundle split + `Feed*` naming sweep

Successor to `counting-roughly-effervescent-nebula.md` (Phases 1–2
done) and `ancient-riding-dewdrop.md` (Steps 1–4 done, Step 7 done).
This plan covers the two remaining tranches of the post-browsing
refactor: **(A) splitting the three command god-bundles** and **(B) the
`Feed*` naming sweep (prior plan's Step 8).**

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

## Part A — Split the three command god-bundles

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

Blast radius verified 2026-05-29 (files / occurrences):

### B.1 `useFeedViewState` name collision (do first — it's a correctness trap)

There are **two** `useFeedViewState`:
- `src/features/feed-page/controllers/use-task-view-states.ts:634` —
  the **data** derivation, genuinely feed-only. **Keep this name.**
- `src/features/feed-page/views/feed-view-state-context.tsx:39` — the
  **UI state** shared by all views (`currentView`, onboarding flags,
  `profileCompletionPromptSignal`, `displayDepthMode`). **Rename this
  one → `useViewState`** (and `FeedViewState` ctx type → `ViewState`).

10 files / 16 occ total across both — small, but disambiguate carefully
(rename only the context one). Resolving the collision first makes
every later sweep unambiguous.

### B.2 Command-context renames (well-bounded; after Part A)

- `FeedViewCommands` → `ViewCommands` (18 occ / 3 files).
- The new contexts from Part A are born correctly named, so the only
  `Feed*` command symbol left to rename is `FeedViewCommands`.

### B.3 Navigation + shells (small)

- `useFeedNavigation` → `useViewNavigation` (8 occ / 3 files).
- `FeedPageMobileShell` → `MobileShell` (6 occ / 2 files);
  `DesktopAppShell` → `DesktopShell` (6 occ / 2 files). Watch for a
  name clash with `src/components/mobile/` if one exists.

### B.4 Providers / policy (small-medium)

- `FeedPageProviders` → `BrowsingProviders` (9 occ / 3 files).
- `FeedRelayProvider` → `RelayProvider` (7 occ / 3 files).
- `FeedAuthPolicy` → `PostAuthPolicy` (5 occ / 2 files).

### B.5 View components (medium)

- `TaskTree` → `TreeView` (23 occ / 6 files) — mirrors
  `KanbanView`/`ListView`/`CalendarView`.
- `ListView` → `TableView` (29 occ / 6 files) — it's a tabular/row
  view, not a generic list.

Note: these touch `VIEW_ORDER` / `ViewSwitcher` and route handling —
verify the `/:view` URL slugs are unaffected (slugs are `tree`/`list`,
not the component names, per CLAUDE.md — confirm before renaming).

### B.6 Surface state (broad — 33 files / 92 occ)

- `FeedSurfaceState` / `FeedSurfaceProvider` / `useFeedSurfaceState` →
  `BrowsingSurfaceState` / `BrowsingSurfaceProvider` /
  `useBrowsingSurfaceState` (or shorter `SurfaceState` — pick one and
  apply uniformly). Single jscodeshift pass.

### B.7 Interaction bus (broadest symbol sweep — 57 files / 98 occ +
`FeedInteractionProvider` 40 occ / 10 files)

- `FeedInteractionProvider` → `InteractionProvider`;
  `useFeedInteractionDispatch` → `useInteractionDispatch`. Largest
  symbol footprint after the directory — own commit, jscodeshift only,
  no logic changes.

### B.8 Directory rename (biggest blast radius — DEAD LAST)

`src/features/feed-page/` → `src/features/posts/` (or keep `feed-page`
meaning "the page hosting the feed and sibling views" if the team
prefers — decide explicitly). 94 ts/tsx files, **332** `@/features/feed-page`
import references. Do this as its own commit with **no other changes**
so the diff is purely path moves + import-path rewrites. `git mv` the
dir, then a single jscodeshift/`grep`-driven import-path rewrite.

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
