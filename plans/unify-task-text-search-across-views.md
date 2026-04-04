## Goal

Move task text search to a single domain helper/index so every view receives already-filtered tasks instead of recomputing search behavior locally.

## Current Diagnosis

- `src/domain/content/task-view-filtering.ts` already builds a reusable `searchableTextByTaskId` index and uses it in `filterTasksForView()`.
- `src/features/feed-page/controllers/use-task-view-filtering.ts` routes feed, list, and kanban through that shared filter path.
- `src/features/feed-page/controllers/use-task-view-states.ts` tree selectors still use a separate `matchesFilter()` path with `taskMatchesTextQuery()`, so tree search semantics can drift from the other views.
- The searchable-text composition is duplicated in:
  - `src/domain/content/task-view-filtering.ts`
  - `src/domain/content/task-text-filter.ts`
- Table/list rendering also strips `#` for display via `src/lib/breadcrumb-label.ts`, which is fine for presentation, but it becomes risky when search logic is not fully centralized because developers can accidentally key matching off view-formatted text.

## Opinionated Fix

1. Extract searchable-text construction into a dedicated domain helper.
   - Add a helper such as `buildTaskSearchableText(task, people)` or `getTaskSearchDocument(...)`.
   - Include raw content, normalized tags, `#tag` variants, mentions, assignees, and resolved author fields exactly once.
   - Make both `task-view-filtering.ts` and `task-text-filter.ts` depend on that helper instead of maintaining parallel haystack logic.

2. Split shared matching from view-specific visibility.
   - Centralize the definition of a direct text match so every view uses the same searchable-text helper/index.
   - Treat tree as the exception at the visibility layer, not at the matching layer.
   - Preferred direction: expose direct-match ids or a reusable match predicate from shared filtering code, then let each view derive its own visible set from that common result.

3. Preserve tree-specific visibility behavior explicitly.
   - Tree must still include ancestor chains for every directly matching task so users can see the match in context.
   - Tree must also expand or mark-open every branch needed to reveal all matching descendants, not just the first matching path.
   - The tree selector should compute:
     - direct matches
     - visible ancestor ids required to reach those matches
     - expanded parent ids required to unfold the tree down to all matches
   - Existing descendant expansion logic should be reviewed so it does not stop short when only a deeper descendant matches.

4. Keep display formatting separate from search formatting.
   - Continue using `formatBreadcrumbLabel()` only for rendered previews/breadcrumbs.
   - Do not allow any view formatter to participate in search matching.
   - If needed, rename local helpers like `getTableContentPreview()` to make the display-only intent explicit.

5. Tighten tests around the actual regression boundary.
   - Add/extend tests proving `#tag` and `tag` both match across shared search.
   - Add tree-view-oriented tests ensuring the tree path uses the same direct-match semantics as list/feed.
   - Add a tree regression test proving that a deep descendant match keeps all required ancestors visible.
   - Add a tree regression test proving the tree unfolds far enough to expose every matching item in the branch.
   - Add a regression test confirming breadcrumb/table formatting can strip `#` visually without affecting search results.

## Implementation Sequence

1. Introduce the shared searchable-text helper and refactor existing callers to use it.
2. Refactor tree filtering to consume shared direct-match results instead of calling `taskMatchesTextQuery()` inline.
3. Add a tree visibility helper that derives ancestor visibility and required expansion state from those direct matches.
4. Remove now-redundant search code or reduce `task-text-filter.ts` to a thin wrapper over the shared helper.
5. Add regression tests, then run focused tests for the changed filtering area.

## Verification

- Required for this scope: focused tests for changed filtering behavior.
- Recommended: `npm run build`.

## Risks

- Tree view is structurally different because it preserves ancestor visibility and must unfold to matches, so the refactor should centralize matching while keeping tree visibility/expansion logic explicit.
- Search semantics currently include author/mention/assignee metadata; the extracted helper must preserve that exactly to avoid subtle regressions.
