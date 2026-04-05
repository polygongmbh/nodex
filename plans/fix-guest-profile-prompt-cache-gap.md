# Plan: Fix Guest Profile Prompt False Positive From Kind-0 Cache Gap

## Goal

A guest who already has a valid local profile identity
such as `name` and `displayName`
must not be treated as needing profile setup
just because the local cached kind-0 snapshot has not been observed yet.

This should stop the mobile app from opening the manage/profile pane on `/feed`
for already-configured guest users.

## Root Cause

The current decision path mixes up two different ideas:

1. whether the user has usable profile metadata right now
2. whether a kind-0 cache entry has already been materialized in local storage

Today:

- [`use-kind0-people.ts`](/Users/tj/IT/nostr/nodex/src/infrastructure/nostr/use-kind0-people.ts)
  backfills a local cached kind-0 profile from `user.profile`
- [`use-index-derived-data.ts`](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-index-derived-data.ts)
  computes `hasCachedCurrentUserProfileMetadata` only from cached kind-0 events
- [`action-policy.ts`](/Users/tj/IT/nostr/nodex/src/domain/auth/action-policy.ts)
  treats missing cached kind-0 metadata as profile setup required
- [`MobileLayout.tsx`](/Users/tj/IT/nostr/nodex/src/components/mobile/MobileLayout.tsx)
  opens manage when `profileCompletionPromptSignal` increments

That creates a first-render race:
`user.profile` can already be populated,
but `cachedKind0Events` can still be empty for one render.

## Opinionated Fix

Use effective profile completeness, not cache presence,
as the auth-policy input.

If the current signed-in user already has local profile fields
that satisfy the product’s minimum completeness requirement,
the app should treat that as profile metadata being present
even before the cached kind-0 snapshot catches up.

Also streamline the timing-sensitive flow:

- keep cache backfill for persistence/bootstrap
- stop using cache-materialization timing as a prerequisite for prompt decisions
- centralize the “is this profile complete enough?” rule in one helper
- make the prompt depend on that helper’s result instead of multiple loosely-coupled signals

## Implementation Steps

1. Add tests for the actual broken condition first.
   Cover a signed-in guest with:
   - `user.profile.name`
   - `user.profile.displayName`
   - no cached kind-0 event yet

   Expected behavior:
   - auth policy does not require profile setup
   - profile prompt signal does not fire on initial load
   - mobile `/feed` stays on feed instead of opening manage

2. Introduce a derived “effective profile metadata available” signal.
   Build it from the current user state, not just the cache.
   Minimum rule:
   - true when cached kind-0 metadata exists for the current user, or
   - true when `user.profile` already has the required local fields

   Recommended location:
   - [`use-index-derived-data.ts`](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-index-derived-data.ts)
     as a replacement for the current cache-only boolean
   - then thread that into [`use-feed-auth-policy.ts`](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-feed-auth-policy.ts)

3. Define the minimum completeness rule explicitly.
   Use the same product rule for “profile is good enough” in one place.
   Based on the bug report, the default rule should be:
   - complete when `name` and `displayName` are both present and non-empty

   If the existing UX accepts one of the two fields instead,
   codify that explicitly and use the same rule in tests.

4. Simplify the timing model around prompting.
   Replace the current split-brain decision path with a single source of truth for profile readiness.
   Concretely:
   - add a small helper in auth/domain code that answers “does this signed-in user already have a usable profile?”
   - let auth policy consume that helper result directly
   - keep `profileCompletionPromptSignal` as a transition detector only, not as a place that re-decides completeness

   This should remove the current dependency chain where:
   `user.profile` -> local kind-0 cache write -> cache-derived boolean -> auth policy -> prompt signal -> manage open

5. Revisit provider-level duplication and remove avoidable overlap.
   Today both the NDK provider and feed-layer auth policy participate in profile readiness:
   - provider owns `needsProfileSetup`
   - feed layer adds the cache-derived metadata check

   During implementation, prefer one of these streamlined end states:
   - keep `needsProfileSetup` as the canonical provider answer and compute it with the local-profile fallback there, or
   - keep provider behavior as-is and make feed auth policy canonical with an explicitly named effective-profile signal

   Preferred default:
   - canonicalize the completeness rule close to auth policy/domain code first,
     then only move it deeper into the provider if that clearly reduces duplication without widening scope.

6. Keep the cache backfill behavior.
   Do not remove `rememberCachedKind0Profile(...)`.
   The local kind-0 snapshot is still useful for people lists,
   identity restoration, and offline bootstrap.
   The fix is to stop depending on that cache as the only truth source for prompting.

7. Preserve real prompt scenarios.
   The prompt should still happen when:
   - a guest truly lacks the required fields
   - a newly signed-in user has no usable local profile
   - onboarding intentionally opens the manage/profile surface

8. Verify the mobile regression path.
   After the auth-policy fix, confirm:
   - `/feed` on mobile does not open manage for a guest with local profile fields
   - `/manage` still opens manage
   - explicit profile-completion prompts still work for genuinely incomplete profiles

## Test Plan

Add or extend tests in:

- [`use-index-derived-data.test.tsx`](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-index-derived-data.test.tsx)
- new auth-policy-oriented test coverage near
  [`action-policy.ts`](/Users/tj/IT/nostr/nodex/src/domain/auth/action-policy.ts)
  or [`use-feed-auth-policy.ts`](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-feed-auth-policy.ts)
- [`MobileLayout.test.tsx`](/Users/tj/IT/nostr/nodex/src/components/mobile/MobileLayout.test.tsx)

Recommended concrete cases:

- guest with local `name` and `displayName`, empty kind-0 cache: no prompt
- guest with missing required fields, empty kind-0 cache: prompt still allowed
- guest with cached kind-0 metadata: no prompt
- cache write arriving one render later does not change prompt outcome
- non-guest flows remain unchanged

## Verification

Required for this scope:

- `npx vitest run src/features/feed-page/controllers/use-index-derived-data.test.tsx src/components/mobile/MobileLayout.test.tsx`

Recommended:

- `npm run build`

## Notes / Risks

- The current boolean name `hasCachedCurrentUserProfileMetadata`
  is no longer accurate if it starts considering live `user.profile`.
  Rename it in the same change if the new meaning broadens.
- If the implementation still requires both `needsProfileSetup` and a second feed-layer completeness flag,
  the flow is probably still more complicated than necessary.
  The cleanup goal is to remove timing-sensitive duplication, not just mask it.
- If the existing product rule for profile completeness is not actually
  “both username and display name,” resolve that before implementation,
  because the tests should lock the intended requirement precisely.
