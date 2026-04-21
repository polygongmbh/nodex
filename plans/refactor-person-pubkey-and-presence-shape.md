# Refactor Person Identity, Selection, And Presence Shape

## Goal

Clarify the person model boundaries in the app:

- rename `Person.id` to `Person.pubkey`
- require `Person.pubkey` to always contain normalized lowercase hex
- keep `Task.author` as `Person`
- remove derived presence fields from `Person`
- move UI-only fields such as pin order out of `Person`
- make an explicit decision about whether `isSelected` belongs on `Person`

## Opinionated Direction

Use `Person` as the canonical app-level identity/profile model, keyed by normalized hex pubkey.

Do not collapse the app onto `NDKUser`.

Instead, separate concerns into three layers:

1. `Person`
   Stable app-level identity and profile metadata
2. interactive person state
   Selection and other filter-session state
3. derived presence/view state
   Presence status, view/task context, and pin ordering for specific surfaces

This keeps `Task.author` stable and serializable, while preventing shared domain types from accumulating transient UI state.

## Why Keep A Local `Person` Type Instead Of Using `NDKUser`

The repo currently uses `NDKUser` at the auth/provider boundary and local app types everywhere else.

Representative `NDKUser` usage is concentrated in:

- `src/infrastructure/nostr/provider/*`
- `src/infrastructure/nostr/ndk-context.tsx`
- `src/features/feed-page/controllers/use-index-derived-data.ts`

The rest of the product expects a simpler, app-owned model:

- `Task.author` is `Person` in `src/types/index.ts`
- filtering, mentions, sidebar rendering, tests, fixtures, and mock data all use `Person`

Reasons to keep `Person` separate:

- `NDKUser` is a library object, not a stable domain contract for app state
- the app needs a narrow, serializable shape for tasks, tests, snapshots, and local derived state
- `Person` intentionally carries profile fields the app actually uses, without bringing along NDK instance behavior
- canonicalizing `pubkey` at the `Person` boundary is easier than relying on all `NDKUser` producers/consumers to behave identically
- the app often works with people who are not the currently authenticated `NDKUser`

Recommendation:

- keep `Person` as the app/domain type
- use mapper functions at boundaries to convert `NDKUser` or kind `0` profile data into `Person`

## Current Repo State

### Current `Person` shape

`src/types/person.ts` currently mixes:

- stable identity via `id`
- profile metadata
- interactive state via `isSelected`
- derived presence via `isOnline`, `onlineStatus`, `lastPresenceAtMs`, `presenceView`, `presenceTaskId`
- UI ordering via `pinIndex`

### Current `Task.author`

`Task.author` is already typed as `Person` in `src/types/index.ts`.

That should remain true.

The rename to `pubkey` therefore applies to both:

- standalone person collections
- `task.author`

This is not a separate follow-on decision anymore.

## Proposed Type Boundaries

### Canonical Person

```ts
interface Person {
  pubkey: string; // normalized lowercase 64-char hex
  name: string;
  displayName: string;
  nip05?: string;
  about?: string;
  avatar?: string;
}
```

### Interactive selection state

```ts
interface SelectablePerson extends Person {
  isSelected: boolean;
}
```

### Presence attachment for presence-aware surfaces

```ts
interface PersonPresenceSnapshot {
  state: "online" | "recent" | "offline";
  reportedAtMs?: number;
  context?: {
    view?: string;
    taskId?: string | null;
  };
}
```

### Sidebar-specific view state

```ts
interface SidebarPerson extends SelectablePerson {
  pinIndex?: number;
  presence?: PersonPresenceSnapshot;
}
```

## Decision On `isSelected`

`isSelected` is not part of a stable person identity.

It is interactive filter state.

So, strictly speaking, it should not live on canonical `Person`.

However, it is used broadly enough across the repo that removing it everywhere in the same refactor would expand the blast radius substantially.

Recommendation:

- keep `isSelected` for now, but move it conceptually into a `SelectablePerson` layer
- do not keep `pinIndex` or presence fields on `Person`
- use `SelectablePerson` in filter/controller state and plain `Person` in pure domain data where possible

Practical implementation choice:

- define `Person` without `isSelected`
- define `SelectablePerson = Person & { isSelected: boolean }`
- update stateful controllers/hooks to use `SelectablePerson[]`
- keep `Task.author` as plain `Person`

This gives a defensible boundary without forcing a second large rename later.

## Current Impacted Areas

### Identity key usage

`Person.id` is used broadly as the canonical identity key across:

- `Task.author`
- filtering and selection
- mention resolution
- pinned people state
- current-user matching
- task author lookups
- mobile and sidebar UI item ids

Representative files:

- `src/types/person.ts`
- `src/types/index.ts`
- `src/infrastructure/nostr/people-from-kind0.ts`
- `src/infrastructure/nostr/use-kind0-people.ts`
- `src/lib/mentions.ts`
- `src/domain/content/person-filter.ts`
- `src/domain/content/task-permissions.ts`
- `src/features/feed-page/controllers/use-index-filters.ts`
- `src/components/layout/sidebar/PersonItem.tsx`
- `src/components/people/PersonHoverCard.tsx`

### Presence coupling

Presence-derived fields are currently stored on `Person`:

- `isOnline`
- `onlineStatus`
- `lastPresenceAtMs`
- `presenceView`
- `presenceTaskId`

