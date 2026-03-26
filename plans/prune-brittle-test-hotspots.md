# Plan: Fix Brittle Test Hotspots

## Goal
Reduce brittle UI tests that over-couple to localized copy or incidental component presence, while preserving behavioral coverage.

## Current Hotspot Snapshot
From `expect(screen.(getByText|queryByText)(...))` counts:
- `src/components/onboarding/OnboardingGuide.test.tsx` (40)
- `src/components/tasks/TaskComposer.test.tsx` (24)
- `src/components/tasks/FilteredEmptyState.test.tsx` (21)
- `src/components/tasks/FeedView.test.tsx` (12)
- `src/components/tasks/FailedPublishQueueBanner.test.tsx` (9)
- `src/components/auth/NoasAuthForms.test.tsx` (8)
- `src/components/auth/NostrAuthModal.test.tsx` (7)

## Opinionated Strategy
1. Prefer behavior/outcome assertions over copy presence.
- Validate dispatch calls, callback payloads, state transitions, visibility modes, and role-level affordances.
- Avoid asserting exact sentence-level copy in feature tests unless the copy itself is the contract.

2. Keep copy assertions only in dedicated copy/i18n-focused tests.
- If specific wording matters, isolate it to targeted i18n/messaging suites.
- Remove incidental copy checks from interaction-flow tests.

3. Use stable semantics.
- Favor `getByRole`, labels, and existing stable selectors.
- Do not add new runtime `data-testid` selectors unless existing semantics are insufficient and exceptions apply.

## Refactor Patterns to Apply
- `expect(screen.getByText("...")).toBeInTheDocument()`
  -> Replace with role/state/dispatch assertion tied to the user action outcome.
- `expect(screen.queryByText("...")).not.toBeInTheDocument()`
  -> Replace with `queryByRole(...)`, state marker checks, or callback non-invocation checks.
- Copy-dependent assertions inside flow tests
  -> Move to a dedicated i18n-oriented test file only if copy contract is intentional.

## Execution Plan
### Phase 1: Highest-Churn Files (largest brittleness reduction)
- `src/components/onboarding/OnboardingGuide.test.tsx`
- `src/components/tasks/TaskComposer.test.tsx`
- `src/components/tasks/FilteredEmptyState.test.tsx`

Actions:
- Replace step-title/body string checks with step index/progression and target-presence behavior.
- Replace composer warning sentence checks with blocked-state behavior (button enabled/disabled, submit callbacks, alert role presence/absence).
- Replace empty-state prose checks with mode/scoping markers already present (`data-empty-mode`, scoped relay/channel/person indicators).

### Phase 2: Secondary Hotspots
- `src/components/tasks/FeedView.test.tsx`
- `src/components/tasks/FailedPublishQueueBanner.test.tsx`
- `src/components/auth/NoasAuthForms.test.tsx`
- `src/components/auth/NostrAuthModal.test.tsx`

Actions:
- Focus on event/reducer outcomes, rendered task/state-entry identity, and auth flow callbacks.
- Keep only minimal role-level presence checks for primary controls.

### Phase 3: Remaining Medium/Small Files
- `src/components/relay/RelayManagement.test.tsx`
- `src/components/mobile/UnifiedBottomBar.test.tsx`
- `src/components/mobile/MobileFilters.test.tsx`
- Tail files with 1-3 occurrences.

Actions:
- Sweep remaining copy assertions and convert to behavioral checks where not intentional copy contracts.

## Commit Slicing
Use small, reviewable `test:` commits by domain:
1. `test: reduce copy-coupled onboarding assertions`
2. `test: harden task composer/empty-state behavioral checks`
3. `test: decouple feed/auth/banner tests from incidental copy`
4. `test: final brittle-assertion cleanup sweep`

## Verification Plan
Per phase:
- Run targeted suites for changed files only.
- Ensure no net-new runtime `data-testid` usage outside approved exceptions.

Final pass:
- `npx vitest run`
- Optional sanity grep to track progress:
  - `rg -n "expect\(screen\.(getByText|queryByText)\(" src --glob "**/*.test.ts*"`

## Success Criteria
- Hotspot files no longer depend on sentence-level copy for interaction-flow validity.
- Behavioral intent remains covered (actions, state transitions, and accessibility contracts).
- Test suite remains green with improved resilience to localization/copy edits.
