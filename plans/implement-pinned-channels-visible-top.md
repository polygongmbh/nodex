# Implement Pinned Channels (Always Visible + Top)

## Goal
Add user-pinned channels that:
- always appear in channel lists even when usage is low or zero
- are always ordered at the top of channel sections
- persist per-user (with local fallback)

## Current Status

The local-only foundation is already landed:
- domain state lives under `src/domain/preferences/pinned-channel-state.ts`
- local persistence lives under `src/infrastructure/preferences/pinned-channels-storage.ts`
- sidebar pin/unpin UI exists on desktop channel rows
- pinned channels already stay visible and ordered first in the sidebar path

What is not landed yet:
- NIP-78 sync
- mobile pin/unpin UI parity
- selector-panel parity in mobile composer/filter surfaces
- cross-device reconciliation

## Product Behavior Contract
1. Pin/unpin action exists on channel rows/chips in desktop and mobile filter surfaces.
2. Pinned channels render before non-pinned channels.
3. Pinned channels stay visible even if `deriveChannels` would normally exclude them.
4. Within pinned group, keep stable user-defined order (manual pin order, newest pin first or drag-order later).
5. Non-pinned channels continue existing sort behavior.
6. Pinned state is user-specific, not global.

## Storage + Sync Scope
- Primary sync: NIP-78 split event
  - `kind: 30078`
  - `['d', 'nodex.pinned-channels.v1']`
  - content: versioned JSON list of pinned channel ids + timestamps/order.
- Local fallback cache (for startup/offline/unsigned):
  - current implementation already persists per-user local pinned state through `pinned-channels-storage.ts`
- No encryption required (metadata visibility accepted).

## Data Model

### New payload contract
```ts
interface PinnedChannelsStateV1 {
  version: 1;
  updatedAt: string; // ISO
  pinned: Array<{
    channelId: string;
    pinnedAt: string; // ISO
    order: number; // stable ordering
  }>;
}
```

### Local domain model
- Add pinned metadata to UI channel projection (not base `Channel` wire model unless needed):
  - `isPinned: boolean`
  - `pinOrder?: number`

## Implementation Steps

1. Keep the landed local state as the baseline.
- Existing modules:
  - `src/domain/preferences/pinned-channel-state.ts`
  - `src/infrastructure/preferences/pinned-channels-storage.ts`
  - `src/features/feed-page/controllers/use-pinned-sidebar-channels.ts`

2. Add NIP-78 pinned channel sync adapter.
- New file: `src/infrastructure/nostr/` or `src/lib/nostr/` depending on the current architecture choice for app-data sync
- Responsibilities:
  - fetch by `kind:30078` + `#d=['nodex.pinned-channels.v1']`
  - publish replaceable app-data event
  - map payload <-> local domain model
  - reconcile local and remote with `updatedAt` precedence

3. Finish mobile parity.
- `src/components/mobile/MobileFilters.tsx`
  - add the same pin/unpin affordance that desktop sidebar rows already have
- optional parity:
  - `src/components/mobile/UnifiedBottomBar.tsx`
  - any channel selector panels should respect pinned-first ordering if they expose channels directly

4. Wire sync lifecycle.
- On pin/unpin:
  - update local state immediately
  - save local fallback immediately
  - debounce publish to NIP-78 when signed-in
- On sign-in/hydration:
  - bootstrap local first
  - fetch remote pinned state
  - reconcile and apply once
  - loop prevention via last-applied checksum/ref

5. i18n + UX details.
- Add labels/tooltips for pin actions in locale files.
- Optional visual indicator (pin icon) for pinned channels.
- Keep keyboard navigation and accessibility labels intact.

## Sorting/Visibility Rules (Exact)
- Final channel list = `PinnedVisible + UnpinnedVisible`
- `PinnedVisible`:
  - all pinned IDs, even if not present in current derived set
  - sorted by explicit `order` (then `pinnedAt`, then name)
- `UnpinnedVisible`:
  - existing derived channels excluding pinned IDs
  - preserve existing ordering semantics

## Edge Cases
- Pinned ID not currently in feed data: still show as `#<id>` with `usageCount: 0`.
- Channel appears via feed later: keep pinned order, update metadata normally.
- Deleted/invalid IDs in payload: ignore during parse.
- Multi-device conflict: event with newer `updatedAt` wins.
- Signed-out user: local fallback only.

## Testing Plan

### Unit tests
- `pinned-channels-preferences`:
  - parse/validation failure fallback
  - toggle semantics
  - deterministic ordering
- `pinned-channels-sync`:
  - payload mapping
  - reconcile conflict behavior (`updatedAt` precedence)

### Integration/component tests
- `Index`:
  - pinned channels are injected even when not derived
  - pinned-first ordering
- `Sidebar` and `MobileFilters`:
  - pin/unpin controls update render order immediately
- Optional `UnifiedBottomBar`:
  - selector ordering reflects pinned-first

### Regression checks
- Existing channel filter toggling still works.
- Saved filter configurations remain compatible.
- No changes to non-pinned sort behavior for unpinned channels.

## Milestones
1. Milestone A: local pinned state + UI ordering (no relay sync yet)
2. Milestone B: NIP-78 sync for pinned channels
3. Milestone C: polish/accessibility + conflict hardening
4. Milestone D: refactor pass (separate commit per AGENTS policy)

## File Touch Forecast
- New:
  - `src/lib/nostr/pinned-channels-sync.ts`
  - `src/lib/nostr/pinned-channels-sync.test.ts`
- Updated:
  - `src/components/mobile/MobileFilters.tsx`
  - `src/components/mobile/UnifiedBottomBar.tsx` (if included)
  - locale json files for labels/tooltips

## Out of Scope
- Drag-and-drop pin reordering UI (can be follow-up).
- Server-side relay preferences beyond NIP-78 event.
