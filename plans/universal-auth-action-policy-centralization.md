# Universal Auth Action Policy Centralization Plan

## Scope
Create a single app-wide auth/capability policy layer and migrate inline auth-gating logic to it.

This explicitly avoids:
- adding new orchestration branches to `Index`
- making policy mobile-specific
- making policy feed-page-specific

## Problem
Auth/write restrictions are currently implemented in multiple UI components and controllers with duplicated checks (`!user`, `isSignedIn`, `needsProfileSetup`, plus per-surface side effects). This creates drift and inconsistent behavior/copy.

## Target Architecture

## 1) Pure domain policy (no React, no side effects)
- New file: `src/domain/auth/action-policy.ts`
- Expose pure functions:
  - `computeAuthActionPolicy(input): AuthActionPolicy`
  - `resolveAuthBlockReason(...)` / helper predicates as needed

Suggested `AuthActionPolicy` shape:
- `isSignedIn: boolean`
- `canCreateContent: boolean`
- `canModifyContent: boolean`
- `requiresProfileSetup: boolean`
- `shouldPromptProfileCompletion: boolean` (state, not edge)
- `canOpenCompose: boolean`
- `composeSignInCtaLabelKey: string`
- `blockedReasonKeys` for post/modify where needed

## 2) App-level hook facade
- New file: `src/features/auth/controllers/use-auth-action-policy.ts`
- Reads canonical providers/state (`useNDK`, relay capability inputs as needed)
- Returns memoized `AuthActionPolicy`
- Optional helper callbacks for side effects:
  - `requestSignIn()`
  - `requestProfileCompletion()`

## 3) Edge-trigger orchestration helper (optional but recommended)
- New file: `src/features/auth/controllers/use-profile-completion-prompt-signal.ts`
- Converts policy state into one-shot signal token for shells/layouts:
  - input: `isSignedIn`, `requiresProfileSetup`, `hasCachedCurrentUserProfileMetadata`
  - output: `promptSignal` (number)
- Keeps edge detection out of view components.

## Integration Points (Inline -> Hook)

1. Mobile sign-in/profile transition orchestration
- Current inline logic:
  - `src/components/mobile/MobileLayout.tsx:150-152`
  - `src/components/mobile/MobileLayout.tsx:477-484`
- Replace with:
  - consume `promptSignal` + `canCreateContent` from policy/controller props
  - remove direct `useNDK()` + `previousSignedInRef` from `MobileLayout`

2. Mobile composer gating + sign-in affordance
- Current inline logic:
  - `src/components/mobile/UnifiedBottomBar.tsx:717-739`
  - `src/components/mobile/UnifiedBottomBar.tsx:879-887`
  - `src/components/mobile/UnifiedBottomBar.tsx:1552-1556`
- Replace with:
  - policy-driven flags (`canCreateContent`, `signInCtaLabelKey`)
  - keep local relay/tag/attachment checks local; auth part from policy

3. Desktop/shared TaskComposer auth gating
- Current inline logic:
  - `src/components/tasks/TaskComposer.tsx:1068-1070`
  - `src/components/tasks/TaskComposer.tsx:2222-2236`
- Replace with:
  - policy input instead of raw `Boolean(user)`
  - sign-in button/copy from policy (or policy-provided key)

4. Composer visibility in feed/task views
- Current inline logic:
  - `src/components/tasks/TaskTree.tsx:414`
  - `src/components/tasks/FeedView.tsx:1280`
  - `src/components/tasks/ListView.tsx:605`
- Replace with:
  - `canOpenCompose` from policy (plus existing guide override)

5. Publish guard logic (post/modify)
- Current inline logic:
  - `src/features/feed-page/controllers/use-task-publish-controls.ts:62-79`
- Replace with:
  - auth branch from policy (`canCreateContent`/`canModifyContent`)
  - keep relay-connectivity branch local or add as separate capability input

6. Publish flow failure mapping
- Current inline logic:
  - `src/features/feed-page/controllers/use-task-publish-flow.ts:275-279`
- Replace with:
  - use guard outcome codes from shared policy/controller helper
  - map to `TaskCreateFailureReason` in one shared utility

## Where NOT to Migrate (Keep Local)
- `NostrAuthModal` internal UX/state machine details (`src/components/auth/NostrAuthModal.tsx`)
- `MobileFilters` profile editor form handling details (`src/components/mobile/MobileFilters.tsx`)

These should consume policy data where useful, but not be forcibly rewritten into policy logic.

## Rollout Plan (Incremental)

Phase 1: Introduce policy without behavior change
1. Add `action-policy.ts` + `use-auth-action-policy.ts`.
2. Add tests for policy permutations (signed out, signed in without profile metadata, signed in ready).
3. Wire hook in shell/controller layer only; no UI changes yet.

Phase 2: Remove view-level auth derivation
1. Migrate `MobileLayout` to signal-based profile prompt input.
2. Migrate `UnifiedBottomBar` and `TaskComposer` auth branches to policy inputs.
3. Remove direct `needsProfileSetup`/`isSignedIn` derivation in these components.

Phase 3: Unify publish guards
1. Refactor `use-task-publish-controls` to consume policy for auth decisions.
2. Keep relay connectivity checks separate but compose final guard result via shared helper.
3. Update `use-task-publish-flow` to consume shared guard result mapping.

Phase 4: Cleanup
1. Delete redundant booleans/props that duplicate policy (`isSignedIn` where no longer needed directly).
2. Consolidate copy key usage around policy outputs.
3. Remove dead tests/fixtures tied to removed inline checks.

## Testing Strategy
- Unit tests:
  - new domain policy function(s)
  - edge-trigger signal helper
- Focused integration tests:
  - mobile profile prompt opens exactly once after sign-in when required
  - compose surfaces show consistent sign-in CTA across mobile and desktop
  - publish guard returns consistent reasons (`not-authenticated` vs relay-related)
- Required verification for cross-view refactor:
  - `npm run lint`
  - `npx vitest run`
  - `npm run build`

## Risks / Tradeoffs
- Over-centralization risk: policy becomes too broad if relay/write constraints are mixed without boundaries.
- Migration churn across many surfaces.

Mitigation:
- keep auth policy focused on identity/profile capability
- treat relay connectivity as separate capability input composed at call sites

## Recommendation
Proceed with this centralization. It is structurally cleaner and directly addresses your concern: auth posting restrictions are universal and should not live in mobile/view-level inline logic.
