# Fix Sticky Startup Relay Read-Rejected State

## Goal

Fix the case where an auto-discovered startup relay gets stuck in `verification-failed` / `read rejected` even though the relay is publicly readable and only starts behaving normally after repeated reselect/reconnect churn.

## Working Theory

The current failure is likely not the fallback discovery itself. The more probable regression is that an early startup read failure or auth-like subscription close marks the relay as `verification-failed`, and that flag is not being cleared reliably when the same relay later connects and starts serving readable events.

That is consistent with the current code shape:

- startup bootstrap resolves and persists the fallback relay before provider mount
- provider status logic treats `readRejected` as sticky while transport is otherwise healthy
- a later successful reconnect or first real read does not always fully clear the stale verification state soon enough
- repeated reselects eventually force enough reconnect/read churn to clear the flag

## Opinionated Approach

Treat this as a relay verification state-reconciliation bug, not as a discovery bug.

The fix should ensure that a relay cannot remain `verification-failed` once there is clear evidence of readable success from that same normalized relay URL. That means tightening when we set `verification-failed`, and making state clearing deterministic on successful startup reads or healthy reconnects.

## Scope

Files likely to change:

- `src/infrastructure/nostr/provider/relay-verification.ts`
- `src/infrastructure/nostr/provider/use-publish.ts`
- `src/infrastructure/nostr/provider/use-relay-verification.ts`
- `src/infrastructure/nostr/provider/use-relay-transport.ts`
- `src/infrastructure/nostr/provider/ndk-provider.tsx`
- `src/infrastructure/nostr/provider/relay-verification.test.ts`
- `src/infrastructure/nostr/provider/ndk-provider.test.tsx`

Possible supporting touch points if needed:

- `src/infrastructure/nostr/startup-relays.ts`
- `CHANGELOG.md`

## Plan

1. Reproduce the sticky state in tests first.
   - Add a provider-level regression test that simulates a startup relay being marked `verification-failed` from an early read/subscription failure, then later connecting and emitting a readable event.
   - Assert that the relay status settles back to `connected` instead of staying `verification-failed`.
   - Add a variant that specifically covers auto-discovered/default-injected startup relays rather than manually added relays.

2. Tighten the rules for when startup read failures are allowed to set `verification-failed`.
   - Audit the current `subscription.on("closed")` auth handling in `use-publish.ts` and the equivalent path in `ndk-provider.tsx`.
   - Distinguish genuine auth-required read rejection from transient startup churn more defensibly.
   - Avoid marking a relay `verification-failed` on weak evidence during initial bootstrap if no auth challenge was seen and no relay metadata indicates auth-required read access.

3. Make success clear stale read-rejection state deterministically.
   - Ensure a successful readable event from a relay always clears `readRejected` immediately for that normalized relay URL.
   - Ensure a successful reconnect or post-reconnect healthy read path cannot preserve stale `verification-failed` UI state.
   - If needed, clear read-rejection state when a forced reconnect is triggered for read recovery and the relay subsequently reaches a healthy connected/readable path.

4. Reconcile startup bootstrap with provider verification timing.
   - Confirm that bootstrap-discovered relays are not inheriting stale persisted verification state from an earlier session in a way that the provider never resets.
   - If necessary, explicitly reset verification capability flags for startup-injected relays on provider bootstrap while still preserving real runtime failures.

5. Verify the behavior at the right level.
   - Run focused relay verification/provider tests.
   - If the fix touches startup bootstrap semantics, run the startup relay and app bootstrap tests as well.

6. Document the user-visible fix if the final behavior change is notable.
   - If the patch changes visible relay status behavior in a user-meaningful way, add a concise `Unreleased` changelog entry.

## Risks To Watch

- masking real auth-required read restrictions by clearing `verification-failed` too aggressively
- conflating transport disconnect churn with actual auth rejection
- fixing only the manual reconnect path while leaving initial startup subscription flow broken
- introducing flaky tests around async subscription closure and reconnect timing

## Implementation Notes

- Prefer behavior-based tests that model the actual sequence:
  startup relay present -> early read rejection signal -> reconnect/read success -> status clears.
- Keep the fix centered on normalized relay URL state ownership.
- Avoid broad refactors of relay transport unless the current split between transport and verification makes the bug impossible to fix locally.