Presence is currently synthesized in at least two places:

- `src/domain/content/sidebar-people.ts`
- `src/infrastructure/nostr/use-kind0-people.ts`

Main consumers include:

- `src/components/layout/sidebar/PersonItem.tsx`
- `src/components/people/PersonHoverCard.tsx`
- `src/features/feed-page/controllers/use-index-filters.ts`

### UI-state coupling

`pinIndex` is currently on `Person`, but it belongs with sidebar view state rather than person identity.

## Implementation Plan

### 1. Introduce canonical pubkey helpers first

Add or consolidate one helper that:

- accepts hex or `npub`
- returns normalized lowercase hex when valid
- returns `null` or empty when invalid

Preferred home:

- extend `src/lib/nostr/user-facing-pubkey.ts`

Also add a helper for comparing canonical pubkeys so the repo can stop repeating:

- `trim().toLowerCase()`

### 2. Rename `Person.id` to `Person.pubkey` everywhere `Person` is used

This includes `Task.author` because `Task.author` remains `Person`.

Scope:

- `src/types/person.ts`
- `src/types/index.ts`
- kind `0` people derivation
- mention resolution
- person filtering
- task author lookups
- current-user resolution
- task composer/runtime mention mapping
- sidebar/mobile UI
- tests and fixtures

Rule:

- `Person.pubkey` always stores canonical lowercase hex
- display-only helpers may convert it to `npub`

### 3. Split canonical person data from interactive selection state

Define:

- `Person`
- `SelectablePerson`

Then update stateful flows that truly manage selection to use `SelectablePerson[]`.

Likely areas:

- filter controller state
- saved filter snapshots
- URL sync
- task composer environment
- sidebar lists that need toggle behavior

`Task.author` should remain plain `Person`.

### 4. Remove presence fields from `Person`

Delete from `Person`:

- `isOnline`
- `onlineStatus`
- `lastPresenceAtMs`
- `presenceView`
- `presenceTaskId`

Then stop injecting those fields in:

- `src/domain/content/sidebar-people.ts`
- `src/infrastructure/nostr/use-kind0-people.ts`

### 5. Introduce a dedicated presence-aware sidebar/view model

Refactor presence-aware outputs to use a dedicated type such as:

```ts
interface SidebarPerson extends SelectablePerson {
  pinIndex?: number;
  presence?: PersonPresenceSnapshot;
}
```

Recommendation:

- keep the view model flat rather than wrapping `person`

Reasoning:

- lower migration cost
- minimal JSX churn
- still keeps raw `Person` clean

### 6. Move status derivation to shared helpers

Replace direct reads of:

- `person.onlineStatus`
- `person.isOnline`

with a shared helper such as:

- `getPersonPresenceState(presence?): "online" | "recent" | "offline"`

Consumers:

- `src/components/layout/sidebar/PersonItem.tsx`
- `src/components/people/PersonHoverCard.tsx`
- any controller code that currently materializes default status values

### 7. Move pinning/UI ordering out of `Person`

`pinIndex` should live only on sidebar-oriented or other UI-specific view models.

Do not preserve it on canonical `Person`.

### 8. Normalize all person and author comparisons around canonical pubkey

After the rename, replace ad hoc comparisons like:

- `person.id.trim().toLowerCase()`
- `task.author.id.toLowerCase()`

with canonical pubkey comparisons.

This includes:

- person filters
- pending publish dedupe
- current-user resolution
- mention resolution
- task author profile lookup

## Suggested Commit Sequence

1. `refactor: add canonical person pubkey helpers`
2. `refactor: rename Person.id to pubkey and keep Task.author as Person`
3. `refactor: split selectable people state from canonical Person`
4. `refactor: move person presence and pin state into sidebar view models`
5. `test: update person identity, selection, and presence coverage`

## Test Strategy

This is a major refactor under repo policy.

Required verification:

- `npm run lint`
- `npx vitest run`
- `npm run build`

Add or update focused tests around:

- kind `0` people derivation normalizing to lowercase hex
- authenticated user/profile mapping normalizing to canonical hex
- mention resolution when `npub` input maps to canonical hex `person.pubkey`
- person filters matching author and mention pubkeys via canonical identity
- sidebar presence rendering from `presence` subobjects rather than `Person` fields
- selection behavior after `SelectablePerson` split
- current-user matching by canonical pubkey

## Risks

### High risk

- persisted selected or pinned person ids may rely on old field names or non-canonical values
- test fixtures with fake ids like `alice-pk` will hide canonical-pubkey assumptions
- temporary confusion if some controllers still operate on `Person[]` while others move to `SelectablePerson[]`

### Medium risk

- hover/sidebar surfaces may accidentally assume all people have presence data
- composer mention logic may rely on selection-bearing people and need explicit `SelectablePerson` input types

## Recommended First Cut

The first implementation pass should include:

1. canonical pubkey helper
2. `Person.id -> Person.pubkey`
3. `Task.author` updated implicitly because it remains `Person`
4. `Person` stripped of presence and `pinIndex`
5. selection flows moved to `SelectablePerson`
6. sidebar/hover presence moved to a dedicated view model

That gives a coherent boundary in one pass instead of only renaming fields while leaving identity, selection, and presence semantics mixed together.
