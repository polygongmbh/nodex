# Relay-Scoped People List Regression Plan

## Debug Summary

- The original relay-scoped people derivation is still present in `useIndexDerivedData` and was introduced by `de0246f fix: scope sidebar people derivation to active relays`.
- The shared regression affecting both desktop and mobile was introduced by `2a729f7 fix: keep sidebar people visible with frecency` on 2026-03-22.
- `2a729f7` changed `deriveSidebarPeople` so a positive person-frecency score can include a person even when they have no qualifying activity in the active relay scope.
- That behavior is shared because both desktop and mobile ultimately consume the same derived visible people list.
- `2a729f7` is already contained in both `v2.8.0` and `v2.9.0`, so the true regression predates `v2.9.0` even if it was noticed there.
- `148ba57 refactor: centralize feed surface state and lookup plumbing` on 2026-03-23 introduced a separate mobile-only visibility bug that was later fixed by `2debaeb`, but that is not the root cause of the current cross-platform relay-scope regression.

## Evidence

- Relay-scoped sidebar people are still derived from relay-filtered tasks in `src/features/feed-page/controllers/use-index-derived-data.ts`.
- `v2.8.0` and `v2.9.0` both still contain the relay-scoped sidebar derivation test in `src/features/feed-page/controllers/use-index-derived-data.test.tsx`.
- `2a729f7` changed `src/domain/content/sidebar-people.ts` from:
  - excluding people without enough scoped task activity
  - to allowing inclusion whenever `personalScore > 0`
- `2a729f7` also added a test explicitly asserting that a manually interacted person remains visible after switching to another relay, which is the opposite of strict relay scoping.
- Because `useIndexDerivedData` passes frecency scores into `deriveSidebarPeople`, the broadened behavior affects both desktop and mobile.

## Fix Strategy

1. Restore strict relay scoping for visible people:
   - Change `deriveSidebarPeople` in `src/domain/content/sidebar-people.ts` so frecency no longer qualifies a person for inclusion by itself.
   - Keep relay-scoped task activity as the gate for whether a person appears in the visible list.

2. Preserve useful frecency behavior without broadening scope:
   - Continue using person frecency only as a ranking signal among already relay-visible people.
   - Do not let frecency resurrect people from hidden relays into the list.

3. Update tests to match the intended contract:
   - Remove or rewrite the `use-index-derived-data.test.tsx` case added by `2a729f7` that expects an interacted person to remain visible after switching away from their relay.
   - Add a focused test proving a person with positive frecency but no active-relay activity is excluded from the visible people list.
   - Keep the existing relay-switch test that proves the visible list follows the active relay scope.

4. Validate shared behavior on both surfaces:
   - Verify desktop sidebar and mobile filters/selectors render the same scoped list after the derivation change.
   - Keep the later mobile visible-list wiring only if needed for parity, but treat it as secondary to the shared derivation fix.

## Verification

- Required for this localized logic/UI change:
  - `npx vitest run src/domain/content/sidebar-people.test.ts src/features/feed-page/controllers/use-index-derived-data.test.tsx`
- Recommended:
  - `npx vitest run src/components/mobile/MobileFilters.test.tsx src/components/mobile/UnifiedBottomBar.test.tsx`
  - `npm run build`

## Notes

- If the product still wants some notion of "recently interacted people," that should be exposed separately from the relay-scoped visible people list, not mixed into it.
- The user’s date range was directionally close, but the concrete regression commit is 2026-03-22 (`2a729f7`), which shipped before both `v2.8.0` and `v2.9.0`.
