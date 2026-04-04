# Fix Hot-Reload Relay Read-Rejected State

## Problem

During Vite hot reloads, relays often end up stuck in `verification-failed` / read-rejected state.
The current code still suggests that relay connections are being recreated too aggressively when the Nostr provider remounts or re-initializes during HMR.

## Working Hypothesis

The primary risk area is [`src/infrastructure/nostr/provider/ndk-provider.tsx`](/Users/tj/IT/nostr/nodex/src/infrastructure/nostr/provider/ndk-provider.tsx):

- NDK initialization lives inside one large `useEffect`.
- That effect depends on many callbacks and derived values, so it is structurally easy to retrigger.
- Cleanup disconnects every relay and clears listeners, which is correct for a real teardown but expensive and noisy under hot reload.
- Read-verification failure state is held in refs local to the provider instance, so repeated teardown/recreate cycles can leave relay state biased toward rejection while sockets/auth challenges are still settling.
- Current code still creates the NDK instance inside the component lifecycle, so even a mount-only effect would not help if Fast Refresh remounts the provider.

## Opinionated Fix Direction

Do not try to "debounce" rejected states first.
Reduce connection churn at the runtime boundary.

With the current implementation, the first move should be to separate the long-lived relay runtime from the React provider component.
Effect cleanup tuning inside `NDKProvider` is still worthwhile, but it should be secondary.

## Plan

1. Extract a stable NDK runtime outside the provider component.
   - Create a small module-scoped runtime owner for:
     - the `NDK` instance
     - relay pool listeners
     - relay bookkeeping refs that represent transport/auth state rather than UI state
   - Have `NDKProvider` attach to that runtime instead of constructing it directly in component lifecycle.
   - In development, preserve that runtime across Fast Refresh so relay sockets are not torn down on provider remount.
   - If needed, keep the persistence dev-only first to minimize production risk.

2. Narrow the provider to UI/session state and runtime subscription.
   - Let `NDKProvider` read runtime snapshots and expose context actions, but avoid owning socket lifetime directly.
   - Move event-listener registration and interval wiring out of the render-driven effect where practical.
   - Use refs/callback refs where needed so runtime listeners do not have to be rebound for ordinary React updates.

3. Reconcile relay-list changes incrementally instead of rebuilding the pool.
   - On relay-list changes:
     - add newly introduced relays
     - remove deleted relays cleanly
     - keep existing relay instances/subscriptions intact
   - Avoid disconnect/reconnect for relays whose normalized URL is already present and healthy.
   - Compare normalized relay sets before mutating `ndk.explicitRelayUrls`, reconnecting, or resetting relay status.

4. Make auth/read rejection state instance-aware.
   - Audit when `relayReadRejectedRef` is cleared.
   - Tie read-rejected recovery to successful auth/connect for the active relay instance, so a stale close from a previous socket cannot keep the current relay marked rejected.
   - Review whether `pendingRelayVerificationRef` and `relaysPendingAuthSubscriptionReplayRef` should also be keyed/validated against the active relay instance.
   - Keep this as a safeguard, not the main fix.

5. Add regression coverage for remount/HMR-adjacent behavior.
   - Extend [`src/infrastructure/nostr/provider/ndk-provider.test.tsx`](/Users/tj/IT/nostr/nodex/src/infrastructure/nostr/provider/ndk-provider.test.tsx) with a case that:
     - renders `NDKProvider`
     - unmounts/remounts it or simulates the relevant runtime reattachment path
     - asserts the relay runtime is reused instead of reconnecting everything from scratch
     - asserts an already-connected relay does not get forced into read-rejected state by reattachment
   - Add a smaller reconciliation test for semantically identical relay props so no-op prop churn also stays safe.

6. Verify with focused and broader checks.
   - Minimum for the change:
     - targeted provider test run for `ndk-provider`
   - If the implementation ends up touching wider provider lifecycle behavior, treat it as a major/risk-based change and run:
     - `npm run lint`
     - `npx vitest run`
     - `npm run build`

## Implementation Notes

- Start in `ndk-provider.tsx`; do not spread the fix into feed-page relay controllers unless evidence requires it.
- Prefer a small runtime extraction dedicated to transport/session lifetime over trying to make one giant effect perfectly stable.
- A split between "runtime state" and "React view state" is justified here because websocket lifetime is not naturally component-scoped.
- Keep the public `NDKContextValue` surface stable unless the refactor proves it is necessary to change it.

## Success Criteria

- Editing unrelated UI code during development no longer causes relay sockets to churn repeatedly.
- Connected relays do not commonly degrade into persistent `verification-failed` after hot reload.
- Manual reconnect remains available for real relay auth failures instead of masking them.
