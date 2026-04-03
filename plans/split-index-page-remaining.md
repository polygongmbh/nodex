# Plan: Consolidate the Remaining `Index.tsx` Split

## Goal

Reduce [`src/pages/Index.tsx`](/Users/tj/IT/nostr/nodex/src/pages/Index.tsx) from its current `1179` lines into a thin route/composition shell, without changing route contracts or feed/task behavior.

This file is now the single source of truth for the `Index.tsx` split work.
It supersedes the older Index-related guidance that was scattered across:

- [post-architecture-next-steps.md](/Users/tj/IT/nostr/nodex/plans/post-architecture-next-steps.md)
- [multi-frontend-domain-architecture.md](/Users/tj/IT/nostr/nodex/plans/multi-frontend-domain-architecture.md)

## Architecture Steer

- Do not solve this by adding more root-level `src/hooks/use-index-*` files.
- Prefer real delegation:
  - `src/features/feed-page/controllers/` for feed-page orchestration
  - `src/features/feed-page/views/` for desktop/mobile/view composition
  - `src/domain/*` for pure rules
  - `src/infrastructure/*` for Nostr/storage/browser adapters
- Do not create a mega `useFeedPageController` unless the dependency graph becomes materially simpler.
- The target is genuine responsibility reduction, not just moving lines around.

## What Has Already Landed

The page is no longer the primary owner of:

- feed navigation
- filter orchestration
- onboarding state
- publish flow
- task status control
- listing status publishing
- relay-scoped presence publishing
- auth policy derivation
- derived task/channel data
- pinned sidebar channel state
- auth modal route wiring
- desktop/mobile shell extraction
- feed-page UI config/context extraction

Concrete extractions already in place:

- `use-feed-navigation.ts`
- `use-index-filters.ts`
- `use-saved-filter-configs.ts`
- `use-index-onboarding.ts`
- `use-task-publish-controls.ts`
- `use-task-publish-flow.ts`
- `use-task-status-controller.ts`
- `use-index-derived-data.ts`
- `use-pinned-sidebar-channels.ts`
- `use-index-relay-shell.ts`
- `use-auth-modal-route.ts`
- `use-listing-status-publish.ts`
- `use-feed-auth-policy.ts`
- `use-relay-scoped-presence.ts`
- `FeedPageDesktopShell`
- `FeedPageMobileShell`
- `FeedPageViewPane`
- `feed-page-ui-config.tsx`

## Current Reality

Despite the extractions, `Index.tsx` is still larger than before because recent feature work added more top-level assembly than it removed.
The current problem is no longer “missing controllers”; it is that the page still owns too much assembly and adapter work:

- `selectedRelayUrls` is derived in the page and threaded into profile hydration
- onboarding/demo bootstrap still crosses domains through `ensureGuideDataAvailable`
- the sidebar boundary is incomplete because the page still calls `getPinnedChannelIdsForView(...)` directly
- the page still assembles large `mobileViewState`, `desktopHeader`, and `desktopContent` objects
- the page still assembles feed sidebar/controller state before handing it to feature-side providers
- desktop/mobile shell selection, auth wiring, presence wiring, and guide bootstrap still coexist in one component

This means the file is less business-logic-heavy than before, but still too much of an orchestration and config hub.

## Remaining Work

### Milestone 1: Finish the Sidebar Boundary

This is the best next step now that listing-status publishing is already extracted.

Target:
- stop computing pinned-channel view ids directly in `Index.tsx`
- return already-consumable pinned ids from `usePinnedSidebarChannels`
- keep the page unaware of pin derivation details

Preferred shape:
- `usePinnedSidebarChannels` returns `pinnedChannelIds`
- `Index.tsx` passes those ids directly into the sidebar/view shell config

Secondary opportunity:
- review whether `selectedRelayUrls` belongs in `useIndexRelayShell` or another feature controller instead of staying page-local

### Milestone 2: Extract Guide / Demo Bootstrap

Move the remaining bootstrap branch out of the page.

Target:
- `ensureGuideDataAvailable`
- any residual guide/demo loading path that still makes `Index.tsx` know about bootstrap timing

Preferred shape:
- keep it in `src/features/feed-page/controllers/`
- likely as a small feed-page bootstrap hook instead of a generic root hook

Why:
- this is one of the last page-owned cross-domain side-effect branches

### Milestone 3: Collapse View-State Assembly

The largest remaining bulk is not raw business logic, it is the page assembling big prop objects for mobile/desktop shells.

Target:
- shrink or remove page-owned `mobileViewState`
- shrink or remove page-owned `desktopHeader`
- shrink or remove page-owned `desktopContent`

Preferred direction:
- introduce thin feature-side adapter helpers or view config builders under `src/features/feed-page/views/`
- keep `Index.tsx` responsible for choosing desktop vs mobile, not for constructing every nested prop object inline

Guardrail:
- do not create one giant prop-builder if that only hides the complexity
- split by real boundary: sidebar config, shell config, task-pane config, mobile config

### Milestone 4: Re-home the Remaining Relay/Profile Glue

If the page is still too large after the first three milestones, move the relay/profile adapter seams out next.

Best candidates:
- `selectedRelayUrls`
- any profile-hydration preparation currently done in-page purely to satisfy `useKind0People`
- any remaining page-local relay list shaping that is not route wiring

This step should happen only if the earlier boundary work does not shrink the page enough.

## Recommended Order

1. Finish the sidebar boundary.
2. Extract guide/demo bootstrap.
3. Collapse desktop/mobile view-state assembly.
4. Re-home remaining relay/profile glue only if still necessary.

## Explicit Non-Goals

- Do not restart the old “many small hook files” pattern.
- Do not hide the same coupling behind a single mega-controller.
- Do not mix unrelated architecture work such as listings-map or generic domain expansion into this plan.
- Do not rewrite stable child component contracts unless that clearly simplifies a boundary.

## Success Criteria

- `Index.tsx` drops below roughly `500-650` lines, or is otherwise obviously a thin shell
- the page mostly instantiates controllers and selects desktop/mobile layout
- no page-owned bootstrap side branches remain
- no direct pinned-channel derivation logic remains in the page
- the page imports primarily from `features/feed-page/*`, shared components, types, and routing utilities

## Verification Strategy

Per milestone:

1. Add focused tests for the extracted hook/helper/boundary.
2. Run targeted tests for touched files.
3. Run `npm run build`.

Final pass for the full cleanup:

1. `npm run lint`
2. `npx vitest run`
3. `npm run build`

## Decision Checkpoint

If `Index.tsx` is still too large after Milestones 1-3, stop and decide explicitly between:

- one higher-level feed-page presenter object assembled from existing controllers, or
- a few additional feature-side view adapters

Do not guess past that point.
The right next move depends on whether the remaining weight is mostly state assembly or still-hidden orchestration.
