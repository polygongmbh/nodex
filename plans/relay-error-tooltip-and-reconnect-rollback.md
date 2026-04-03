# Relay Error Tooltip And Reconnect Rollback Plan

## Goal

When a relay row represents a failed connection state, hovering anywhere on that row should surface the connection issue instead of the normal toggle/exclusive interaction tooltip. If the row click triggers a reconnect and the relay remains failed after that reconnect attempt, the relay should be deselected automatically.

## Opinionated Approach

Use the relay sidebar row as the single UX boundary for the hover message, and route relay activation through a typed feed interaction intent instead of adding more ad hoc page callbacks. Treat failed-relay selection as an optimistic state that must be rolled back from extracted controller code once the relay status settles back into a failed state.

This keeps the view logic simple:

- the row decides which tooltip content wins
- the interaction pipeline owns the user intent to activate/select a relay
- extracted relay controller state tracks whether a user-initiated selection is waiting for reconnect recovery
- the existing NDK relay status stream remains the source of truth for success or failure
- `src/pages/Index.tsx` stays thinner by delegating new relay behavior into focused feed-page controller/interactions modules

## Implementation Steps

1. Audit and centralize failed-relay tooltip copy for sidebar rows.
   - Reuse existing localized relay status strings where possible.
   - Add a small helper for mapping `connection-error`, `verification-failed`, and `disconnected` to the tooltip text the row should show.
   - Keep `read-only` on its current special-case tooltip path unless the row is in one of the hard failure states above.

2. Refactor the sidebar relay row tooltip ownership in [RelayItem.tsx](/Users/tj/IT/nostr/nodex/src/components/layout/sidebar/RelayItem.tsx).
   - Wrap the whole row in a Radix tooltip trigger when the relay is in a failed state.
   - Suppress the current button `title`-driven interaction hints while that error tooltip is active so the browser does not show competing tooltips.
   - Preserve normal toggle/exclusive labels for accessibility; only the hover tooltip behavior changes.
   - Keep the status dot visible and continue to show the read-only inline tooltip only for `read-only`.

3. Introduce a typed relay activation intent in the feed interaction layer.
   - Extend [feed-interaction-intent.ts](/Users/tj/IT/nostr/nodex/src/features/feed-page/interactions/feed-interaction-intent.ts) with a relay-selection intent that can express the needed activation mode without overloading raw `toggle` and `exclusive`.
   - Update [RelayItem.tsx](/Users/tj/IT/nostr/nodex/src/components/layout/sidebar/RelayItem.tsx) to dispatch that typed intent for the click path that may require reconnect semantics.
   - Keep the intent focused on user action only; do not model reconnect failure rollback itself as a UI event dispatch.

4. Add explicit reconnect-rollback tracking in extracted relay controller state.
   - Extend [use-relay-filter-state.ts](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-relay-filter-state.ts) or a nearby relay-shell helper so user-triggered enable/exclusive actions can mark a relay as "selected pending reconnect".
   - Feed that tracking with the current relay status list and clear it once the relay reaches `connected`, `read-only`, or at least leaves the failed state.
   - If a pending relay returns to or remains in `connection-error`, `verification-failed`, or `disconnected` after the reconnect attempt, remove it from `activeRelayIds` automatically.
   - Limit the rollback to the relay(s) activated by that click so background auto-reconnect churn does not unexpectedly deselect unrelated filters.
   - Prefer a dedicated controller/helper module if that keeps this state machine out of [Index.tsx](/Users/tj/IT/nostr/nodex/src/pages/Index.tsx).

5. Rewire the current reconnect-on-selection integration without growing [Index.tsx](/Users/tj/IT/nostr/nodex/src/pages/Index.tsx).
   - Replace the current fire-and-forget `onRelayEnabled` callback flow with a controller-facing API that both triggers reconnect and records that this selection is awaiting recovery.
   - Keep [Index.tsx](/Users/tj/IT/nostr/nodex/src/pages/Index.tsx) as an orchestration layer only; if new branching logic appears there, extract it immediately into the relay controller or interaction handler module.

6. Add focused regression coverage.
   - Extend [RelayItem.test.tsx](/Users/tj/IT/nostr/nodex/src/components/layout/sidebar/RelayItem.test.tsx) to verify failed relays expose connection-issue messaging from the row and suppress the normal hover tooltip path.
   - Add or extend interaction/controller tests to prove:
     - clicking a failed relay dispatches the new typed relay activation intent
     - selecting a failed relay triggers reconnect tracking
     - a recovered relay stays selected
     - a relay that falls back to a failed state after reconnect is automatically deselected
   - If the controller behavior is easiest to exercise through [use-index-relay-shell.test.tsx](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-index-relay-shell.test.tsx) or a new dedicated test file, prefer that over overloading page-level tests.

## Verification

Because this is a minor localized logic/UI change, run focused tests for the changed area:

- `npx vitest run src/components/layout/sidebar/RelayItem.test.tsx`
- `npx vitest run` on the relay controller test file(s) touched by the reconnect rollback work

Recommended if the implementation spreads beyond the local controller/component boundary:

- `npm run build`

## Risks To Watch

- Browser `title` tooltips can conflict with Radix tooltips if they are left on nested buttons during failed-state hover.
- The reconnect API is currently synchronous from the page/controller perspective, so rollback must key off later relay status updates rather than assuming an immediate return value.
- Introducing a new interaction intent only helps if the corresponding handler logic is extracted rather than relocated wholesale into [Index.tsx](/Users/tj/IT/nostr/nodex/src/pages/Index.tsx).
- Exclusive selection needs extra care so a failed reconnect only removes the intended relay instead of unintentionally restoring a previous multi-select state.
