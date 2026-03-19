# Plan: Consolidate NIP-05 Resolution Cache via NDKCacheAdapter

## Goal

Replace the custom `nip05-resolver.ts` dual-layer cache with an `NDKCacheAdapter`
implementation that NDK's own `getNip05For` will use natively, eliminating the
parallel resolution path.

## Background

NDK's internal `getNip05For` (`src/user/nip05.ts`) already:
1. Checks `cacheAdapter.loadNip05(identifier)` before hitting the network
2. Calls `cacheAdapter.saveNip05(identifier, profile | null)` on success or failure
3. Queues concurrent lookups for the same identifier (`queuesNip05`)

The app currently bypasses all of this with a standalone resolver that duplicates
fetch logic and manages its own localStorage + in-memory cache.

The `nip05-verify.ts` file (`verifyNip05`, `resolveVerifiedNip05RelayUrls`) is a
**separate concern** (pubkey verification + relay URL discovery for the auth flow)
and makes intentional uncached fetches. It is **not in scope** for this change.

## Current Call Sites

- `src/features/feed-page/controllers/use-task-publish-flow.ts` — passes
  `resolveNip05Identifier` as the `resolveNip05` dependency
- `src/lib/nostr/nip05-resolver.test.ts` — unit tests for the resolver

## Type Mismatch to Resolve

NDK `getNip05For` returns `ProfilePointer | null` (`{ pubkey, relays?, nip46? }`).
The app only needs a `string | null` (pubkey). A thin wrapper extracts `.pubkey`.

NDK's `loadNip05` uses `"missing"` as the sentinel for expired negatives; the
adapter must encode the app's 10-minute negative TTL in `saveNip05`/`loadNip05`
using a stored timestamp, and return `"missing"` (not `null`) when expired so
NDK refetches.

## Steps

### 1. Create `src/infrastructure/cache/ndk-cache-adapter.ts`

Minimal `NDKCacheAdapter` implementation. Only implement NIP-05 methods in this
change; use no-ops for all others. Back storage with a new localStorage key:
`nodex.nip05-cache.v1`.

Implement:
- `loadNip05(nip05, maxAgeForMissing?)` — read from localStorage; return `null`
  if within positive TTL, `"missing"` if expired or absent; apply
  `maxAgeForMissing` for negative entries
- `saveNip05(nip05, profile)` — write to localStorage with `cachedAt` timestamp

Use the constants from the old resolver:
- `POSITIVE_TTL_MS = 24h`
- `NEGATIVE_TTL_MS = 10m`

### 2. Register the adapter key in `storage-registry.ts`

Add `nodex.nip05-cache.v1` under the **cache** category (pruned first under
quota pressure). Remove `nodex.nip05-resolver.cache.v1` from the registry.

### 3. Wire the adapter into NDK initialization

In `src/lib/nostr/provider/ndk-provider.tsx`, instantiate `NodexCacheAdapter`
and pass it when constructing NDK:

```ts
const cacheAdapter = new NodexCacheAdapter();
const ndkInstance = new NDK({
  explicitRelayUrls: resolvedDefaultRelays,
  cacheAdapter,
});
```

The adapter instance should be stable (created once outside the render cycle,
or held in a ref).

### 4. Replace `resolveNip05Identifier` with an NDK delegate

Add a helper in `src/lib/nostr/nip05-resolver.ts` (or replace the file):

```ts
export async function resolveNip05Identifier(
  identifier: string,
  ndk: NDK
): Promise<string | null> {
  const pointer = await ndk.getUserFromNip05(identifier);
  return pointer?.pubkey ?? null;
}
```

Update `use-task-publish-flow.ts` to pass `ndk` (already available via `useNDK`)
when constructing the `resolveNip05` dependency.

### 5. Handle `clearNip05ResolutionCache`

Check if this is called anywhere in production code (not just tests). If so,
delegate to `cacheAdapter` via a new `clearNip05Cache()` method on the adapter.
If only called in tests, replace with a test-local localStorage clear.

### 6. Delete `nip05-resolver.ts` (and its test)

The test coverage for TTL behaviour, deduplication, and negative caching moves
to `ndk-cache-adapter.test.ts`. Write adapter unit tests before deleting the
old file.

Test cases to carry over:
- Positive hit served from cache (no fetch)
- Negative hit served from cache within 10m
- Negative entry expired after 10m → refetches
- Positive entry expired after 24h → refetches
- `"missing"` sentinel returned for expired entries so NDK retries

## nip05-verify.ts — Partial Delegation

`nip05-verify.ts` has two functions that are also candidates:

**`resolveVerifiedNip05RelayUrls(nip05, pubkey)`** — called once on login to
discover relay URLs from the user's NIP-05 record. NDK's `getNip05For` already
returns `ProfilePointer.relays`, so this becomes: call NDK, verify
`pointer.pubkey === pubkey`, return `pointer.relays ?? []`. Benefits from the
cache (relay list is stable).

**`verifyNip05(nip05, pubkey)`** — called on every incoming profile event to
set the `nip05Verified` badge. Currently fetches fresh every time. Could use
NDK with caching for the common case (same identifier seen repeatedly while
streaming). However, it should **not** trust a stale cached positive if the
NIP-05 record may have changed — pass `fetchOpts: { cache: "no-cache" }` to
NDK so it bypasses the cached-null early-return while still writing back to
the cache on a fresh fetch. This at least avoids redundant in-flight requests
for the same identifier via NDK's `queuesNip05` deduplication.

Both functions reduce to a thin pubkey-comparison wrapper around `getNip05For`.
`nip05-verify.ts` can be collapsed into the same delegation pattern and the
file deleted if no other logic remains.

## Files Changed

| File | Action |
|------|--------|
| `src/infrastructure/cache/ndk-cache-adapter.ts` | Create |
| `src/infrastructure/cache/ndk-cache-adapter.test.ts` | Create |
| `src/infrastructure/preferences/storage-registry.ts` | Update key |
| `src/lib/nostr/provider/ndk-provider.tsx` | Wire adapter |
| `src/lib/nostr/nip05-resolver.ts` | Replace / delete |
| `src/lib/nostr/nip05-resolver.test.ts` | Delete (tests move) |
| `src/lib/nostr/nip05-verify.ts` | Replace with NDK wrappers / delete |
| `src/features/feed-page/controllers/use-task-publish-flow.ts` | Update call site |
| `src/infrastructure/nostr/provider/use-profile-sync.ts` | Update verifyNip05 call site |
| `src/infrastructure/nostr/provider/use-relay-enrichment.ts` | Update resolveVerifiedNip05RelayUrls call site |
