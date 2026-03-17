# Fix Lint Hook-Dependency Warnings

## Current Lint Findings

`npm run lint` currently reports two warnings:

1. `src/hooks/use-index-filters.ts:155`
   - `handleHashtagExclusive` is missing `setPostedTags` in its `useCallback` dependency list.
   - The callback writes through `setPostedTags(...)`, so the dependency array should include it even though React state setters are stable.

2. `src/lib/nostr/provider/ndk-provider.tsx:887`
   - `addRelay` lists `relays` in its `useCallback` dependency list even though the callback body does not read `relays`.
   - That dependency should be removed to satisfy `react-hooks/exhaustive-deps` and avoid unnecessary callback churn.

## Proposed Fix

### 1. Fix the missing dependency in `use-index-filters`

- Add `setPostedTags` to the dependency array for `handleHashtagExclusive`.
- Keep the callback body unchanged unless a nearby refactor makes the dependency list clearer.
- Treat this as lint hygiene, not a behavior change.

### 2. Remove the stale dependency in `ndk-provider`

- Remove `relays` from the `addRelay` dependency array.
- Sanity-check the callback body to confirm it only closes over:
  - `ndk`
  - `probeRelayInfo`
  - `beginRelayOperation`
  - refs and state setters
- Leave the relay listener setup and persistence logic unchanged.

### 3. Re-verify

- Run `npm run lint` again and expect a clean result for these hook warnings.
- If either edit touches behavior-sensitive code paths, run the smallest relevant tests:
  - `src/hooks/use-index-filters.test.tsx`
  - `src/lib/nostr/provider/ndk-provider.test.tsx`

## Scope Note

- There are already staged auth/localization changes in the working tree.
- Keep this fix isolated to the two warning sites unless another hook-dependency warning appears during re-run.
