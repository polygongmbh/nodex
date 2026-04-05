# Fix Noas Host Prefill After Async Detection

## Problem

The default Noas host can be discovered asynchronously during app bootstrap.
`NostrAuthModal` derives `defaultNoasUrl` from `defaultNoasHostUrl`,
but it initializes `editableNoasUrl` only once on mount.
If the modal renders before async discovery completes,
the host stays empty until a later app startup,
so sign-in and sign-up do not prefill the detected host immediately.

## Opinionated Approach

Fix this at the modal state boundary, not in discovery.
The bootstrap path in `App.tsx` already updates the provider once discovery resolves.
The missing link is syncing that provider update into the modal's local editable host state.

Use a guarded `useEffect` in `NostrAuthModal` that updates `editableNoasUrl`
when `defaultNoasUrl` changes from empty to a detected value,
but only while the user has not already diverged from the current default
or explicitly started editing a custom host.

## Implementation Steps

1. Inspect `NostrAuthModal` state transitions around:
   - `defaultNoasUrl`
   - `editableNoasUrl`
   - `isEditingNoasHost`
   - modal open/close resets

2. Add host-sync logic in `NostrAuthModal`:
   - react to `defaultNoasUrl` changes after mount
   - copy the new detected host into `editableNoasUrl`
   - avoid overwriting user-entered or intentionally edited host values

3. Keep close/reset behavior aligned:
   - closing the modal should still reset to the latest resolved default host
   - reopening after detection should continue to open with the resolved host prefilled

4. Add regression tests in `src/components/auth/NostrAuthModal.test.tsx`:
   - mount with no default host, then rerender with `defaultNoasHostUrl`
   - verify sign-in view shows the inline suffix immediately
   - verify switching to sign-up also uses the detected host immediately
   - verify a user-entered custom host is not clobbered by a later provider update

5. Run focused verification for this localized behavior:
   - `npx vitest run src/components/auth/NostrAuthModal.test.tsx`

## Expected Outcome

When Noas host detection resolves during the current session,
the auth modal should prefill the host immediately on the active sign-in/sign-up flow,
without requiring a second app run and without trampling intentional user edits.
