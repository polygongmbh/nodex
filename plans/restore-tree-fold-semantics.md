# Restore Tree Fold Semantics

## Goal

Fix the tree fold regression introduced between `v2.9.0` and `v2.10.0` by restoring the intended meaning of the single triple-state toggle:

1. `matchingOnly`
2. `collapsed`
3. `allVisible`

The fix should also prune the current tree data flow so item-level fold behavior is not indirectly driven by the broad chain:

- `allTasks`
- `allVisibleIds`
- `filteredChildren`

## Current Diagnosis

The likely regression is not the local toggle cycle in `TreeTaskItem`.

The deeper issue is that tree fold behavior now consumes a shared `hasActiveFilters` semantic from `scopeModel`, and that flag became broader than the old tree-specific meaning:

- search query
- included/excluded channels
- selected people
- relay selection
- quick filters

In `v2.9.0`, tree matching logic only treated search/channel filtering as the thing that changed fold semantics.

Now the tree path does this:

1. compute `hasActiveFilters` from `scopeModel`
2. compute `allVisibleIds` over `allTasks`
3. derive `filteredChildren` from `allVisibleIds`
4. let `TreeTaskItem` interpret `filteredChildren` as the `matchingOnly` set whenever `hasActiveFilters` is true

That is too indirect and too broad. It lets non-tree scope state leak into the tree toggle semantics, which can make:

- `matchingOnly` already include done descendants
- `allVisibleDiffersFromMatching` collapse to `false`
- the visible behavior look like `collapsed -> expand all`

## Opinionated Fix Direction

Do not try to patch the button cycle again.

Instead:

1. separate `tree visibility for filtering` from `tree matching semantics for fold states`
2. compute explicit tree-level matching data in the selector layer
3. pass precise child sets into `TreeTaskItem`
4. stop using the broad `scopeModel.hasActiveFilters` flag as the switch for `matchingOnly`

## Target Semantics

Tree item fold behavior should use two explicit concepts:

### 1. Tree Filter Mode

A narrow boolean that means:

- search query is active, or
- channel include/exclude filtering is active

This is the old behavior boundary for `matchingOnly`.

This should *not* automatically become true for:

- relay-only scope
- people-only scope
- quick filters
- other empty-state/scope UI concerns

Those may affect which tasks are present in the tree at all, but should not redefine the fold toggle’s `matchingOnly` semantics.

### 2. Child Visibility Sets

For each tree item, the selector layer should provide explicit child collections with clear meanings:

- `allChildren`
- `matchingChildren`
- maybe split as `taskChildren` and `commentChildren` if that still helps rendering

`TreeTaskItem` should not infer matching semantics from a generic `filteredChildren` prop plus a broad `hasActiveFilters` flag.

## Refactor Shape

### Step 1. Reproduce and lock down the regression

Add or revise tests so they cover the actual failing mode:

- tree item with open + done subtasks
- a non-search/non-channel scope active that currently flips `hasActiveFilters`
- verify `matchingOnly` still hides done subtasks
- verify the toggle still reaches a distinct `allVisible` state

The tests should assert behavior and state, not translated titles.

### Step 2. Narrow tree filter semantics

In `createTreeSelectors`, introduce a tree-specific boolean such as:

- `hasTreeMatchFilters`

This should be derived from the inputs that are supposed to change fold semantics, likely:

- search query
- included/excluded channels

Keep broader scope state for empty-state messaging and view-level filtering where needed, but do not reuse it for tree fold logic.

### Step 3. Replace generic `filteredChildren` meaning

Refactor selector output so `getFilteredChildren` is no longer overloaded as both:

- view-visible children
- fold-state matching children

Likely split into two explicit selector concepts:

- `getVisibleChildren(parentId)`
- `getMatchingChildren(parentId)`

Or, preferably, one structured child-state selector:

- `getTreeChildState(parentId)`
  - `allChildren`
  - `matchingChildren`

This removes the current semantic ambiguity.

### Step 4. Simplify `TreeTaskItem`

Update `TreeTaskItem` so it consumes explicit child semantics:

- all children
- matching children
- maybe direct counts already computed

The item should not need to know why a child is considered matching. It should only render:

- `matchingOnly` from `matchingChildren`
- `allVisible` from `allChildren`

### Step 5. Recheck the third state

Recompute `allVisibleDiffersFromMatching` from the explicit sets, not from the broad `hasActiveFilters` flag.

That should restore the correct rule:

- if matching and all are identical, skip the third state
- otherwise preserve the third state

### Step 6. Cleanup pass

After the behavioral fix works:

- prune obsolete tree helpers or props
- remove any leftover overloaded naming like `filteredChildren` if it no longer reflects actual semantics
- keep tree-specific logic tree-local instead of pushing it into broad shared abstractions unless it is truly shared

## Likely Files

- `src/features/feed-page/controllers/use-task-view-states.ts`
- `src/components/tasks/TaskTree.tsx`
- `src/components/tasks/TreeTaskItem.tsx`
- `src/components/tasks/tree-task-item-helpers.ts`
- tree-focused tests in `src/components/tasks/`

## Verification

Because this is a behavioral fix in a shared tree/view-state path, use the major/cross-view verification bar:

- `npm run lint`
- `npx vitest run`
- `npm run build`

## Risks

- The tree currently mixes two concerns: which tasks are present in the view at all, and which children belong to the fold toggle’s `matchingOnly` state. If those are not separated cleanly, more local fixes will keep regressing.
- There are unrelated unstaged task-view edits in the current worktree, so implementation should avoid broad incidental rewrites until the target seam is narrowed.

## Success Criteria

- With the same task data, tree toggle behavior matches the old intent again.
- `matchingOnly` does not start showing done subtasks merely because broader scope/filter UI is active.
- `allVisible` remains a real third state whenever done or otherwise non-matching descendants exist.
- Tree item props/read models become more explicit and less dependent on the indirect `allTasks -> allVisibleIds -> filteredChildren` chain.
