# onNewTask Dispatch Migration Plan

## Goal
Replace `onNewTask` callback threading through `SharedTaskViewContext` with a typed feed-interaction dispatch flow, while preserving current UX behavior (success/failure handling, composer collapse/reset behavior, and mobile/desktop parity).

## Current State (Baseline)
- `onNewTask` is part of `SharedTaskViewContext` and passed from `Index` into `FeedTaskViewModel`.
- Task creation is invoked directly from views (`TaskTree`, `FeedView`, `ListView`, `KanbanView`, `CalendarView`, `MobileLayout`).
- Existing interaction bus already handles many actions (`task.toggleComplete`, `task.changeStatus`, `ui.search.change`) but not task creation.
- Views need `TaskCreateResult` to decide local UI behavior (collapse composer, keep draft on failure, etc.).

## Intended Migration Design
1. Add a new interaction intent: `task.create`.
2. Extend interaction pipeline event shape to carry optional handler return value (for request/response style intents).
3. Add a small adapter helper (e.g. `dispatchTaskCreate`) that:
   - dispatches `task.create`
   - validates returned payload shape
   - returns `TaskCreateResult` fallbacking to `{ ok: false, reason: "unexpected-error" }` if missing/invalid.
4. Wire `task.create` handler in `Index` to call existing `handleNewTask`.
5. Update views to call `dispatchTaskCreate(...)` instead of `onNewTask(...)`.
6. Remove `onNewTask` from `SharedTaskViewContext` and `FeedTaskViewModel`.

## Implementation Steps
1. Introduce intent and types
- File: `src/features/feed-page/interactions/feed-interaction-intent.ts`
- Add `task.create` payload fields matching current `OnNewTask` contract.

2. Add return channel in pipeline
- File: `src/features/feed-page/interactions/feed-interaction-pipeline.ts`
- Add `result?: unknown` to pipeline event.
- Allow handlers to return values.

3. Add typed adapter
- File: `src/features/feed-page/interactions/task-create-dispatch.ts`
- Export `dispatchTaskCreate(dispatch, params): Promise<TaskCreateResult>`.

4. Register handler
- File: `src/pages/Index.tsx`
- Add `"task.create": (intent) => handleNewTask(...)` and return its result.

5. Migrate callers
- Files:
  - `src/components/tasks/TaskTree.tsx`
  - `src/components/tasks/FeedView.tsx`
  - `src/components/tasks/ListView.tsx`
  - `src/components/tasks/KanbanView.tsx`
  - `src/components/tasks/CalendarView.tsx`
  - `src/components/mobile/MobileLayout.tsx`
- Replace direct `onNewTask` calls with dispatch helper.

6. Remove callback prop from shared context
- Files:
  - `src/types/index.ts`
  - `src/features/feed-page/views/feed-task-view-model-context.tsx`
  - `src/pages/Index.tsx` (remove `onNewTask` from model object)

7. Tests
- Add/update tests for:
  - adapter fallback behavior when dispatch returns non-result/unhandled
  - `task.create` handler wiring
  - one representative view submit path asserting dispatch intent payload correctness
- Keep existing behavior tests green.

## Verification
- Focused tests:
  - `npx vitest run src/components/mobile/MobileLayout.submit.test.tsx`
  - task view submit-related suites
  - interaction pipeline tests
- For cross-view migration (major):
  - `npm run lint`
  - `npx vitest run`
  - `npm run build`

## Risks
- Pipeline semantic change: adding return values changes mental model from fire-and-forget to mixed command/query.
- Typing drift risk if `task.create` payload diverges from existing publish flow args.
- Error handling ambiguity if middleware blocks/unhandles create intents.

## Mitigations
- Keep return values optional and only consumed by adapter helper.
- Centralize payload mapping in one helper; avoid duplicating shape checks in views.
- Define strict fallback behavior in adapter for non-handled or malformed results.

## Rollback Strategy
- Keep migration in a single commit scope per milestone:
  1) pipeline + intent + handler
  2) caller migration
  3) context cleanup
- If instability appears, revert stage 2 first (caller migration) while retaining no-op-safe infra additions.

## Assessment (Sensible or Not)
### Sensible when
- You want one interaction contract for all user actions.
- You plan to add middleware/effects around task creation (analytics, guardrails, offline queueing, access checks).
- You want to remove callback prop drilling from shared view contracts.

### Not sensible when
- You prefer the interaction bus to stay strictly command/event oriented (no returned values).
- You want to keep creation flow explicit and local without expanding pipeline responsibilities.

## Opinionated Recommendation
Do it only if you commit to the interaction bus as the single action API for views.

If not, keep `onNewTask` explicit (current direction), and only prune truly redundant non-result callbacks from view props/tests. This keeps architecture simpler and avoids turning the bus into a de facto RPC layer.
