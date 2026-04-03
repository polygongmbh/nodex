# Plan: Move Person Fallback Labels Into The Person Model Layer

## Goal

Stop treating `Person.name` / `Person.displayName` as a mixed bag of:

- actual profile metadata
- synthetic fallback text copied from `id`

Instead, keep raw identity/profile fields clean and expose reusable derived labels from one model-layer API so chips, filters, sidebar rows, mentions, and task cards all resolve people consistently.

## Current Read

- `Person` is currently a plain interface in [`src/types/index.ts`](/Users/tj/IT/nostr/nodex/src/types/index.ts).
- Several producers still synthesize fallback labels directly into `name` / `displayName`, notably:
  - [`src/infrastructure/nostr/use-nostr-profiles.tsx`](/Users/tj/IT/nostr/nodex/src/infrastructure/nostr/use-nostr-profiles.tsx)
  - [`src/infrastructure/nostr/task-converter.ts`](/Users/tj/IT/nostr/nodex/src/infrastructure/nostr/task-converter.ts)
  - some local stubs in sidebar/pinning flows
- Label resolution is already partially centralized in [`src/lib/person-label.ts`](/Users/tj/IT/nostr/nodex/src/lib/person-label.ts), but consumers still directly read `person.displayName || person.name || person.id` in many places.
- The app still relies heavily on plain object literals for `Person`, fixtures, state updates, persistence, and derived view models. That makes a full runtime class migration high-risk and noisy.

## Opinionated Path

Do not convert `Person` into a concrete JS/TS class across the app right now.

Instead:

1. Keep `Person` as plain serializable data.
2. Add a small model-layer wrapper or derived-access API around `Person`.
3. Make all UI code read derived labels from that API instead of hand-rolling fallbacks.
4. Gradually remove id-derived fallback values from raw `name` / `displayName` producers.

This gets the architectural win you want, without forcing every state container, test fixture, JSON payload, and selector to understand class instances.

## Why Not A Full Class First

- React state, persistence, fixture factories, and network conversion paths currently assume plain objects.
- A runtime class would require broad factory normalization at every construction boundary.
- It would be easy to accidentally mix class instances and raw objects, which is worse than the current inconsistency.
- TypeScript interfaces cannot provide actual runtime getters; to get real getters you need instances, not plain data.

If you want getter ergonomics, the safer intermediate step is a wrapper such as:

- `asPersonModel(person).displayLabel`
- `asPersonModel(person).compactLabel`
- `asPersonModel(person).hasHumanDisplayName`

That gives getter-style consumption without changing the storage shape.

## Proposed Model Design

### Raw Data

Keep `Person` as the raw persisted/network-safe shape:

- `id`
- `name`
- `displayName`
- `nip05`
- avatar / online / selected flags

Longer-term, consider making `name` and `displayName` optional if the app should support truly sparse raw profiles.

### Derived Model API

Expand [`src/lib/person-label.ts`](/Users/tj/IT/nostr/nodex/src/lib/person-label.ts) or introduce a nearby domain-model file that exposes:

- `getPersonDisplayName(person)`
- `getCompactPersonLabel(person)`
- `getPersonUsername(person)`
- `hasHumanDisplayName(person)`
- `hasHumanUsername(person)`
- `getPersonFallbackLabel(person)`
- optionally `asPersonModel(person)` returning getter-backed derived accessors

Use one canonical placeholder-detection implementation there.

## Implementation Steps

1. Define the target semantics.
- `id` is identity only.
- `name` is username/profile name only.
- `displayName` is profile display name only.
- any pubkey/npub fallback string is derived at render/use time, not stored as raw profile metadata.

2. Strengthen the shared person-label/model helper.
- Consolidate all current fallback logic into one reusable API.
- Add explicit helpers for:
  - preferred visible label
  - compact chip label
  - author-meta label parts
  - placeholder detection

3. Audit producers that currently write fallback values into raw fields.
- Start with:
  - [`src/infrastructure/nostr/use-nostr-profiles.tsx`](/Users/tj/IT/nostr/nodex/src/infrastructure/nostr/use-nostr-profiles.tsx)
  - [`src/infrastructure/nostr/task-converter.ts`](/Users/tj/IT/nostr/nodex/src/infrastructure/nostr/task-converter.ts)
  - pinned/stub people creation in sidebar flows
- Change them to store raw metadata only, plus `id`.
- Where the UI still needs a visible label, read from the shared person-model helper instead.

4. Migrate consumer surfaces to the shared derived API.
- High-priority surfaces:
  - sidebar people rows
  - mobile filter chips
  - mobile bottom-bar people selector
  - mention chips/autocomplete
  - feed/list/task cards
  - empty-state scope summaries
- Remove inline `displayName || name || id` chains where feasible.

5. Add regression tests for raw-vs-derived behavior.
- person with real `displayName` and distinct `name`
- person with only `name`
- person with neither, deriving label from `id`
- person whose stored `displayName` looks like a pubkey placeholder
- sidebar/mobile chip/mention surfaces all showing the same preferred label contract

6. Consider a second-phase type cleanup.
- After helper adoption is broad enough, make `name` / `displayName` optional in `Person`.
- Update fixtures and converters accordingly.
- This will force call sites to stop assuming raw fields are always populated.

## Recommended Delivery Shape

Split into two milestones:

1. `refactor:` centralize derived person-label API and migrate consumers.
2. `refactor:` stop storing id-derived fallback strings in raw `Person` producers.

That keeps behavior-preserving cleanup separate from the more semantic raw-data change.

## Risks

- Some tests currently assume `displayName` is always populated in fixtures and converters.
- Mention/autocomplete surfaces may intentionally want username-oriented labels rather than display-name-first labels; do not flatten those distinctions accidentally.
- Pinned/stub people may need an explicit “unknown profile” rendering policy once raw fallback strings stop being stored directly.
- Making `name` / `displayName` optional too early will create broad churn across tests and low-value plumbing.

## Verification

This should be treated as a broad refactor once implemented:

- `git pull --rebase --autostash`
- `npm run lint`
- `npx vitest run`
- `npm run build`

## Recommended First Move

Start by introducing a getter-style wrapper on top of the existing shared helper, not by introducing a concrete `Person` class.

Example direction:

- `const model = asPersonModel(person)`
- `model.displayLabel`
- `model.compactLabel`
- `model.authorMeta`

That gives the ergonomics you want, keeps plain objects in state/storage, and makes a later true class migration optional rather than mandatory.
