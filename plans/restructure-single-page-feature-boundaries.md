# Restructure Single-Page Feature Boundaries

## Goal

Replace the current page-centric `src/features/feed-page/` boundary with domain/capability-oriented modules that match the actual application shape:
a single-screen app composed from task, filter, relay, onboarding, auth, and shell concerns.

## Why This Restructure

`feed-page` currently acts as a catch-all for:

- task/feed state and publish flows
- channel/people/quick filter state
- relay selection and scoped presence
- onboarding and auth-adjacent route behavior
- view coordination and shell providers

That boundary is misleading because the app does not have multiple independently significant pages.
It encourages coupling by location in the render tree instead of by product responsibility.

## Target Architecture

### Top-level structure

Proposed target:

- `src/app/`
  - composition roots and app shell wiring
- `src/features/tasks/`
  - task view models, task status/publish flows, task-specific interaction logic
- `src/features/filters/`
  - channel filters, people filters, quick filters, saved filters, URL sync
- `src/features/relays/`
  - relay selection, relay shell state, reconnect, relay-scoped presence
- `src/features/onboarding/`
  - onboarding flows, intro/help overlays, onboarding-driven auth prompts
- `src/features/auth/`
  - auth policy and profile-completion prompts
- `src/features/navigation/`
  - app navigation state if it remains distinct enough to justify its own slice
- `src/features/shell/`
  - top-level layout providers, desktop/mobile shell composition, shared page surface contexts

### Boundary rules

- `features/*` should represent stable product capabilities, not route names.
- `app/` or `shell/` composes capabilities together but owns minimal business logic.
- Context providers should live with the state they expose, not with whichever page first needed them.
- Cross-feature orchestration hooks should be rare and named explicitly as composition hooks.
- Reusable UI components should remain in `src/components/` unless they become tightly coupled to one feature’s domain behavior.

## Current-to-Target Mapping

### Move out of `feed-page/controllers`

- `use-index-filters` -> `features/filters/controllers/use-filters`
- `use-saved-filter-configs` -> `features/filters/controllers/use-saved-filter-configs`
- `use-filter-url-sync` -> `features/filters/controllers/use-filter-url-sync`
- `use-task-scope-specific-filters` -> `features/filters/controllers/use-task-scope-specific-filters`
- `use-relay-filter-state` -> `features/filters/controllers/use-relay-filter-state`
- `use-relay-selection-controller` -> `features/relays/controllers/use-relay-selection-controller`
- `use-index-relay-shell` -> `features/relays/controllers/use-relay-shell`
- `use-relay-auto-reconnect` -> `features/relays/controllers/use-relay-auto-reconnect`
- `use-relay-scoped-presence` -> `features/relays/controllers/use-relay-scoped-presence`
- `use-task-publish-flow` -> `features/tasks/controllers/use-task-publish-flow`
- `use-task-publish-controls` -> `features/tasks/controllers/use-task-publish-controls`
- `use-task-status-controller` -> `features/tasks/controllers/use-task-status-controller`
- `use-listing-status-publish` -> `features/tasks/controllers/use-listing-status-publish`
- `use-task-view-states` -> `features/tasks/controllers/use-task-view-states`
- `use-index-derived-data` -> split if needed:
  - task derivation pieces -> `features/tasks/controllers/`
  - filter derivation pieces -> `features/filters/controllers/`
  - composition-only residue -> `app/controllers/` or `features/shell/controllers/`
- `use-index-onboarding` -> `features/onboarding/controllers/use-onboarding`
- `use-auth-modal-route` -> likely `features/auth/controllers/use-auth-modal-route`
- `use-feed-auth-policy` -> likely `features/auth/controllers/use-feed-auth-policy`
- `use-feed-navigation` -> `features/navigation/controllers/use-app-navigation` unless it proves too small
- `use-index-feed-interaction-bus` -> `features/tasks/interactions/` or `features/shell/interactions/` depending on final ownership
- frecency/pinned-sidebar/focused-preview hooks -> relocate based on whether they are task, shell, or filter concerns

### Move out of `feed-page/views`

- `FeedPageDesktopShell` -> `features/shell/views/AppDesktopShell`
- `FeedPageMobileShell` -> `features/shell/views/AppMobileShell`
- `FeedPageSidebar` -> `features/shell/views/AppSidebar` unless it becomes relay/filter-specific
- `FeedPageViewPane` -> `features/tasks/views/TaskViewPane`
- `FeedPageProviders` -> split by owning context; keep only a thin top-level composer in `features/shell/views/`
- `feed-page-ui-config` -> `features/shell/views/app-ui-config`
- `feed-task-view-model-context` -> `features/tasks/views/task-view-model-context`
- `feed-view-state-context` -> `features/tasks/views/task-view-state-context` or `features/shell/views/` depending on state ownership
- `feed-surface-context` -> likely `features/shell/views/feed-surface-context` or renamed to remove “feed”

