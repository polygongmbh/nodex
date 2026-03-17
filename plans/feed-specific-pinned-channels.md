# Plan: Feed-Specific, User-Specific Pinned Channels

Channels pinned per view and per user. Each view (feed, tree, list, kanban, calendar, table) has its own pin set, persisted per Nostr pubkey in localStorage.

---

## Context

- `Channel` in `src/types/index.ts`: `id`, `name`, `filterState`, `usageCount` — no per-view pin field today
- `src/lib/filter-preferences.ts` — existing pattern to follow for the new storage module
- `plans/implement-pinned-channels-visible-top.md` — covers global pinned channels + NIP-78 sync; this plan is additive with a per-view dimension
- `channelFilterStates` persisted at `nodex.channel-filters.v1`; pin state will live in a separate key
- `currentView` comes from `useFeedNavigation` in `Index.tsx`; not currently passed to `Sidebar`

---

## 1. Types (`src/types/index.ts`)

```ts
export interface ViewPinnedEntry {
  channelId: string;
  pinnedAt: string;   // ISO timestamp
  order: number;      // insertion order, ascending = older (lower = first in list)
}

export type ViewPinnedChannelsState = Partial<Record<string, ViewPinnedEntry[]>>;

export interface PinnedChannelsState {
  version: 1;
  updatedAt: string;
  byView: ViewPinnedChannelsState;
}

// UI-layer projection — extends Channel with pin metadata for the current view
export interface SidebarChannel extends Channel {
  isPinned?: boolean;
  pinOrder?: number;
}
```

---

## 2. Storage Module (`src/lib/pinned-channels-preferences.ts`) — NEW FILE

Follow the exact pattern of `filter-preferences.ts`. Storage key is user-namespaced:

```
nodex.pinned-channels.${pubkey.slice(0, 8)}.v1
nodex.pinned-channels.guest.v1   // unauthenticated
```

Exported API:

```ts
loadPinnedChannelsState(pubkey?: string): PinnedChannelsState
savePinnedChannelsState(state: PinnedChannelsState, pubkey?: string): void
getPinnedChannelIdsForView(state: PinnedChannelsState, view: string): string[]
pinChannelForView(state: PinnedChannelsState, view: string, channelId: string): PinnedChannelsState
unpinChannelForView(state: PinnedChannelsState, view: string, channelId: string): PinnedChannelsState
isChannelPinnedForView(state: PinnedChannelsState, view: string, channelId: string): boolean
```

All mutation functions are pure (immutable). Validation on load: strip entries with empty `channelId` or non-finite `order`; preserve unknown view keys (forward-compat).

---

## 3. Index.tsx Changes

**New state:**
```ts
const [pinnedChannelsState, setPinnedChannelsState] = useState<PinnedChannelsState>(
  () => loadPinnedChannelsState(user?.pubkey)
);
```

**Persist on change:**
```ts
useEffect(() => {
  savePinnedChannelsState(pinnedChannelsState, user?.pubkey);
}, [pinnedChannelsState, user?.pubkey]);
```

**Reload on user change:**
```ts
useEffect(() => {
  setPinnedChannelsState(loadPinnedChannelsState(user?.pubkey));
}, [user?.pubkey]);
```

**Updated `channelsWithState` memo** — inject stubs for pinned IDs not in derived channels; sort pinned first:
```ts
const channelsWithState: SidebarChannel[] = useMemo(() => {
  const pinnedIds = getPinnedChannelIdsForView(pinnedChannelsState, currentView);
  const pinnedSet = new Set(pinnedIds);
  const existingIds = new Set(channels.map(c => c.id));

  const stubChannels: Channel[] = pinnedIds
    .filter(id => !existingIds.has(id))
    .map(id => ({ id, name: id, usageCount: 0, filterState: 'neutral' as const }));

  return [...channels, ...stubChannels]
    .map(ch => ({
      ...ch,
      filterState: channelFilterStates.get(ch.id) ?? 'neutral',
      isPinned: pinnedSet.has(ch.id),
      pinOrder: pinnedIds.indexOf(ch.id),
    }))
    .sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      if (a.isPinned && b.isPinned) return (a.pinOrder ?? 0) - (b.pinOrder ?? 0);
      return 0;
    });
}, [channels, channelFilterStates, pinnedChannelsState, currentView]);
```

