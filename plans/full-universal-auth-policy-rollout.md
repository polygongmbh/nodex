# Full Universal Auth Policy Rollout Plan

## Objective
Finish migration to a single universal auth-action policy so auth/write restrictions are consistent across all views and controllers, with no view-level inline auth orchestration.

## Current Status

Foundational pieces are already landed:
- `src/domain/auth/action-policy.ts`
- `src/features/auth/controllers/use-auth-action-policy.ts`
- `src/features/auth/controllers/use-profile-completion-prompt-signal.ts`
- `src/features/feed-page/controllers/use-feed-auth-policy.ts`

Large parts of the view migration are also landed:
- `MobileLayout` now consumes `canCreateContent` and `profileCompletionPromptSignal`
- `UnifiedBottomBar` already consumes `canCreateContent`
- `TaskComposer` already uses `useAuthActionPolicy()`
- task views now share auth/focus helpers through `use-task-view-services.ts`
- `use-task-publish-controls` already takes `canModifyContent`

What remains is mostly cleanup and consistency work, not initial architecture.

## Principles
- Keep `Index` thin (wiring only), no new branching logic there.
- Centralize identity/profile capabilities in shared policy.
- Keep relay connectivity constraints separate from identity auth policy.
- Remove duplicated inline checks (`!user`, `isSignedIn`, `needsProfileSetup`) where they encode universal behavior.

## Target End State
1. App-wide policy source of truth:
- `src/domain/auth/action-policy.ts`
- `src/features/auth/controllers/use-auth-action-policy.ts`
- `src/features/auth/controllers/use-profile-completion-prompt-signal.ts`

2. All compose-capable surfaces consume policy-derived capability flags.

3. Publish controllers consume shared auth capability inputs (not local inline auth derivation), while still composing relay connectivity checks locally.

4. No mobile-only or feed-only auth orchestration logic remains in layouts.

## Remaining Integration Work

### A. Controller Layer
1. `use-task-publish-flow`
- Replace duplicated post-failure mapping (`not-authenticated` etc.) with one shared guard outcome mapping utility.
- Ensure consistent `TaskCreateFailureReason` output across all create paths.

2. `use-task-status-controller` / related modify flows
- Audit for any remaining direct auth assumptions and route universal auth checks through shared capability inputs where applicable.

### B. View/Component Layer
1. `TaskComposer` + `UnifiedBottomBar`
- Ensure both use the same policy semantics for sign-in CTA, submit disable rules, and blocker copy triggers.
- Eliminate any remaining divergent auth conditions.

2. `MobileFilters`
- Keep profile editor behavior local, but remove any avoidable auth-policy duplication around profile-completion gating and sign-in presentation.

3. shared task-view services
- Verify `use-task-view-services.ts` is now the canonical auth entry point for feed/list/tree/kanban/calendar surfaces.

### C. Contract Cleanup
1. Normalize prop naming across surfaces:
- Prefer capability terms (`canCreateContent`, `canModifyContent`) over auth-state booleans.

2. Remove dead transitional props and code paths left from migration.

3. Update type contracts where capability props are now canonical.

### D. Tests
1. New unit tests:
- `action-policy` permutations (signed out, signed in, profile setup required, metadata missing).
- profile prompt signal edge behavior (one-shot on sign-in transitions).

2. Update integration tests:
- mobile profile prompt orchestration via signal.
- compose gating parity between `TaskComposer` and `UnifiedBottomBar`.
- publish controls auth behavior via shared capability path.
- task-view auth behavior through `use-task-view-services.ts`

3. Dead-path pruning tests:
- remove fixture-only legacy props/callbacks no longer used.

## Execution Sequence (Opinionated)
1. Stabilize policy contracts
- finalize policy shape and capability names.

2. Finish controller migration first
- `use-task-publish-flow` -> shared guard outcome mapping.

3. Finish remaining views
- `MobileFilters`, any residual user-derived compose visibility, and shared task-view cleanup.

4. Perform cleanup pass
- remove transitional props/legacy checks.
- prune dead tests/fixtures.

5. Final verification and hardening
- full lint/test/build.

## Verification Gates
Because this is cross-view and controller-level:
- Required:
  - `npm run lint`
  - `npx vitest run`
  - `npm run build`
- Focused smoke list:
  - signed-out create attempt on mobile and desktop composer
  - signed-in + missing profile metadata triggers exactly one profile prompt signal
  - task modify attempts when signed out open auth modal and show correct notifications
  - relay-disconnected modify block remains unaffected

## Risks
- Over-centralizing non-auth concerns into policy.
- Regressions from prop contract shifts in heavily tested components.
- Divergence during migration if mixed old/new checks coexist.

## Mitigations
- Keep policy identity/profile-only.
- Keep relay/network constraints separate and composed in controllers.
- Migrate in small slices with focused tests per slice.

## Deliverables
- Fully migrated auth capability usage across controllers/views listed above.
- No inline auth orchestration in layout components.
- Dead transitional code removed.
- Updated tests reflecting final contracts.
