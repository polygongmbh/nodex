# TaskComposer Display Ownership Shift

## Goal

Keep composer behavior unchanged while moving scope-chip display ownership out of `TaskComposer` so the leaf composer needs fewer feed-specific contextual parameters.

## Non-goals

- No publish payload changes.
- No changes to how channel/person scope affects submission.
- No visual redesign of the composer.
- No changes to mention or hashtag autocomplete behavior.

## Opinionated Direction

Treat `TaskComposer` as a compose widget, not a feed-scope adapter.
It should own only user-authored composer state and local input UX.
Anything derived from external feed filters or page scope should be computed above it and rendered above it.

## Current Problem

`TaskComposer` currently mixes two distinct concepts:

- explicit chips the user adds while composing
- chips mirrored from external feed scope and selection state

That coupling forces `TaskComposer` to accept and interpret contextual parameters that belong to the page/wrapper layer.
The result is a heavier runtime/environment model than the leaf actually needs.

## Target Boundary

### `TaskComposer` should own

- text input state
- explicit tag chips added by the user
- explicit mention chips added by the user
- metadata fields such as dates, priority, attachments, and listing metadata
- local autocomplete state
- draft restore/write behavior
- submit payload assembly from composer-owned state

### `TaskCreateComposer` should own

- mapping feed/app context into composer props
- rendering any scope-derived chip row outside `TaskComposer`
- syncing external scope state into submit-time context when needed
- relay/filter integration

### Feed/page layer should own

- selected people
- included channels
- filter scope semantics
- whether any scope chips are shown at all

## Refactor Steps

1. Inventory the current chip model and split points.
   Identify every `TaskComposer` usage of:
   - `filterTagNames`
   - `filterMentionPubkeys`
   - filter-removal callbacks
   - auto-managed chip refs and effects
   Confirm which parts are display-only versus payload-affecting.

2. Introduce an external scope-chip presentation contract.
   Add a small wrapper-level prop or component for rendering scope-derived chips above the composer.
   Keep it intentionally presentational.

3. Remove scope-chip display responsibility from `TaskComposer`.
   Delete the rendering paths that show externally mirrored chips inside the composer.
   Preserve explicit user-authored chip rendering inside `TaskComposer`.

4. Move scope synchronization to `TaskCreateComposer`.
   Keep wrapper-level logic responsible for translating active feed scope into composer submit context.
   Do not require `TaskComposer` to know where that scope came from.

5. Reduce composer runtime/context inputs.
   Trim `TaskComposer` props and runtime dependencies so the leaf no longer receives feed-scope chip control inputs.
   Only keep context that is still legitimately needed for local compose UX, such as autocomplete sources.

6. Update tests around ownership, not behavior.
   Rewrite tests so:
   - `TaskComposer` covers explicit chips and submit payload behavior
   - wrapper/page tests cover scope-chip display and any scope mirroring
   Avoid reasserting the same behavior at multiple levels.

7. Run focused verification.
   Minimum:
   - composer unit tests
   - wrapper tests covering shared/kanban/calendar surfaces if touched
   Recommended:
   - `npm run build`

## Expected Code Moves

- `TaskComposer.tsx`
  Remove external scope-chip rendering and related prop plumbing.

- `TaskCreateComposer.tsx`
  Become the adapter that renders scope-owned chip UI and passes only composer-local needs downward.

- `use-composer-filter-sync.ts` or equivalent wrapper helpers
  Own the mapping between feed scope and composer submission/display.

- View/wrapper tests
  Assert scope-chip ownership at the wrapper layer instead of the leaf composer layer.

## Key Constraints

- Preserve current localized copy and semantics.
- Preserve current draft behavior.
- Preserve current autocomplete data sources unless they are strictly display-only.
- Do not silently change what gets submitted when feed scope is active.

## Risks

- Hidden coupling between displayed chips and submit payload construction.
- Tests may currently encode the mixed ownership model and need careful untangling.
- Scope-removal interactions may currently be wired from inside `TaskComposer`; those handlers need a new owner without changing visible behavior.

## Verification Notes

- Focus first on behavior parity for:
  - explicit hashtag chips
  - explicit mention chips
  - externally scoped channels/people
  - submit payload contents under active scope
- Compare before/after behavior at the wrapper boundary, not only inside the leaf.

## Milestone Checklist

- duplication reviewed
- consistency issues reviewed
- large/complex components reviewed
- deferrals with rationale