**New handlers:**
```ts
const handleChannelPin = useCallback((id: string) => {
  setPinnedChannelsState(prev => pinChannelForView(prev, currentView, id));
}, [currentView]);

const handleChannelUnpin = useCallback((id: string) => {
  setPinnedChannelsState(prev => unpinChannelForView(prev, currentView, id));
}, [currentView]);
```

**Pass new props to Sidebar:**
```tsx
<Sidebar
  ...
  pinnedChannelIds={new Set(getPinnedChannelIdsForView(pinnedChannelsState, currentView))}
  onChannelPin={handleChannelPin}
  onChannelUnpin={handleChannelUnpin}
/>
```

---

## 4. Sidebar.tsx Changes

**New props:**
```ts
pinnedChannelIds?: Set<string>;
onChannelPin?: (id: string) => void;
onChannelUnpin?: (id: string) => void;
```

Thread through to each `ChannelItem`.

**Collapsed preview sort** — pinned channels always appear in preview:
```ts
const sortedForPreview = [...channels].sort((a, b) => {
  const ap = (a as SidebarChannel).isPinned ? 1 : 0;
  const bp = (b as SidebarChannel).isPinned ? 1 : 0;
  if (ap !== bp) return bp - ap;
  return (b.usageCount ?? 0) - (a.usageCount ?? 0);
});
```

---

## 5. ChannelItem.tsx Changes

**New props:**
```ts
isPinned?: boolean;
onPin?: () => void;
onUnpin?: () => void;
```

**Pin button** — rendered at trailing end, visible on hover (hidden when unpinned, always shown when pinned):
```tsx
<button
  onClick={(e) => { e.stopPropagation(); isPinned ? onUnpin?.() : onPin?.(); }}
  title={isPinned ? t("sidebar.filters.unpinChannelFromView", { name }) : t("sidebar.filters.pinChannelToView", { name })}
  className={cn(
    "ml-auto transition-opacity",
    isPinned ? "opacity-100" : "opacity-0 group-hover:opacity-60 hover:!opacity-100"
  )}
>
  <Pin className={cn("w-3 h-3", isPinned && "text-primary fill-primary")} />
</button>
```

---

## 6. i18n

Add to `en/common.json` (and `de`, `es`):
```json
"sidebar.filters.pinChannelToView": "Pin #{{name}} to this view",
"sidebar.filters.unpinChannelFromView": "Unpin #{{name}} from this view"
```

---

## 7. Tests

### `src/lib/pinned-channels-preferences.test.ts` (new)
- `load` returns empty state on missing/corrupt localStorage
- Strips entries with empty `channelId`
- `pin` inserts into correct view bucket; idempotent
- `unpin` removes from correct bucket; leaves other views unchanged
- `getIds` returns stable order
- `isChannelPinnedForView` correct true/false
- Per-user key isolation (different pubkeys → different states)
- Guest key used when pubkey absent

### `src/pages/Index.tsx` (integration)
- `channelsWithState` injects stub for pinned ID not in derived channels
- `channelsWithState` sorts pinned before unpinned
- `handleChannelPin` updates state for current view only
- `handleChannelUnpin` does not affect other views

### `src/components/layout/sidebar/ChannelItem.test.tsx` (add)
- Pin button renders when `onPin` provided
- `opacity-0` present when `isPinned=false`
- Pin icon has active style when `isPinned=true`
- Click calls `onPin`, not `onToggle`
- Click calls `onUnpin` when pinned

---

## 8. Implementation Order

1. `src/lib/pinned-channels-preferences.ts` + its tests
2. `src/types/index.ts` — add `ViewPinnedEntry`, `PinnedChannelsState`, `SidebarChannel`
3. `src/pages/Index.tsx` — state, effects, memo, handlers, prop pass-down
4. `src/components/layout/Sidebar.tsx` — new props + collapsed preview sort
5. `src/components/layout/sidebar/ChannelItem.tsx` — pin button UI
6. Locale files
7. Integration and component tests

---

## Edge Cases

- **Signed-out user:** guest key; pins work without pubkey
- **Sign in:** reload from pubkey key; guest pins are not migrated
- **Sign out:** reload from guest key; previous user's pins remain in their own key
- **Channel not in feed:** shown as stub `#<id>`, replaced by real channel object when it appears
- **Filter reset / onboarding:** `channelFilterStates` reset does not affect pin state (correct — pins are persistent preferences)
- **Saved filter configurations:** orthogonal to pins; no change needed
- **Relationship to `implement-pinned-channels-visible-top.md`:** that plan uses a flat list for NIP-78 sync. When merged, the `byView` structure is a superset and the storage modules can be unified.
