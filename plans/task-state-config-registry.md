# Task State Config Registry Plan

## Goal

Replace the hard-coded four-state task model and duplicated UI styling logic with a config-driven task-state registry that:

- keeps default states configurable via environment/config
- allows additional configured states with icons/colors
- surfaces history-derived states for the current relay scope
- lets the default dropdown stay compact
- supports an "other state" chooser for configured extras
- supports custom labels for the generic `todo` and `done` states
- drives Kanban columns from the same registry
- changes mobile quick-toggle to jump directly `todo -> done`
- preserves configured Kanban column order for extra states
- keeps cycling and sorting bucket-based so custom states still behave predictably

## Current Constraints

- `TaskStatus` is a strict union in [src/types/index.ts](/Users/tj/IT/nostr/nodex/src/types/index.ts:55): `"todo" | "in-progress" | "done" | "closed"`.
- Toggle flow is hard-coded in [src/domain/content/task-status.ts](/Users/tj/IT/nostr/nodex/src/domain/content/task-status.ts:13).
- Nostr mapping is hard-coded in [src/infrastructure/nostr/task-state-events.ts](/Users/tj/IT/nostr/nodex/src/infrastructure/nostr/task-state-events.ts:23) and [src/infrastructure/nostr/task-converter.ts](/Users/tj/IT/nostr/nodex/src/infrastructure/nostr/task-converter.ts:170).
- Icons, labels, and colors are duplicated in multiple views:
  - [src/components/tasks/feed/FeedTaskCard.tsx](/Users/tj/IT/nostr/nodex/src/components/tasks/feed/FeedTaskCard.tsx:223)
  - [src/components/tasks/list/ListTaskRow.tsx](/Users/tj/IT/nostr/nodex/src/components/tasks/list/ListTaskRow.tsx:101)
  - [src/components/tasks/TreeTaskItem.tsx](/Users/tj/IT/nostr/nodex/src/components/tasks/TreeTaskItem.tsx:415)
  - [src/components/tasks/ListView.tsx](/Users/tj/IT/nostr/nodex/src/components/tasks/ListView.tsx:330)
  - [src/components/tasks/KanbanView.tsx](/Users/tj/IT/nostr/nodex/src/components/tasks/KanbanView.tsx:33)
  - [src/components/tasks/FeedView.tsx](/Users/tj/IT/nostr/nodex/src/components/tasks/FeedView.tsx:382)
- Kanban grouping is fixed to four columns in [src/features/feed-page/controllers/use-task-view-states.ts](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-task-view-states.ts:722) and [src/components/tasks/KanbanView.tsx](/Users/tj/IT/nostr/nodex/src/components/tasks/KanbanView.tsx:68).

## Opinionated Approach

Use a **registry with stable semantic buckets**, not arbitrary free-form states everywhere.

Each state should have:

- `id` string
- `bucket`: `todo | active | done | closed`
- `labelKey` or configured label override
- icon id
- tone/color token
- ordering
- `kanbanDefault` boolean
- `quickToggleEligibleDesktop` boolean
- `quickToggleEligibleMobile` boolean

This keeps protocol and sorting semantics stable while still allowing many user-visible states.

Important semantic rule:

- custom intermediate states must belong to either the `todo` bucket or the `active` bucket
- `done` and `closed` remain terminal semantic buckets
- Nostr mapping stays bucket-based, while labels stay state-specific

## Data Model Changes

1. Broaden `TaskStatus` from a strict union to `string` with canonical helpers.
2. Introduce a registry type in a new module such as `src/domain/task-states/task-state-config.ts`.
3. Add helpers:
   - `getTaskStateDefinition(status?: string)`
   - `getTaskStateBucket(status?: string)`
   - `isTaskCompletedStatus(status?: string)` based on bucket
   - `isTaskTerminalStatus(status?: string)` based on bucket
   - `getQuickToggleNextStatus(status, { mobile })`
   - `getNextStateInBucketSequence(status)`
   - `getStatusSortBucket(status)`
4. Keep built-in fallback definitions for:
   - `todo`
   - `in-progress`
   - `done`
   - `closed`
5. Parse optional config/env overrides for:
   - default visible dropdown states
   - full configured state catalog
   - custom labels for `todo` and `done`

## Config Design

Use one structured env var rather than many parallel vars.

- Add `VITE_TASK_STATE_CONFIG` as JSON.
- Keep it optional; invalid config falls back safely with a `console.warn`.
- Update [/.env.example](/Users/tj/IT/nostr/nodex/.env.example:1) with documented examples.

Suggested JSON shape:

```json
{
  "defaults": ["todo", "in-progress", "done", "closed"],
  "labels": {
    "todo": "Open",
    "done": "Completed"
  },
  "states": [
    { "id": "todo", "bucket": "todo", "icon": "circle", "tone": "muted", "kanbanDefault": true },
    { "id": "in-progress", "bucket": "active", "icon": "circle-dot", "tone": "warning", "kanbanDefault": true },
    { "id": "blocked", "bucket": "active", "icon": "pause-circle", "tone": "destructive", "kanbanDefault": false },
    { "id": "review", "bucket": "active", "icon": "badge-check", "tone": "info", "kanbanDefault": false },
    { "id": "done", "bucket": "done", "icon": "check-circle-2", "tone": "primary", "kanbanDefault": true },
    { "id": "closed", "bucket": "closed", "icon": "x", "tone": "muted", "kanbanDefault": true }
  ]
}
```

