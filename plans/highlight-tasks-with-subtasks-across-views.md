# Plan: Highlight Tasks With Subtasks Across Timeline, Kanban, Calendar, and Table Views

## Goal

Make tasks that currently have visible subtasks stand out consistently in:

- timeline/feed view
- kanban view
- calendar selected-day cards
- table/list view

The highlight should help users recognize expandable parent work items at a glance without competing with existing status, due-date, author, and focus signals.

## Opinionated Product Decision

Highlight tasks when they have **task descendants anywhere in `allTasks`**, regardless of whether those descendants are currently visible in the active surface.

That means:

- use descendant relationships from the full task graph
- count task descendants, not comments
- keep the highlight stable even when filters, depth modes, or calendar day selection hide the child tasks

Reasoning:

- this matches the product intent you clarified: the marker should describe structural parenthood, not just current viewport visibility
- the signal stays stable as users switch between scoped and unscoped surfaces
- users can recognize “this is a parent task” even when the children are currently filtered away

## Current State

All four surfaces already render task cards/rows independently:

- [FeedView.tsx](/Users/tj/IT/nostr/nodex/src/components/tasks/FeedView.tsx)
- [KanbanView.tsx](/Users/tj/IT/nostr/nodex/src/components/tasks/KanbanView.tsx)
- [CalendarView.tsx](/Users/tj/IT/nostr/nodex/src/components/tasks/CalendarView.tsx)
- [ListView.tsx](/Users/tj/IT/nostr/nodex/src/components/tasks/ListView.tsx)

They already share some task-view derivation through:

- [use-task-view-states.ts](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-task-view-states.ts)
- [task-view-filtering.ts](/Users/tj/IT/nostr/nodex/src/domain/content/task-view-filtering.ts)

But there is no shared “this task has visible subtasks” model yet.

## Architecture Steer

Do **not** add four independent `allTasks.some(...)` checks inside the views.

Preferred approach:

1. add one shared helper that derives visible direct-child counts from the current task collection for a surface
2. return a reusable predicate such as `hasVisibleSubtasks(taskId)` from the relevant shared state hooks/selectors
3. let each view render its own visual treatment from that shared semantic flag

This keeps the product rule centralized while allowing each surface to use a presentation that fits its layout constraints.

## UI Direction

Use a consistent semantic treatment, not identical CSS in every surface.

Baseline treatment:

- make the task title itself read as the parent-task signal
- prefer stronger title weight and a small prefix marker over another metadata chip
- avoid pushing more controls into already crowded chip rows
- never replace existing status icons, due-date emphasis, or author-color rails

Preferred presentation direction:

- bold or semi-bold title treatment when the task has descendants
- optional compact prefix before the title, for example a branch/stack glyph or short counter token
- if we reuse any existing tree-view language, reuse the *idea* of a hierarchical parent marker, not the current fold-toggle UI directly

Rejected default:

- do not default to a new chip-row badge as the primary signal
- the metadata rows are already overloaded, especially in kanban and calendar

Per-view guidance:

### Timeline / Feed

- make the main task text slightly heavier when the task has descendants
- if a prefix is used, attach it directly to the title/content line rather than the metadata row
- if any container treatment is added, keep it subtle and avoid overpowering the focus ring or status toggle

### Kanban

- apply the signal in the content/title row so drag-card height stays stable
- do not push the indicator into the chip row or displace priority

### Calendar

- do not reuse the left accent rail because that rail already belongs to author coloring
- prefer title-level emphasis or a tight inline prefix near the title instead

### Table / List

- add the indicator inside the main content cell at the title/content line
- prefer compact prefix plus weight change over full-row coloring so the tabular scan remains clean

## Implementation Steps

### 1. Add shared descendant derivation from `allTasks`

Create a small shared helper, likely near [use-task-view-states.ts](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-task-view-states.ts) or in [task-view-filtering.ts](/Users/tj/IT/nostr/nodex/src/domain/content/task-view-filtering.ts), that derives descendant state from `allTasks` and returns:

- `taskDescendantCountByTaskId`
- `hasTaskDescendants(taskId)`

Rules:

- count only `taskType === "task"`
- use all descendants, not only direct children
- treat comments as non-subtask items

Preferred implementation detail:

- build on the existing `descendantIdsByTaskId` index in [task-view-filtering.ts](/Users/tj/IT/nostr/nodex/src/domain/content/task-view-filtering.ts) instead of rebuilding graph traversal separately in each view

### 2. Add a shared title-prefix primitive only if needed

Do not start with a chip component.
If a reusable primitive is needed, make it something tiny and title-oriented, for example under `src/components/tasks/`:

- `TaskHierarchyPrefix.tsx`

Responsibilities:

- render a compact glyph and/or descendant count token suitable for inline title use
- expose compact variants for dense surfaces
- provide stable semantics for tests

Prefer not to hardcode user-facing copy in production code.
Add all required locale strings in:

- [src/locales/en/common.json](/Users/tj/IT/nostr/nodex/src/locales/en/common.json)
- [src/locales/de/common.json](/Users/tj/IT/nostr/nodex/src/locales/de/common.json)
- [src/locales/es/common.json](/Users/tj/IT/nostr/nodex/src/locales/es/common.json)

### 3. Apply view-specific highlighting

Use the shared semantic flag in:

- [FeedView.tsx](/Users/tj/IT/nostr/nodex/src/components/tasks/FeedView.tsx)
- [KanbanView.tsx](/Users/tj/IT/nostr/nodex/src/components/tasks/KanbanView.tsx)
- [CalendarView.tsx](/Users/tj/IT/nostr/nodex/src/components/tasks/CalendarView.tsx)
- [ListView.tsx](/Users/tj/IT/nostr/nodex/src/components/tasks/ListView.tsx)

Guardrails:

- preserve existing keyboard focus, status, locked, and terminal-state styling
- preserve compact kanban behavior
- keep calendar author accent intact
- do not add noisy badges to state-update feed entries unless explicitly desired later

Preferred first pass:

- weight change on task title/content text
- optional inline prefix/count next to the title when the weight change alone is too subtle
- no chip-row additions unless the title-only treatment proves too weak

### 4. Add debug logging for the new feature

Because this is a distinctly new user-facing feature, add one minimal dev/debug log path that reports the computed subtask-highlight state when helpful in debug/dev builds only.

Preferred scope:

- one centralized log near the shared derivation helper or view-state layer
- no per-card spam in production builds

### 5. Add tests before or alongside implementation

Shared logic tests:

- task with descendants in `allTasks` yields `true`
- comment child does not count
- filtered-out descendants still count
- deep descendants count correctly
- multiple descendants count correctly

View tests:

- feed/timeline renders the parent-task emphasis for a task with descendants
- kanban renders the indicator without displacing priority semantics
- calendar renders the indicator without conflicting with author accent usage
- list/table renders the indicator inside the main content cell

Use semantic queries first.
Only add `data-testid` if the indicator cannot be queried stably by role/name.

## Verification

This is a cross-view UI change, so use the major-change verification matrix:

1. `npm run lint`
2. `npx vitest run`
3. `npm run build`

## Refactor Checklist For Implementation Handoff

- duplication reviewed
- consistency issues reviewed
- large/complex components reviewed
- deferrals with rationale

## Explicit Non-Goals

- no tree-view changes in this milestone
- no expand/collapse behavior changes
- no new filtering semantics
- no visibility-dependent highlighting rules
- no attempt to unify all four views behind identical layout markup
