## Goal

Fix the mobile relay management view so each relay reflects its real transport/auth state instead of appearing connected by default, while leaving the already-correct desktop relay management path unchanged.

## Observations

- Desktop relay management already reports relay status correctly, so the bug is isolated to mobile rendering/presentation rather than the shared provider transport state.
- The mobile relay chips in [`src/components/mobile/MobileFilters.tsx`](/Users/tj/IT/nostr/nodex/src/components/mobile/MobileFilters.tsx) render a connection dot from `relay.connectionStatus`, but they explicitly fall back to `"connected"` when that field is missing.
- App relay data is assembled in [`src/pages/Index.tsx`](/Users/tj/IT/nostr/nodex/src/pages/Index.tsx) from `ndkRelays`, mapping `r.status` into `connectionStatus`.
- Current mobile tests cover add-flow behavior, but there is no regression coverage for rendering disconnected / connecting / read-only relay state in the mobile management UI.

## Opinionated Path

Treat this as a mobile presentation bug. Keep the desktop and provider status model untouched unless a mobile-focused test proves otherwise. The only relay that should remain hardwired to connected is the demo relay; all non-demo relays in the mobile sheet should render the exact `connectionStatus` they are passed.

## Plan

1. Add a failing mobile regression test in [`src/components/mobile/MobileFilters.test.tsx`](/Users/tj/IT/nostr/nodex/src/components/mobile/MobileFilters.test.tsx) that renders at least one non-demo relay with a non-connected `connectionStatus` and asserts the mobile management row exposes the matching state instead of a connected indicator.

2. Trace the mobile render path from [`src/pages/Index.tsx`](/Users/tj/IT/nostr/nodex/src/pages/Index.tsx) into [`src/components/mobile/MobileFilters.tsx`](/Users/tj/IT/nostr/nodex/src/components/mobile/MobileFilters.tsx) only far enough to confirm the mobile UI is masking an otherwise-correct status.

3. Fix [`src/components/mobile/MobileFilters.tsx`](/Users/tj/IT/nostr/nodex/src/components/mobile/MobileFilters.tsx) so non-demo relays preserve their incoming `connectionStatus` exactly and only the demo relay defaults to connected.

4. Keep verification localized to the mobile view unless the trace unexpectedly contradicts the desktop behavior claim.

5. Verify with the minimum checks for a localized logic/UI fix:
   - Run focused tests for the changed area, starting with `npx vitest run src/components/mobile/MobileFilters.test.tsx`.
   - Run `npm run build` only if the mobile fix ends up touching shared relay rendering helpers or broader type flow.

## Implementation Notes

- Keep the change out of desktop relay management and provider transport logic unless the mobile regression test disproves the current assumption.
- Do not introduce new hardcoded user-facing copy; reuse existing relay status labels/hints.
- If the final fix changes only the mobile sheet rendering, this should remain a single localized `fix:` commit without a changelog entry.
