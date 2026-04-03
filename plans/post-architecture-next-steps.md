# Plan: Post-Architecture Next Steps

## Goal

Use the new `domain -> infrastructure -> features` shape to finish the highest-value remaining work without falling back into low-value file shuffling.

Primary outcomes:

- separate pure submission-routing rules from Nostr/logging concerns
- establish the next reusable listings seam for map/marketplace frontends

## Current Assessment

### Already in good shape

- `src/infrastructure/nostr/` now owns the main Nostr adapter stack
- `src/infrastructure/preferences/` now consistently owns storage adapters
- `src/domain/content/`, `src/domain/relays/`, and `src/domain/preferences/` now hold substantial pure logic
- `src/domain/listings/` exists and already owns listing identity

### Remaining friction

- `src/lib/nostr/task-relay-routing.ts` still mixes reusable decision logic with Nostr-flavored logging placement
- `src/domain/listings/` is still too thin to prove a second frontend
- `src/features/feed-page/` now has the right basic split, but the next reusable seams are no longer page-structure changes; they are domain extraction and second-frontend proof work
- a few `src/lib/nostr/*` modules remain, but most are acceptable shared support modules rather than urgent architecture debt

## Recommendation Order

### Milestone 1: Split Submission Routing Into Pure Domain Logic

Target: `src/lib/nostr/task-relay-routing.ts`

Why:

- this logic answers “what relay should this submission target?”
- that is reusable business/application policy, not transport code

Steps:

1. split pure routing decisions from logging side effects
2. move the pure decision functions into either:
   - `src/domain/relays/submission-routing.ts`, or
   - `src/domain/content/submission-routing.ts`
3. keep any debug logging wrapper in controller/infrastructure code

Recommendation:

- prefer `src/domain/relays/submission-routing.ts`
- keep the function signatures generic and free of React/Nostr transport details

Success criteria:

- domain routing functions import only app/domain types
- no `nostrDevLog` in the moved pure logic

### Milestone 2: Grow `domain/listings` Beyond Identity

Target the next pure reusable listings seam.

Current state:
- `src/domain/listings/` still only contains `listing-identity.ts`

First candidate:

- `src/domain/listings/location.ts`

Split out:

- geohash/location rules that are genuinely frontend-agnostic
- listing/map projection helpers as needed

Keep in infrastructure:

- Nostr tag parsing/building for location metadata
- wire-format translation

Possible follow-ups:

- listing status transition helpers
- marketplace/map projection helpers

Success criteria:

- listings domain can support feed, map, and marketplace projections without importing React or Nostr adapters

### Milestone 3: Validate With a Second Frontend Slice

Do this only after the submission-routing split and the first real `domain/listings` expansion are far enough along.

Best target:

- listings map prototype

Why:

- it forces use of `domain/listings`
- it proves the code no longer assumes “feed/task list” as the only frontend

Scope recommendation:

- small read-only prototype is enough
- do not block on full marketplace functionality

## Deliberate Non-Priorities

These are not the best next moves unless they become blockers.

### `src/lib/nostr/event-id.ts`

- tiny pure utility
- keep as-is for now

### `src/lib/nostr/types.ts`

- shared protocol vocabulary
- keep as-is for now

### `src/lib/nostr/utils.ts`

- leave in place unless a specific sub-function clearly belongs elsewhere

### `src/lib/nostr/dev-logs.ts`

- cross-cutting concern
- do not spend time relocating it now

## Commit Strategy

Use small functional commits by boundary, not by file move.

Recommended sequence:

1. `refactor: move submission routing rules into domain`
2. `refactor: establish listing location domain rules`
3. `refactor:` add one more meaningful listings-domain seam
4. `feat:` or `refactor:` build the first listings-map/frontend proof slice

Avoid a commit that is just "move a bunch of helpers" unless it clearly unlocks one of the two goals above.

## Verification

For each major step:

- `npm run lint`
- `npx vitest run`
- `npm run build`

For smaller sub-steps inside a milestone:

- targeted `eslint`
- targeted `vitest`
- `npm run build` before commit

## Decision Checkpoint

After moving submission routing and expanding `domain/listings`, reassess whether the next best frontier is:

- another reusable domain seam that would help alternate frontends, or
- the first thin map/listings proof slice to validate the architecture in practice

Do not keep moving files mechanically once the architecture stops gaining real reuse value.
