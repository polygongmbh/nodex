# Plan: Extract Shared Pinned Sidebar Controller

## Goal

Reduce the duplicated controller scaffolding in:

- [src/features/feed-page/controllers/use-pinned-sidebar-channels.ts](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-pinned-sidebar-channels.ts)
- [src/features/feed-page/controllers/use-pinned-sidebar-people.ts](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-pinned-sidebar-people.ts)

without collapsing channels and people into one opaque mega-hook.

The target is:

- one shared controller helper for the repeated pin-state orchestration
- two thin feature hooks that keep entity-specific semantics readable

## Current Assessment

The real shared logic is already generic in lower layers:

- [src/domain/preferences/pinned-entity-state.ts](/Users/tj/IT/nostr/nodex/src/domain/preferences/pinned-entity-state.ts)
- [src/infrastructure/preferences/pinned-entity-storage.ts](/Users/tj/IT/nostr/nodex/src/infrastructure/preferences/pinned-entity-storage.ts)

What is still duplicated in the two feature hooks:

- load state from storage for `userPubkey`
- reload state when `userPubkey` changes
- persist state when local state changes
- derive `activeRelayIdList`
- derive current pinned ids for active relays
- expose `handlePin` / `handleUnpin` around relay-target selection

What is not truly duplicated:

- extracting entity-to-relay presence from tasks
- entity id normalization rules
- pinned stub construction
- final entity list shaping for `Channel` vs `Person`

## Architecture Steer

- Keep `usePinnedSidebarChannels` and `usePinnedSidebarPeople` as separate exported hooks.
- Do not create a single `usePinnedSidebarEntities` API that requires many behavior callbacks in-page.
- Prefer one shared helper under `src/features/feed-page/controllers/` that owns only the repeated controller mechanics.
- Keep all pure relay-scoped pin state rules in `domain/preferences/`.
- Keep storage wiring in `infrastructure/preferences/`.

## Proposed Shape

### New shared helper

Add a controller-level helper, likely one of:

- `src/features/feed-page/controllers/use-pinned-sidebar-entity-state.ts`
- or `src/features/feed-page/controllers/use-pinned-sidebar-entity-controller.ts`

It should own:

- local pinned state initialization
- reload on `userPubkey` change
- persistence on state change
- `activeRelayIdList`
- `pinnedIds`
- generic `pinForRelays` / `unpinFromRelays` wrappers

Suggested input shape:

```ts
usePinnedSidebarEntityState({
  userPubkey,
  effectiveActiveRelayIds,
  loadState,
  saveState,
  getPinnedIdsForRelays,
  pinForRelays,
  unpinFromRelays,
})
```

Suggested output shape:

```ts
{
  state,
  setState,
  activeRelayIdList,
  pinnedIds,
  pinAcrossRelays,
  unpinAcrossRelays,
}
```

This helper should not know anything about:

- `Task`
- `Channel`
- `Person`
- task-tag parsing
- author normalization
- stub generation

### Channels adapter remains responsible for

- building `channelRelayIds` from `task.tags`
- merging `channelFilterStates`
- creating missing pinned `Channel` stubs
- ordering `channelsWithState`
- choosing relay targets for `handleChannelPin`

### People adapter remains responsible for

- building `personRelayIds` from `task.author.id`
- person-id normalization
- creating missing pinned `Person` stubs
- ordering `peopleWithState`
- choosing relay targets for `handlePersonPin`

## Milestones

### Milestone 1: Extract shared pin-state controller scaffold

Create the shared helper and move only the repeated state/storage/relay-list logic into it.

Success criteria:

- both hooks use the helper
- public hook behavior stays unchanged
- no task/entity-specific logic moves into the helper

### Milestone 2: Extract tiny pure list helpers only if they remain obvious

After Milestone 1, reassess whether there is still clean duplication in:

- “sort entities by pinned order”
- “prepend pinned-but-missing stubs”
- “build relay-membership map from tasks with an extractor”

Only extract these if the helper APIs stay simple and more readable than the two local implementations.

Possible pure helper targets:

- `buildEntityRelayIdsFromTasks(tasks, getIdsFromTask, normalizeId?)`
- `mergePinnedEntities(pinnedIds, entities, buildStub, getEntityId, normalizeId?)`

Do not do this if it turns into callback soup.

### Milestone 3: Tighten tests around the shared boundary

Add focused tests for:

- shared helper state lifecycle
- channel adapter still pinning by tag relay scope
- people adapter still pinning by author relay scope
- stub ordering remains unchanged for both entities

## Explicit Non-Goals

- Do not merge channels and people into one exported hook.
- Do not move feature-controller logic into `domain/` just to deduplicate React code.
- Do not change storage format.
- Do not change pin ordering semantics.
- Do not add NIP-78 or remote sync work as part of this refactor.

## Commit Strategy

Recommended sequence:

1. `refactor: extract shared pinned sidebar entity state helper`
2. `refactor: simplify pinned channel and people sidebar hooks`
3. `test: harden pinned sidebar controller coverage`

If Milestone 2 yields only trivial cleanup, fold it into step 1 instead of forcing an extra commit.

## Verification

Minimum per milestone:

- `npx vitest run src/features/feed-page/controllers/use-pinned-sidebar-channels.test.tsx src/features/feed-page/controllers/use-pinned-sidebar-people.test.tsx`
- `npm run build`

If the helper becomes broadly shared or the hook contracts shift materially:

- `npm run lint`
- `npx vitest run`
- `npm run build`

## Decision Checkpoint

After extracting the shared controller scaffold, stop and reassess:

- If the remaining duplication is only entity semantics, keep the hooks separate and stop.
- If a second layer of extraction still reads clearly as pure data helpers, do that in a follow-up.

Do not keep abstracting once the remaining code is primarily “channels are channels” and “people are people”.
