# Task State Registry — Next Steps

Builds on the foundation landed in commits `ea47a018`..`e46578a6`:
registry, type rename, shared UI helpers, env-based config.

## What exists now

- `TaskStatus` union: `"open" | "active" | "done" | "closed"`
- `TaskStateDefinition` registry in `src/domain/task-states/task-state-config.ts`
  with parsing, resolution, quick-toggle, sorting, protocol mapping
- `VITE_TASK_STATE_CONFIG` env override (JSON array)
- Shared `TaskStateIcon`, `getTaskStateToneClass`, `getTaskStateBadgeClasses`
  in `src/components/tasks/task-state-ui.tsx`
- All view dropdowns iterate the registry via `getTaskStateRegistry()`
- Nostr publish/read maps `active` to `GitStatusOpen` with label content
- Mobile quick-toggle skips active: open -> done

## 1. Relay-scope history states

Derive visible states from tasks/state-updates currently in scope.

- Scan `statusDescription` values across visible tasks and state-update entries
- Build a `Set<string>` of encountered labels per protocol type
- For each label not already in the configured registry, create a derived
  `TaskStateDefinition` using `resolveTaskState(type, label)` (already handles
  ad-hoc definitions with default icon/tone for the type)
- Expose via a hook like `useVisibleTaskStates(tasks)` that returns the merged
  registry: configured states + history-derived states, in config order with
  history extras appended after their type group
- History-derived states are selectable only while they exist in scope;
  configured extras stay selectable globally

### Where it plugs in

- Dropdown menus: show configured `visibleByDefault` states, then a separator,
  then history-derived states for the current scope
- Kanban columns (step 3): add columns for visible history states

## 2. Custom labeled state chooser

Allow users to publish a status with an arbitrary label on any protocol type.

### UX

- Add a final item in each status dropdown: "Custom status..."
- Desktop: opens a small popover/dialog with:
  - Protocol type selector (Open / Done / Closed) — three radio buttons or segmented control
  - Label text input
  - Submit button
- Mobile: same content in a bottom sheet
- On submit: publish a state event with the chosen protocol kind and the label
  as event content, using `mapTaskStatusToStateEvent` which already supports
  this via the `active` path (extend for `done`/`closed` labels too)

### Registry integration

- The submitted label becomes a history-derived state visible in scope
- No config change needed — it flows through `resolveTaskState`

### Implementation notes

- Create `src/components/tasks/CustomStateDialog.tsx` (or similar)
- Wire into all status dropdown sites — they already iterate the registry,
  so append one more item after the registry loop
- Extend `mapTaskStatusToStateEvent` to accept an optional label for
  `done` and `closed` protocol types (currently only `active` carries content)
- Extend `mapTaskStateEventToTaskStatus` to propagate `statusDescription`
  for Applied/Closed kinds when content is non-empty

## 3. Dynamic Kanban columns

Replace the fixed four-column Kanban with registry/history-driven columns.

### Column source

1. Start with configured states where `visibleByDefault: true`
2. Add columns for any history-derived states that have tasks in scope
3. Render in config order; history-only states append after their type group
4. Empty non-default columns can be hidden or shown with a toggle

### Data model change

- `tasksByStatus` grouping key changes from `TaskStatus` to state id (`string`)
- Column type for sorting/keyboard nav derived via `getTaskStateUiType`
- `Record<TaskStatus, Task[]>` -> `Map<string, Task[]>` or ordered array

### Keyboard navigation

- Left/right movement follows column order (already partially config-driven
  since `getColumns` iterates the registry)
- Column-aware drag-and-drop destination uses state id, not status union

### Sorting

- Columns with `open`/`active` type: normal sort (existing `sortTasks`)
- Columns with `done`/`closed` type: latest-modified ordering (existing
  `sortByLatestModified`)
- This is already the pattern in `KanbanView`; just needs to key off
  `getTaskStateUiType(columnId)` instead of checking string equality

## 4. Icon registry expansion

The `TaskStateIcon` component currently maps four icon strings to Lucide
components. When custom configs reference icons like `"pause-circle"`,
`"badge-check"`, `"eye"`, etc., those need to resolve.

Options (pick one):
- **Static map**: expand `ICON_BY_STATUS` in `task-state-ui.tsx` to cover
  the ~20 most useful Lucide icons for task states. Simple, tree-shakeable.
- **Dynamic import**: use `lucide-react`'s dynamic icon lookup. Larger bundle
  impact but supports any icon string.

Recommendation: static map with a curated set. Add icons as configs request
them. The fallback to `DEFAULT_ICON_FOR_TYPE` already handles unknown strings.

## 5. Done-ness views (future / low priority)

Per the original plan's "Done-ness Views" section — role-specific completion
interpretations layered on top of canonical state. This is view logic, not
state model changes. Not needed until multi-role workflows are a real use case.

## Sequencing

1 and 2 are independent and can be done in parallel or either order.
3 depends on 1 (needs history states to know which columns to show).
4 is independent and can be done whenever custom configs are tested.
5 is deferred until there's a concrete use case.

## Testing focus

- History state derivation from a set of tasks with mixed `statusDescription` values
- Custom state round-trip: publish with label -> re-read -> correct state resolution
- Kanban column generation from registry + history, column ordering
- Keyboard nav across dynamic column count
- Drag-and-drop to history-derived columns
- Icon fallback for unknown icon strings in custom configs
