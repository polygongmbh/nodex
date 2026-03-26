# MobileLayout Auth/Profile Orchestration Extraction Plan

## Problem Statement
`MobileLayout` currently owns app-level auth/profile orchestration concerns:
- `isSignedIn` is passed into view shell state and used for sign-in transition effects.
- `needsProfileSetup` (from NDK hook) is read directly inside the view layer.
- The layout decides whether to force-open Manage/Profile UI after sign-in.

This mixes orchestration/state-machine concerns into a view shell that should primarily render and dispatch UI intents.

## Goal
Move auth/profile transition logic out of `MobileLayout` into a dedicated mobile controller hook, so `MobileLayout` becomes presentational + intent dispatch only without bloating `Index`.

## Opinionated Direction
Make `MobileLayout` stateless with respect to auth transitions:
1. Keep shell rendering and local UI state (`showFilters`, swipe/view selection, fallback notices).
2. Remove sign-in transition detection (`previousSignedInRef`) and `needsProfileSetup` dependency from layout.
3. Feed layout only explicit, already-derived state/commands from a mobile orchestration controller.

## Proposed API Changes
### `MobileLayoutViewState`
- Remove:
  - `isSignedIn`
  - `hasCachedCurrentUserProfileMetadata`
- Keep routing/view state fields only.

### New controller hook (recommended)
Create `useMobileLayoutOrchestration` under `src/features/feed-page/controllers/`.
The hook supplies explicit orchestration outcomes rather than raw auth facts:
- `isComposeEnabled: boolean` (derived in parent from auth state)
- `shouldOpenManageForProfileCompletion: boolean` (edge-triggered by parent controller)
- `onProfileCompletionPromptHandled?: () => void` (ack callback to clear one-shot signal)

Alternative minimal path (if avoiding new interface):
- Keep `isSignedIn` only for compose-button label in bottom bar.
- Move all sign-in transition/profile-setup effects to controller and pass a one-shot `forceManageOpenSignal` numeric token.

## Implementation Steps
1. Extract orchestration logic from `MobileLayout`
- Move sign-in transition detection currently using `previousSignedInRef` to a dedicated controller hook.
- Move profile-setup gating logic (`needsProfileSetup` + cached metadata checks) to that controller.

2. Introduce parent-side signal
- Controller emits one-shot signal(s) (e.g. `manageOpenSignal` + `profileEditorOpenSignal`) consumed by `MobileLayout`.
- `FeedPageMobileShell` (or a thin mobile adapter) bridges controller output to `MobileLayout` props.

3. Remove view-layer auth hook dependency
- Delete `useNDK()` usage from `MobileLayout` for `needsProfileSetup`.
- Keep NDK dependencies in the controller hook layer.

4. Simplify `MobileLayout` effects
- Remove effect block that compares previous/current sign-in state.
- Keep only routing/onboarding-related UI effects.

5. Bottom bar integration
- Decide if bottom bar should receive:
  - `isComposeEnabled` (preferred), or
  - `isSignedIn` (if copy semantics need exact auth wording).
- Ensure this value is purely derived in parent.

6. Test updates
- Update `MobileLayout.test.tsx` to stop asserting sign-in transition internals in layout.
- Add/adjust controller tests for:
  - sign-in transition triggers manage/profile prompt signal
  - signal is one-shot and idempotent
- Keep existing compose-label behavior tests where relevant.

## Risk Areas
- Regressing onboarding step behavior that also opens Manage view.
- Duplicating "open manage" triggers (onboarding + profile completion) if signals are not deduped.
- Race conditions around one-shot signals and rerenders.

## Mitigations
- Single source of truth in parent for manage-open triggers.
- Monotonic signal tokens (`number` increment) rather than booleans.
- Explicit precedence order in parent (onboarding trigger vs profile trigger).

## Verification
Given this is cross-view orchestration work:
- Required:
  - `npm run lint`
  - `npx vitest run`
  - `npm run build`
- Focused smoke checks:
  - mobile sign-in -> profile prompt flow
  - onboarding manage/profile step
  - compose submit gating label/disabled state

## Integration Boundary (Important)
- `Index` should only wire existing inputs into the new controller hook and pass the returned mobile orchestration state to `FeedPageMobileShell`.
- No additional auth/profile branching logic should be added directly into `Index`.

## Why This Is Sensible
- Keeps view shell focused on rendering/navigation concerns.
- Makes auth/profile state transitions testable in controller logic.
- Reduces hidden side effects in layout and improves consistency with desktop orchestration boundaries.
