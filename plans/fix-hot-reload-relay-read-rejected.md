# Fix Hot-Reload Relay Read-Rejected State

## Problem

During Vite hot reloads, relays often end up stuck in `verification-failed` / read-rejected state.
The most likely cause is that the Nostr provider recreates relay connections and/or replays auth-sensitive subscriptions too aggressively when React effects rerun or the provider remounts during HMR.

## Working Hypothesis

The primary risk area is [`src/infrastructure/nostr/provider/ndk-provider.tsx`](/Users/tj/IT/nostr/nodex/src/infrastructure/nostr/provider/ndk-provider.tsx):

- NDK initialization lives inside one large `useEffect`.
- That effect depends on many callbacks and derived values, so it is structurally easy to retrigger.
- Cleanup disconnects every relay and clears listeners, which is correct for a real teardown but expensive and noisy under hot reload.
- Read-verification failure state is held in refs local to the provider instance, so repeated teardown/recreate cycles can leave relay state biased toward rejection while sockets/auth challenges are still settling.

## Opinionated Fix Direction

Do not try to "debounce" rejected states first.
Instead, reduce connection churn so hot reload stops creating the failure condition.

## Plan

1. Isolate provider bootstrap from routine render churn.
   - Split the current initialization effect into:
     - one mount-only/provider-lifetime bootstrap for creating the NDK instance, pool listeners, timers, and cleanup
     - one narrower reconciliation path for relay list changes
   - Make the bootstrap depend only on true lifetime inputs, not a broad callback set.
   - Prefer refs for event-handler access where needed so listener wiring does not require re-instantiating NDK.

2. Preserve relay/socket ownership across no-op rerenders and HMR-adjacent updates.
   - Ensure `defaultRelays` identity changes alone do not force full provider teardown when the normalized relay set is unchanged.
   - Compare normalized relay sets before mutating `ndk.explicitRelayUrls`, reconnecting, or resetting relay status.
   - Treat persisted relay state as a reconciliation input, not as a reason to rebuild the whole provider.

3. Reconcile relays incrementally instead of rebuilding the pool.
   - On relay-list changes:
     - add newly introduced relays
     - remove deleted relays cleanly
     - keep existing relay instances/subscriptions intact
   - Avoid disconnect/reconnect for relays whose normalized URL is already present and healthy.

4. Make read-rejection state less sticky across legitimate reconnects.
   - Audit when `relayReadRejectedRef` is cleared.
   - On explicit successful reconnect/auth completion for the same relay instance, clear stale read rejection before surfacing `verification-failed`.
   - Keep this as a secondary safeguard, not the primary fix.

5. Add a regression test for provider stability.
   - Extend [`src/infrastructure/nostr/provider/ndk-provider.test.tsx`](/Users/tj/IT/nostr/nodex/src/infrastructure/nostr/provider/ndk-provider.test.tsx) with a case that:
     - renders `NDKProvider`
     - rerenders with semantically identical relay props or triggers the relevant bootstrap update path
     - asserts NDK creation/connect is not repeated unnecessarily
     - asserts an already-connected relay does not get forced into read-rejected state by that rerender

6. Verify with focused and broader checks.
   - Minimum for the change:
     - targeted provider test run for `ndk-provider`
   - If the implementation ends up touching wider provider lifecycle behavior, treat it as a major/risk-based change and run:
     - `npm run lint`
     - `npx vitest run`
     - `npm run build`

## Implementation Notes

- Start in `ndk-provider.tsx`; do not spread the fix into feed-page relay controllers unless evidence requires it.
- Prefer a small internal lifecycle refactor over introducing another external state layer.
- If HMR still remounts the provider completely, consider a second-step fallback: a module-scoped dev-only singleton transport/session holder. That should be a backup option, not the first move.

## Success Criteria

- Editing unrelated UI code during development no longer causes relay sockets to churn repeatedly.
- Connected relays do not commonly degrade into persistent `verification-failed` after hot reload.
- Manual reconnect remains available for real relay auth failures instead of masking them.