## UI Refactor

1. Create shared UI helpers:
   - `TaskStateIcon`
   - `getTaskStateToneClasses`
   - `getTaskStateLabel`
   - `buildTaskStateMenuModel`
2. Replace duplicated icon/color conditionals across feed/list/tree/calendar/kanban/feed-state-updates with registry lookups.
3. Convert dropdowns to show:
   - configured default states first
   - any history-derived states for the current relay scope
   - separator
   - `Other state…`
4. `Other state…` opens:
   - desktop: popover/dialog chooser
   - mobile: extended submenu/sheet
5. The chooser only lists configured extra states not already visible in the compact menu.

## Relay-Scope History States

1. Build a relay-scope visible state set from the currently available tasks/state updates in the active scope.
2. Include unknown statuses found in history even if they are not in config.
3. Unknown statuses should render through a fallback definition:
   - label = raw status slug, humanized
   - icon = generic active/todo fallback by inferred bucket
   - tone = muted unless bucket implies otherwise
4. History-derived states should be selectable only when they already exist in scope; configured extras stay selectable globally.

## Kanban Changes

1. Replace `Record<TaskStatus, Task[]>` fixed grouping with ordered dynamic groups keyed by status id.
2. Default columns should come from configured states with `kanbanDefault: true`.
3. Add extra columns for any visible task states not already present.
4. Preserve configured order exactly.
   - extra states are not appended at the end
   - columns are rendered in config order
   - visible extra states only appear in their configured slot
   - unknown history-only states can fall back after configured columns if they must be shown at all
5. Preserve bucket-aware sorting:
   - todo/active buckets use normal sort
   - done/closed buckets keep latest-modified ordering
6. Keyboard left/right movement should use configured column order, not hard-coded transitions.

## Mobile Quick Toggle

1. Replace the current universal cycle logic with platform-aware sequencing.
2. Cycling should be **bucket-based**, not state-id-based.
3. Default bucket transition rule:
   - any `todo`-bucket state quick-toggles to the default `active` state
   - any `active`-bucket state quick-toggles to the default `done` state
   - terminal states do not quick-toggle; clicking them opens the state chooser
4. Mobile quick toggle must skip the default active state:
   - `todo -> done`
5. If the current state is another active state like `blocked`, mobile toggle should move to `done`.
6. For `done` or `closed`, quick interaction should open the popup/chooser so the user explicitly picks the next state.
7. Explicit dropdown selection remains state-specific; only quick-toggle is bucket-driven.

## Nostr / Protocol Handling

Keep Nostr publishing conservative.

1. Continue mapping semantic buckets to existing event kinds:
   - `done` bucket -> `GitStatusApplied`
   - `closed` bucket -> `GitStatusClosed`
   - `todo` and `active` buckets -> `GitStatusOpen`
2. For non-canonical configured states, encode the exact state id in content or a dedicated status tag on the state event.
3. On read:
   - prefer explicit configured/custom state id when present
   - otherwise fall back to current kind/content inference
4. Document affected NIP behavior in commit/review notes because this changes task state encoding behavior.

## Testing Plan

Add focused tests before implementation for:

- env parsing and fallback behavior
- registry label/icon/tone resolution
- dropdown composition from defaults + relay-history + configured extras
- Kanban dynamic columns and ordering
- mobile quick-toggle skipping `in-progress`
- bucket-based quick-toggle from arbitrary custom `todo` and `active` states
- Nostr round-trip for configured custom states
- unknown history state fallback rendering

Given the scope, this is a major cross-view UI change. Required verification:

- `npm run lint`
- `npx vitest run`
- `npm run build`

## Sequencing

1. Add registry/config parser and bucket helpers.
2. Update domain helpers and optimistic status controller to use registry transitions.
3. Update Nostr publish/read mapping for explicit custom states.
4. Refactor shared task-state UI rendering.
5. Replace dropdowns and quick-toggle behavior.
6. Replace Kanban fixed columns with dynamic registry/history-driven columns.
7. Add/adjust tests and run full verification.

## Done-ness Views

Different people can experience the same workflow milestone as “done enough” for their role.
That should **not** redefine the shared task state model.

Recommended approach:

1. Keep one shared workflow state registry for the canonical task status.
2. Add optional **view profiles** layered on top of the canonical state.
3. A view profile maps canonical states to user- or role-specific interpretations such as:
   - `completeForRole`
   - `activeForRole`
   - `upcomingForRole`
4. Example for `Backlog -> Design -> Development -> Review -> Done`:
   - designer profile treats `Development`, `Review`, and `Done` as complete-for-designer
   - developer profile treats `Development` and `Review` as active-for-developer, and `Done` as complete-for-developer
5. This interpretation should affect filtering, badges, or progress summaries, not the canonical stored state.

Practical implication:

- phase/workflow state and completion semantics should be separate concepts
- do not overload the shared `done` bucket to mean “done for someone”
- if role-specific completion becomes a real feature, model it as view logic or derived progress, not as extra stored Nostr status kinds

## Key Risks

- widening `TaskStatus` to `string` will touch many assumptions in sort/group helpers
- unknown statuses from relays must not break existing views or permissions
- dynamic Kanban columns will affect keyboard navigation and drag/drop assumptions
- protocol compatibility needs a fallback path so older state events still read correctly
