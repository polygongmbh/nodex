# Plan: Make mobile location button reversible

## Problem

On mobile, there is no separate location panel surface from the user's point of
view.
There is only the location toolbar button, which should behave like a true
toggle.

Right now that button only reliably toggles on.
Once a location has been set, the underlying composer logic treats the location
UI as active whenever `locationGeohash` exists, so tapping the same button again
does not turn the location state back off.

## Opinionated Fix

Make the mobile location button a real on/off control.

- First tap enables location behavior.
- Second tap disables it again.
- The implementation should stop treating a populated `locationGeohash` as an
  unconditional "on" signal for the mobile toggle state.

The fix should follow the actual mobile UX contract: one button, two states.

## Implementation Steps

1. Update `src/components/tasks/TaskComposer.tsx`

- Trace how the mobile location button derives its active state from
  `showLocationControls` and `locationGeohash`.
- Remove the logic that makes the button effectively one-way once a geohash is
  present.
- Ensure a second tap on the same button can return the location toggle to the
  off state.

2. Decide the off-state behavior explicitly

- If "toggle off" is intended to remove location from the outgoing compose
  payload, clear or ignore `locationGeohash` when the button is turned off.
- If the codebase distinguishes between "stored value" and "enabled for submit",
  implement that distinction explicitly instead of inferring it from field
  visibility.

3. Add focused composer tests

- Add a regression test that:
  - taps the mobile location button on
  - sets location state
  - taps the same button off
  - verifies the toggle returns to the inactive state
- Assert the resulting submit payload matches the intended off-state behavior.

4. Verify with focused checks

- Run the changed composer test file.
- If the implementation touches broader compose behavior than expected, expand
  verification to `npx vitest run` for the compose-related suite.

## Key Choices

- Model this as a toggle-state bug, not a panel-visibility bug.
- Define "off" in terms of compose behavior, not just styling.
- Keep the change localized to the composer rather than introducing new mobile-
  specific controller state elsewhere.

## Risks / Watchpoints

- The current code appears to conflate "has a geohash value" with "location is
  toggled on"; that assumption may also affect submit behavior.
- Tests need to exercise the compact/mobile composer path specifically, or they
  may miss the regression.
