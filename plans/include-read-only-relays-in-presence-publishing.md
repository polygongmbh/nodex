# Include Read-Only Relays In Presence Publishing

## Goal

Allow presence publishing to still attempt relays currently marked `read-only`
so Nodex can periodically verify whether those relays have become writable again,
while keeping rejected attempts on the normal presence publish cadence rather
than the failure retry path.

## Opinionated Approach

Use a narrow presence-only publish override instead of loosening the global
`publishEvent` relay filter.
Presence is the only flow that should probe `read-only` relays on purpose.
Task, comment, and other user-authored publishes should keep respecting the
current writable-only guardrails.

## Current Behavior

- [`src/features/feed-page/controllers/use-relay-scoped-presence.ts`](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-relay-scoped-presence.ts)
  builds active and offline presence targets from writable relays only.
- [`src/infrastructure/nostr/provider/ndk-provider.tsx`](/Users/tj/IT/nostr/nodex/src/infrastructure/nostr/provider/ndk-provider.tsx)
  filters explicit `relayUrls` through `filterRelayUrlsToWritableSet(...)` inside
  `publishEvent`, so even an explicit presence target list cannot hit
  `read-only` relays.
- Presence timing already exists in the relay-scoped controller:
  unchanged presence republishes use the normal refresh cadence
  (`unchangedRefreshMs`), and relay-scope changes use the standard
  `relaySwitchDebounceMs` default of `3000`.

## Plan

1. Add a presence-specific explicit relay override to `publishEvent`.
   Extend the provider publish contract with a small optional flag or options
   object that allows explicit relay targets to include `read-only` relays only
   when the caller opts in.
   Keep the default path unchanged so non-presence publishing remains
   writable-only.

2. Route relay-scoped presence through that override.
   Update [`src/features/feed-page/controllers/use-relay-scoped-presence.ts`](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-relay-scoped-presence.ts)
   to select `connected` and `read-only` relays for active/offline presence
   targeting, then call `publishEvent` with the new presence-only override.
   Preserve dedupe and relay-scoped grouping behavior.

3. Fold rejected presence probes back into the regular presence cycle.
   Do not let rejected presence attempts take the `failedRetryMs` branch.
   Instead, treat the probe as part of the normal presence rhythm so the next
   attempt waits for the default steady-state presence delay
   (`unchangedRefreshMs`), not the failure-specific retry delay and not an
   immediate retry.

4. Keep read-only classification intact.
   Do not weaken `shouldMarkRelayReadOnlyAfterPublishReject(...)`.
   Presence attempts should still confirm and refresh the `read-only` state when
   a relay rejects writes again.
   Successful presence publishes should continue clearing write rejection state
   through the existing success path.

5. Cover the behavior with focused tests.
   Add or update tests in
   [`src/infrastructure/nostr/provider/ndk-provider.test.tsx`](/Users/tj/IT/nostr/nodex/src/infrastructure/nostr/provider/ndk-provider.test.tsx)
   and
   [`src/features/feed-page/controllers/use-relay-scoped-presence.ts`](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-relay-scoped-presence.ts)
   or its test file to verify:
   - generic explicit relay publishing still skips `read-only` relays
   - presence publishing includes `read-only` relays when explicitly targeted
   - rejected presence publishes re-enter the normal presence refresh cadence
     rather than using `failedRetryMs`
   - a later successful presence publish can restore writability via the existing
     relay outcome handling

## Verification

This looks like a minor localized logic change with protocol-adjacent relay
behavior.
Required verification should be focused tests for the changed area.
Recommended verification is `npm run build`.

## Risks To Watch

- Widening the `publishEvent` API too broadly could let non-presence callers
  accidentally bypass the read-only guard.
- If cleanup relay registration remains writable-only while active presence
  targets include `read-only`, logout/offline presence could still miss the
  intended relays.
- Tests need to assert timing through fake timers or controlled waits so the
  “regular presence cycle after rejection” requirement is actually protected.
