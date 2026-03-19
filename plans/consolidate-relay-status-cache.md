# Plan: Persist Relay NIP-11 Info via NDKCacheAdapter

## Goal

Add cross-session persistence for NIP-11 relay information (auth requirements,
NIP-42 support) by implementing `updateRelayStatus` / `getRelayStatus` on the
`NDKCacheAdapter`. This eliminates the need to re-fetch NIP-11 on every page
load before the app can make correct auth decisions.

## Background

`relay-info.ts` fetches the NIP-11 document on demand during relay verification.
Results land in `relayInfoRef` (an in-memory `Map<string, RelayInfoSummary>`)
inside `use-relay-verification.ts` — but this ref is **not persisted**. On
reload every relay must be probed again before the app knows whether a relay
requires NIP-42 auth.

NDK's `NDKCacheAdapter` provides `updateRelayStatus` / `getRelayStatus` with a
`nip11: { data, fetchedAt }` field on `NDKCacheRelayInfo`. This is the right
slot for this data.

## What Stays Custom (Not Replaced)

The app's live connection tracking is entirely runtime ephemeral state and
**cannot** be expressed via the NDK adapter. These remain unchanged:

| Ref | Purpose |
|-----|---------|
| `relayConnectedOnceRef` | Has this relay ever connected this session? |
| `relayAutoPausedRef` | Auto-paused after repeated failures |
| `relayInitialFailureCountsRef` | Failure count before first connect |
| `relayReadRejectedRef` / `relayWriteRejectedRef` | Capability rejection flags |
| `relayAttemptStartedAtRef` | Timestamp for connecting-grace window |
| `relayAuthRetryHistoryRef` | Auth retry deduplication |
| `pendingRelayVerificationRef` | In-flight verification operations |

The app's status enum (`connected | read-only | connecting | disconnected |
connection-error | verification-failed`) is also app-level only — NDK does not
model these.

## What Changes

Only NIP-11 fetch results are persisted. The adapter stores:

```ts
{
  nip11: {
    data: NDKRelayInformation,  // raw NIP-11 doc from NDK's type
    fetchedAt: number
  }
}
```

On startup, cached NIP-11 data pre-populates `relayInfoRef` so `probeRelayInfo`
can skip the HTTP fetch when a fresh-enough result exists.

## TTL

Use a **7-day TTL** for cached NIP-11 documents. Auth requirements and supported
NIPs change rarely; staleness here is low-risk. On TTL expiry the probe runs
normally and updates the cache.

## Steps

### 1. Extend `NodexCacheAdapter` (from the NIP-05 plan)

If implementing after the NIP-05 plan, the adapter already exists. Otherwise
create it now with just the relay status methods.

Implement `updateRelayStatus` and `getRelayStatus` backed by a new localStorage
key: `nodex.relay-status-cache.v1`.

Storage format: `Record<normalizedRelayUrl, { nip11?: { authRequired, supportsNip42, fetchedAt } }>`

Map between app's `RelayInfoSummary` shape and `NDKCacheRelayInfo.nip11.data`.
The adapter only needs to persist `authRequired` and `supportsNip42` — derive
them via the existing `summarizeRelayInfo()` helper.

### 2. Register the key in `storage-registry.ts`

Add `nodex.relay-status-cache.v1` under the **cache** category.

### 3. Pre-populate `relayInfoRef` on startup

In `ndk-provider.tsx`, after NDK is initialized and the relay list is known,
call `cacheAdapter.getRelayStatus(url)` for each configured relay and populate
`relayInfoRef` with the cached summary (if not expired).

Also update the `NDKRelayStatus` entries in state with cached `nip11` fields so
the UI can show auth-required badges before the first live probe completes.

### 4. Skip probe when cache is fresh

In `use-relay-verification.ts`'s `probeRelayInfo`, before calling
`fetchRelayInfo`, check if `relayInfoRef` already has a fresh entry (age <
7 days). If so, skip the HTTP fetch. This is a minor optimization but avoids
a burst of NIP-11 requests on app load.

### 5. Write cache on successful probe

After `fetchRelayInfo` returns a non-null `RelayInfoSummary`, call
`cacheAdapter.updateRelayStatus(relayUrl, { nip11: { data: ..., fetchedAt: now } })`.

The adapter must translate `RelayInfoSummary` → the subset of
`NDKRelayInformation` fields needed (or store a trimmed version).

### 6. Clear cached relay status on relay removal

When a relay is removed via `removeRelay`, invalidate its entry in the adapter
so stale NIP-11 data doesn't persist for removed relays. Call
`cacheAdapter.updateRelayStatus(url, {})` to clear, or track removed relay URLs
and skip on load.

## Files Changed

| File | Action |
|------|--------|
| `src/infrastructure/cache/ndk-cache-adapter.ts` | Add relay status methods |
| `src/infrastructure/cache/ndk-cache-adapter.test.ts` | Add relay status tests |
| `src/infrastructure/preferences/storage-registry.ts` | Add new cache key |
| `src/lib/nostr/provider/ndk-provider.tsx` | Pre-populate relayInfoRef on init |
| `src/lib/nostr/provider/use-relay-verification.ts` | Cache probe results; skip fresh |

## Non-Goals

- Persisting connection failure counts, auto-pause, or auth retry history — too
  session-specific and could cause confusing stale state on restart
- Using `NDKCacheRelayInfo.lastConnectedAt` / `consecutiveFailures` — NDK does
  not drive connection decisions from these; they would be write-only metadata
- Replacing `relay-info.ts` or the `relayInfoRef` pattern — keep as-is
