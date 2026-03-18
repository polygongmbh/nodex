# Remove Brittle Text Assertions

## Goal

Reduce test breakage caused by copy, localization, and minor UI wording changes by replacing brittle exact-text assertions with stable behavior and accessibility contracts.

## Opinionated Approach

Prefer this order of stability for UI tests:

1. Semantic role + accessible name when the name is part of the product contract.
2. Stable `data-testid` only for interaction surfaces that do not have reliable semantics.
3. State assertions on values, attributes, visibility, selection, and callbacks.
4. Translation-key-backed assertions only in explicit i18n/parity tests.

Do not keep asserting exact prose for generic helper text, placeholders, button titles, or incidental validation copy unless that copy is itself the contract being protected.

## Status Update

- Composer/mobile compose surfaces now use role-based queries and shared selectors; action texts no longer need exact matching thanks to the unified `createTask`/`addComment` keys.
- Added the new test-query guideline in `AGENTS.md`, calling for semantics-first selectors or stable `data-testid` usage and pointing copy checks to i18n suites.
- Next focus: stabilize onboarding/auth/lightbox tests and start extracting shared helpers for these flows so further text-comparison edits can reuse the same patterns.

## Why This Path

- It keeps tests aligned with what users can actually do, not with wording that will keep evolving.
- It works better with the repo's required localization support across `en`, `de`, and `es`.
- It reduces churn from product copy changes without weakening behavior coverage.
- It lets i18n tests own string parity while feature tests own interaction and outcomes.

## Scope Inventory

Current fragile patterns to target:

- `getByText` / `findByText` / `queryByText` for onboarding and auth helper copy.
- `toHaveTextContent` assertions on status/helper panels where the exact message is not the contract.
- `getByPlaceholderText` and some `getByLabelText` assertions in composer-like tests where labels are editorial rather than behavioral.
- Assertions against concatenated button labels like `Create Task / Add Comment` that are especially sensitive to copy tweaks.

Lower priority:

- Harness tests that intentionally expose serialized internal state with `data-testid`; these are already relatively stable.
- Tests where exact user-facing copy is the feature under test, such as locale parity or specific messaging requirements.

## Execution Plan

### Phase 1: Define Test Query Rules

- Add a short testing guideline to `AGENTS.md` or test docs:
  - Prefer `getByRole` over text and placeholder queries.
  - Use regex names sparingly and only for stable product nouns/actions.
  - Use `data-testid` for composite/mobile controls with icon-only affordances.
  - Keep copy-specific assertions limited to i18n and messaging tests.

### Phase 2: Introduce Stable Selectors

- Add missing stable hooks where semantics are weak:
  - primary/secondary composer action buttons
  - blocker panels and remediation CTA containers
  - onboarding hotspot/step containers
  - auth mode toggles and advanced-settings regions

- Standardize naming:
  - `data-testid="compose-primary-action"`
  - `data-testid="compose-secondary-action-comment"`
  - `data-testid="submit-block-panel"`
  - `data-testid="onboarding-step-title"`

### Phase 3: Migrate Highest-Churn Tests First

- Start with files that already showed fragility:
  - `src/components/tasks/TaskComposer.test.tsx`
  - `src/components/mobile/UnifiedBottomBar.test.tsx`
  - `src/components/onboarding/OnboardingGuide.test.tsx`
  - `src/components/auth/NostrAuthModal.test.tsx`
  - `src/components/auth/NoasAuthForms.test.tsx`

- Replace:
  - `getByPlaceholderText(...)` with `getByRole("textbox", ...)` or test ids.
  - `getByText("...")` button clicks with `getByRole("button", ...)` or test ids.
  - `toHaveTextContent("exact helper copy")` with assertions on panel presence, CTA presence, or callback/result state.

### Phase 4: Extract Test Helpers

- Add shared helpers under `src/test/` for repeated queries:
  - `getComposerInput(screen, variant)`
  - `getPrimaryComposeAction(screen)`
  - `openMobileComposeOptions(screen)`
  - `getOnboardingStep(screen, id)`

- This prevents query drift and centralizes selector updates.

### Phase 5: Enforce Going Forward

- Add an ESLint rule or lightweight repository script to flag new brittle patterns in tests:
  - warn on `getByPlaceholderText`
  - warn on `getByText("literal")` for interactive elements
  - allow exceptions via inline comment for truly copy-specific tests

- If lint automation is too heavy, add a review checklist item instead.

## Refactor Rules

- Keep one assertion per protected contract:
  - behavior result
  - control availability
  - accessibility identity

- Avoid duplicating copy assertions in multiple files.
- When a text assertion remains, add a short comment explaining why that exact wording matters.
- Do not replace everything with `data-testid`; preserve accessible queries where they are strong and intentional.

## Suggested Milestones

1. Add stable selectors/helpers for composer and mobile compose surfaces.
2. Migrate composer/mobile tests and verify with focused `vitest`.
3. Migrate onboarding/auth tests.
4. Add guideline/lint guard to prevent regression.

## Verification

For each migration batch:

- Run focused tests for changed files.
- Run `npm run lint`.

After major batches:

- Run `npx vitest run`.

## Risks

- Overusing `data-testid` can weaken accessibility coverage if it replaces good role-based queries.
- Some exact copy checks are legitimate product requirements and should remain.
- Broad search/replace without categorizing tests will erase useful messaging coverage.

## Recommended First Implementation Slice

Start with composer and mobile compose tests only. They are the highest-churn surfaces, already mix placeholders with exact labels, and will give the biggest reliability win with the smallest write scope.
