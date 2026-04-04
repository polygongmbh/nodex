# Relay Management Card Toggle And Reconnect Visibility

## Goal

Adjust the relay management pane so:

1. Connected relays do not show a reconnect action.
2. Relay details expand/collapse when clicking the whole relay card, not only the chevron.

## Scope

- In scope:
  - `src/components/relay/RelayManagement.tsx`
  - `src/components/relay/RelayManagement.test.tsx`
- Out of scope:
  - Relay reconnect policy/controller logic
  - Sidebar relay item behavior
  - Copy, localization, or protocol changes unless implementation reveals a missing accessible label

## Opinionated Approach

Use the relay card itself as the disclosure trigger while keeping action buttons as nested controls that stop propagation.
Hide the reconnect button for `connected` relays only, and keep it available for degraded states such as `read-only`, `disconnected`, `connection-error`, and `verification-failed`.

This keeps the UX aligned with the request without changing reconnect semantics or introducing broader state coordination.

## Implementation Steps

1. Refactor each relay row into a card-level disclosure control.
   - Make the main card body clickable to toggle `expandedRelayUrl`.
   - Preserve the chevron as a visual affordance inside the card instead of as the only toggle target.
   - Ensure keyboard accessibility remains intact, either by using a semantic button wrapper for the disclosure region or by adding the correct role, key handling, and ARIA state.

2. Prevent nested actions from toggling the card unintentionally.
   - Keep reorder, reconnect, tooltip, and remove controls independently clickable.
   - Stop event propagation from those controls so clicking them does not also expand/collapse the card.

3. Gate reconnect visibility by relay status.
   - Do not render the reconnect button when `relay.status === "connected"`.
   - Preserve current reconnect dispatch behavior for non-connected statuses.
   - Keep the existing disabled behavior for `connecting` only if the button still renders for that state.

4. Tighten focused tests around the new interaction contract.
   - Add a test proving clicking the relay card opens details.
   - Add a test proving the reconnect button is absent for connected relays.
   - Keep or adjust the existing reconnect-dispatch test so it covers a non-connected relay.
   - Add a regression test proving action buttons do not also toggle disclosure if that behavior is not already covered.

## Verification

Required for this change category:

- Focused tests for `src/components/relay/RelayManagement.test.tsx`

Recommended:

- `npm run build`

## Risks And Watchpoints

- The main risk is invalid nested interactive markup if the whole card becomes a `button` while still containing child buttons. Avoid that by structuring the disclosure region semantically, not by wrapping every control in one giant native button.
- If the full-card click target includes the read-only tooltip icon, confirm that opening the tooltip does not also toggle disclosure unless that overlap is intentionally accepted.
