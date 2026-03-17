# Plan: Finish Splitting `src/pages/Index.tsx`

## Goal

Reduce [`src/pages/Index.tsx`](/Users/tj/IT/nodex/src/pages/Index.tsx) from ~867 lines to a composition root closer to ~450-600 lines, without changing route contracts or task/feed behavior.

This plan supersedes the older broad split plan by pruning already-landed work and focusing only on the remaining seams.

Architecture steer:

- do not keep solving this with more root-level `src/hooks/use-index-*` files
- future extractions should prefer:
  - `src/features/feed-page/controllers/` for feed-page orchestration
  - `src/domain/*` for pure reusable rules
  - `src/infrastructure/*` for Nostr/storage/browser adapters

This plan should now be executed in alignment with [multi-frontend-domain-architecture.md](/Users/tj/IT/nodex/plans/multi-frontend-domain-architecture.md), not as an isolated page-cleanup exercise.

## Already Extracted

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
- `completion-cheer.ts`
- onboarding overlay dedupe

`Index.tsx` is no longer the main owner of feed navigation, filter orchestration, onboarding state, publish queue logic, task status control, derived task/channel data, or relay/sidebar pinning. The remaining size is now concentrated in cross-controller composition, a few page-owned publish/bootstrap branches, and large layout wiring.

## What Still Smells

- `handleListingStatusChange` is still a page-owned publish branch
- onboarding bootstrap still crosses domains through `ensureGuideDataAvailable`
- `selectedRelayUrls` still lives in the page solely to support profile hydration
- the sidebar boundary is incomplete because `Index` still calls `getPinnedChannelIdsForView(...)` directly
- `Index` still owns a large “compose view props + render current view + choose mobile/desktop shell” block
- route/auth/presence shell concerns still sit together in one page component:
  - auth modal route wiring
  - presence publish effects
  - guide bootstrap
  - desktop/mobile layout composition
## Remaining Milestone A: Extract Listing Status Publish Branch

Move `handleListingStatusChange` out of the page into a dedicated feed-page controller or helper.

Preferred shape:

- `src/features/feed-page/controllers/use-listing-status-publish.ts`

### Why

It is now the last obvious page-owned publish branch and sits awkwardly next to already-extracted status and publish controllers.

## Remaining Milestone B: Isolate Onboarding Bootstrap

This is probably the final cleanup pass, not the next step.

### Candidates

- `ensureGuideDataAvailable`
- maybe a tiny `use-guide-demo-bootstrap.ts` or `use-feed-demo-bootstrap.ts`

### Why Now

The larger controller extractions are already done. This is now one of the main remaining cross-domain branches in the page.

## Remaining Milestone C: Finish Sidebar Boundary

Complete the sidebar boundary so `Index` no longer needs direct pinned-channel derivation calls.

### Candidates

- return `pinnedChannelIds` from `usePinnedSidebarChannels`
- consider moving `selectedRelayUrls` into `useIndexRelayShell` or `useKind0People` input preparation
- remove direct `getPinnedChannelIdsForView(...)` usage from the page

### Why

The page currently still knows too much about how the sidebar pinning model is computed.

## Remaining Milestone D: Consolidate Feed-Page Composition

After the last page-owned branches are extracted, decide whether to stop or do one final composition cleanup.

### Candidates

- move current root-level feed-page hooks under `src/features/feed-page/controllers/`
- introduce `use-feed-page-controller.ts` that assembles:
  - derived data
  - filters
  - relay shell
  - publish/status handlers
- leave `Index.tsx` as route/layout composition only

### Why

The remaining size is now mostly composition. A final consolidation may improve structure more than another small extraction.

## Recommended Order

1. Extract listing status publish branch.
2. Extract guide/demo bootstrap.
3. Finish sidebar boundary.
4. Decide whether to consolidate feed-page composition under `features/feed-page/controllers`.

## Success Criteria

- `Index.tsx` under ~600 lines, or clearly justified as a thin composition shell
- only light composition memos/props remain
- no page-owned publish/bootstrap side branches remain
- child component props stay stable unless a focused simplification is intentional

## Verification Strategy

For each milestone:

1. Add focused tests for the new hook/helper.
2. Run `npx eslint` on touched files.
3. Run targeted Vitest coverage for the extracted area.
4. Run `npm run build`.

For the final major cleanup milestone:

1. `npm run lint`
2. `npx vitest run`
3. `npm run build`

## Current Best Next Step

Extract the listing status publish branch first.

Reason:

- it is now the clearest remaining page-owned business branch
- it is adjacent to already-extracted publish/status logic
- it should shrink `Index` without reopening the larger controller extractions

Additional steer:

- if a proposed extraction still requires large numbers of page setters and page-local assumptions, it probably belongs in `features/feed-page/controllers`, not in `src/hooks` and not in `src/domain`
