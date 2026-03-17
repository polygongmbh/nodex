# Implement Pinned Channels (Always Visible + Top)

## Goal
Add user-pinned channels that:
- always appear in channel lists even when usage is low or zero
- are always ordered at the top of channel sections
- persist per-user (with local fallback)

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
  - `localStorage` key `nodex.pinned-channels.v1`
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

1. Add pinned channel persistence module.
- New file: `src/lib/pinned-channels-preferences.ts`
- Responsibilities:
  - validate/load/save local fallback
  - normalize IDs (lowercase, trim)
  - toggle pin/unpin helpers
  - deterministic ordering helpers

2. Add NIP-78 pinned channel sync adapter.
- New file: `src/lib/nostr/pinned-channels-sync.ts`
- Responsibilities:
  - fetch by `kind:30078` + `#d=['nodex.pinned-channels.v1']`
  - publish replaceable app-data event
  - map payload <-> local domain model
  - reconcile local and remote with `updatedAt` precedence

3. Integrate pinned state in `Index` page channel derivation.
- File: `src/pages/Index.tsx`
- Add state:
  - `pinnedChannelsState` loaded from local fallback
- During channel derivation:
  - merge derived channels + pinned channel IDs (inject missing pinned channels with `usageCount: 0`)
  - project final ordered list: pinned first by `order`, then existing behavior for unpinned
  - keep `channelFilterStates` compatibility unchanged

4. Add pin actions to UI surfaces.
- Desktop sidebar: `src/components/layout/Sidebar.tsx`
  - add pin/unpin affordance per channel row
  - ensure collapsed preview prioritizes pinned channels
- Mobile manage filters: `src/components/mobile/MobileFilters.tsx`
  - same pin/unpin affordance
- Optional parity: `src/components/mobile/UnifiedBottomBar.tsx`
  - show pinned channels first in selector panel

5. Wire persistence and sync lifecycle.
- On pin/unpin:
  - update local state immediately
  - save local fallback immediately
  - debounce publish to NIP-78 when signed-in
- On sign-in/hydration:
  - bootstrap local first
  - fetch remote pinned state
  - reconcile and apply once
  - loop prevention via last-applied checksum/ref

6. i18n + UX details.
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
  - `src/lib/pinned-channels-preferences.ts`
  - `src/lib/pinned-channels-preferences.test.ts`
  - `src/lib/nostr/pinned-channels-sync.ts`
  - `src/lib/nostr/pinned-channels-sync.test.ts`
- Updated:
  - `src/pages/Index.tsx`
  - `src/components/layout/Sidebar.tsx`
  - `src/components/mobile/MobileFilters.tsx`
  - `src/components/mobile/UnifiedBottomBar.tsx` (if included)
  - locale json files for labels/tooltips

## Out of Scope
- Drag-and-drop pin reordering UI (can be follow-up).
- Server-side relay preferences beyond NIP-78 event.
