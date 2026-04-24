

## Goal

Inline the quick-toggle next-type logic into `use-task-status-controller.ts` (the only consumer that needs it) and simplify `task-status-toggle.ts` to a direct semantic check on the current status. Remove `getQuickToggleNextState` from the registry entirely.

## Why

- `getQuickToggleNextState` has only two callsites and neither needs registry awareness.
- The toggle helper just wants to know "should this click focus the task?" — that is true when quick-toggling from an open state (since the next type will be `active` on desktop). It can answer that from `status` alone, no lookahead needed.
- The controller is the only place that actually publishes a next state, so the cycling rules belong there.

## Changes

### 1. `src/features/feed-page/controllers/use-task-status-controller.ts`

- Drop the `getQuickToggleNextState` import.
- Inline next-type computation in `handleToggleComplete`:
  ```ts
  const currentType = getTaskStatusType(currentStatus);
  if (currentType === "done" || currentType === "closed") return;
  const nextType: TaskStatusType =
    currentType === "open" && !isMobile ? "active" : "done";
  ```
- Resolve `nextType` to a full `TaskStatus` via a registry helper (`getDefaultStateForType` → `toTaskStatusFromStateDefinition`) so custom done states publish as `{ type: "done", description: "Review" }` rather than `{ type: "review" }`.
- Pass that full `TaskStatus` into `scheduleTaskStatusReorderUpdate` and `publishTaskStateUpdate`.

### 2. `src/domain/content/task-status.ts`

- Change `applyTaskStatusUpdate` (and the optimistic `stateUpdates` synthesis added previously) to accept a full `TaskStatusLike` instead of `TaskStatusType`, so descriptions survive the optimistic merge.

### 3. `src/lib/task-status-toggle.ts`

- Replace the `getQuickToggleNextState` + `getTaskStateUiType` chain with a direct check:
  ```ts
  if (focusOnQuickToggle && !event.altKey) {
    const currentType = getTaskStatusType(status);
    if (currentType === "open") focusTask?.();
  }
  ```
  Rationale: quick-toggle from `open` advances to `active` on desktop (focus-worthy). Mobile already skips focus via existing platform handling, and from `active` the next stop is `done` (not focus-worthy). Terminal states open the chooser instead of toggling.
- Drop `getTaskStateUiType` and `getQuickToggleNextState` imports.

### 4. `src/domain/task-states/task-state-config.ts`

- Remove `getQuickToggleNextState` entirely (and any now-unused helpers it relied on).
- Export `getDefaultStateForType` (and a small `toTaskStatusFromStateDefinition` helper if not already public) for the controller to resolve next-type → publishable status.

### 5. Tests

- `src/domain/task-states/task-state-config.test.ts`: drop the `getQuickToggleNextState` test block.
- `src/features/feed-page/controllers/use-task-status-controller.test.tsx`: add a regression that with a custom registry whose first done-type state is `review`, the controller publishes `{ type: "done", description: "Review" }` (and that desktop cycles open→active→done while mobile cycles non-terminal→done).
- Optionally tighten `task-status-toggle` tests to assert focus only fires when starting from an open semantic type, regardless of state id.

## Out of Scope

- The ~100 pre-existing `TaskStatus` typing errors in `*.test.tsx` and `FeedView.tsx`/`CalendarView.tsx`. These predate this work and remain unaddressed here.

## Files Touched

- `src/features/feed-page/controllers/use-task-status-controller.ts`
- `src/domain/content/task-status.ts`
- `src/lib/task-status-toggle.ts`
- `src/domain/task-states/task-state-config.ts`
- `src/domain/task-states/task-state-config.test.ts`
- `src/features/feed-page/controllers/use-task-status-controller.test.tsx`

