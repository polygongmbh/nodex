# Plan: Scope Mention Autocomplete To Current Relay

## Goal
Make mention autocomplete suggest only profiles from the current relay scope, without regressing:
- mention chip label resolution
- clicked-mention rendering in task content
- existing selected/explicit mention metadata on drafts

## Opinionated Approach
Do not replace the app-wide `people` surface with a scoped subset.

Instead:
1. Keep the existing full `people` list for lookups, label resolution, and non-autocomplete consumers.
2. Add a separate relay-scoped mention-candidate list to the feed/composer surface state.
3. Update composer autocomplete to read from that scoped list only.

This is safer because `surface.people` is already used by task rendering, mention chips, filters, and lookup helpers. Narrowing it globally would create side effects outside autocomplete.

## Implementation Steps

### 1. Add explicit mention-candidate surface state
Files:
- `src/features/feed-page/views/feed-surface-context.tsx`
- `src/pages/Index.tsx`

Changes:
- Extend `FeedSurfaceState` with a dedicated field for relay-scoped autocomplete people, for example `mentionablePeople` or `composePeople`.
- Keep `people` as the full known profile list.
- Populate the new field in `Index.tsx` from the already relay-scoped people derivation, not from the global people list.

Decision:
- Use the strict relay-scoped list from `sidebarPeople`, not `sidebarPeopleWithSelected` and not `peopleWithState`.

Reasoning:
- `sidebarPeople` is already derived from tasks filtered to the active relay scope.
- `sidebarPeopleWithSelected` deliberately re-injects out-of-scope selected people, which would violate the requested behavior.
- `peopleWithState` is for sidebar presentation/pinning, not autocomplete semantics.

### 2. Thread the scoped list into composer options without changing existing lookups
Files:
- `src/features/feed-page/views/feed-surface-context.tsx`
- `src/components/tasks/TaskComposer.tsx`
- `src/components/mobile/UnifiedBottomBar.tsx`

Changes:
- Update `useFeedComposerOptions()` to expose both:
  - full `people`
  - scoped autocomplete people
- In `TaskComposer`, use:
  - full `people` for explicit mention chip labels and alias resolution
  - scoped mention candidates for `filteredPeople`
- In `UnifiedBottomBar`, use the scoped mention candidates for the autocomplete menu.

Reasoning:
- The autocomplete menu should narrow.
- Existing draft state and mention chip rendering should still resolve names even if a previously added mention is now out of scope.

### 3. Keep prop-level overrides predictable
Files:
- `src/components/tasks/TaskComposer.tsx`
- `src/components/mobile/UnifiedBottomBar.tsx`
- any direct callers that bypass context if needed

Changes:
- If these components currently accept direct `people` props, decide whether to:
  - add a second optional prop for mention candidates, or
  - keep the new scoped list context-only and let props continue to mean “full people”.

Recommended choice:
- Prefer a second optional prop only if tests or isolated call sites need it.
- Otherwise keep the public component API stable and source scoped candidates from context.

Reasoning:
- This minimizes churn across existing call sites while still making the behavior explicit where it matters.

### 4. Add focused regression tests
Files:
- `src/components/tasks/TaskComposer.test.tsx`
- `src/components/mobile/UnifiedBottomBar.test.tsx`
- optionally `src/features/feed-page/controllers/use-index-derived-data.test.tsx` or a surface-context-facing test if needed

Tests to add:
- Composer autocomplete shows only in-scope people when full people contains additional out-of-scope profiles.
- Mobile combined search/compose autocomplete does the same.
- Existing explicit mention chips still resolve labels from the full people list even when the mentioned person is not in the autocomplete candidate list.

### 5. Verify with focused checks
Required:
- `npx vitest run src/components/tasks/TaskComposer.test.tsx src/components/mobile/UnifiedBottomBar.test.tsx`

Recommended:
- `npm run build`

## Risks / Things To Watch
- `TaskComposer` currently uses one `people` list for both suggestions and chip resolution. Splitting those responsibilities is the main correctness point.
- Any fallback path that still reads `surface.people` for autocomplete will leak out-of-scope profiles back into suggestions.
- If `sidebarPeople` excludes very low-activity profiles by design, autocomplete will become intentionally stricter than “all known profiles in relay scope”. If that product tradeoff is not acceptable, a new scoped candidate derivation may be needed instead of reusing `sidebarPeople`.

## Expected Outcome
- Typing `@` in desktop or mobile compose surfaces suggests only relay-scoped profiles.
- Existing mentions already attached to content/drafts still display sensible labels.
- Non-autocomplete people consumers remain unchanged.