### Move out of `feed-page/interactions`

- keep the interaction pipeline, intents, and dispatch context with the feature that owns the majority of dispatched actions
- if interactions span tasks, filters, relays, and shell equally, introduce `src/features/workspace/interactions/` or `src/app/interactions/` rather than keeping `feed-page`

## Refactor Strategy

Use a staged migration.
Do not do a single giant move.

### Phase 1: Define target boundaries

- inventory every module under `src/features/feed-page/`
- classify each file as `tasks`, `filters`, `relays`, `onboarding`, `auth`, `navigation`, `shell`, or `app`
- identify files that are composition roots rather than true domain logic
- identify context providers whose names encode obsolete “feed-page” assumptions

Deliverable:
a mapping table checked into the working notes for the refactor, not committed if it remains temporary

### Phase 2: Create destination folders and naming conventions

- create the new top-level feature directories
- establish naming conventions that remove `index-` and `feed-page-` prefixes where they are no longer meaningful
- keep imports stable by moving one cohesive slice at a time

Rules:

- prefer semantic names like `use-task-publish-flow` over location names like `use-index-*`
- reserve `app` or `shell` for composition, layout, and provider assembly

### Phase 3: Move the shell first

- extract desktop/mobile shell, providers, and high-level view composition into `features/shell`
- keep behavior unchanged
- avoid mixing filter/task/relay logic moves into this first pass

Reasoning:
the shell layer is the clearest place to remove the page-centric naming without destabilizing domain logic

### Phase 4: Move filters and relays into separate capabilities

- relocate filter state, saved filters, URL sync, scope-specific filter helpers
- relocate relay selection, relay shell, presence, reconnect behavior
- update test locations alongside code moves

Reasoning:
filters and relays are distinct product concerns and currently over-coupled by `feed-page`

### Phase 5: Move task orchestration and task view state

- relocate publish flow, status flow, task view state, task-derived models, and view pane logic
- rename contexts to task/workspace-oriented names
- keep presentational task components in `src/components/tasks/` unless deeper co-location becomes justified

### Phase 6: Extract onboarding and remaining auth/navigation concerns

- move onboarding into its own feature
- decide whether navigation remains a standalone slice or should be absorbed by shell/app composition
- collapse any thin wrapper hooks that only exist because of previous folder boundaries

### Phase 7: Cleanup and convergence

- remove `src/features/feed-page/` entirely
- normalize import paths
- rename leftover “feed-page”, “feed”, and “index” identifiers that no longer describe the behavior
- remove compatibility shims once the tree is stable

## Testing and Verification Plan

This is a major cross-view refactor under repo policy.
Required verification when implementation happens:

- `npm run lint`
- `npx vitest run`
- `npm run build`

During each migration phase:

- run focused tests for the slice being moved before broad verification
- preserve test intent while updating paths and names
- add coverage only where the move exposes missing contracts

## Risks

- large rename churn can obscure behavioral regressions
- contexts may currently bundle multiple responsibilities and resist clean ownership
- some “feed” terminology may reflect real product vocabulary rather than merely old structure
- moving tests and files simultaneously can make history harder to follow if done too broadly

## Guardrails

- do not change user-visible behavior during the structural migration unless unavoidable
- keep commits slice-based and reviewable
- separate pure moves/renames from behavioral fixes
- preserve `Index.tsx` as a thin composition root and reduce it further over time
- avoid introducing a new monolithic replacement bucket such as `workspace-page`

## Recommended Commit Sequence

1. `refactor: extract app shell from feed-page feature`
2. `refactor: move filter controllers out of feed-page`
3. `refactor: move relay controllers out of feed-page`
4. `refactor: move task orchestration into tasks feature`
5. `refactor: extract onboarding and auth-adjacent flow hooks`
6. `refactor: remove remaining feed-page feature boundary`

## Opinionated Recommendation

Do not rename `feed-page` to another page-shaped label.
That would preserve the bad abstraction.

Instead:

- introduce `features/shell` plus real domain slices
- move files incrementally by capability
- treat `Index.tsx` as an assembly point, not the architectural center

That path fixes the root problem:
the codebase is currently organized around where code renders, not what responsibility it owns.
