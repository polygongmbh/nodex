# Debounce task state publishing

## Goal

When the user changes a task's state in rapid succession (e.g. cycling
open → active → done in a few clicks, or dragging across kanban
columns), only the final state should be published to relays. Local
optimistic updates must remain immediate so the UI gives instant
feedback.

## Background

Today every call to `handleToggleComplete` / `handleStatusChange` in
`use-task-status-controller.ts` funnels through `commitTaskStatus`
(extracted in a prior refactor), which calls:

1. `scheduleTaskStatusReorderUpdate` — immediate local store mutation
   via `setLocalTasks(applyTaskStateUpdate(...))`, plus a 260 ms
   reorder hold for sort stability.
2. `triggerCompletionFeedback` — confetti + sound on done.
3. `publishTaskStateUpdate` — fires the Nostr state event to the
   task's origin relay.
4. `cascadeActiveToOpenAncestors` — repeats the same for any
   open ancestors when going active.

The publish call (3) and the cascade publish (inside 4) are what
needs to be debounced. (1) and (2) must stay synchronous.

## Terminology note

The codebase uses:

- `TaskStatus` for the discrete status string (`"open" | "active" |
  "done" | "closed"`).
- `TaskState` for the `{ status, description? }` object that wraps it.
- `publishTaskStateUpdate(taskId, state)` for the publish call.

Plan text below follows that vocabulary.

## Design

### New hook: `use-debounced-task-state-publish.ts`

Co-located with the other feed-page controllers. Wraps the underlying
`publishTaskStateUpdate` from `useTaskPublishControls`.

Public API:

```ts
interface DebouncedTaskStatePublisher {
  schedulePublishTaskStateUpdate: (
    taskId: string,
    state: TaskState,
    relayUrls?: string[]
  ) => void;
  flushPendingTaskStatePublishes: () => void;
}
```

Internal state (refs, not React state):

- `pendingByTaskIdRef: Map<string, { state: TaskState; relayUrls?: string[]; timeoutId: number; firstScheduledAt: number }>`

Behavior:

- **Schedule:** Overwrite (or insert) the pending entry for `taskId`
  with the latest `state` + `relayUrls`. Clear any existing timeout
  and re-arm with `TASK_STATE_PUBLISH_DEBOUNCE_MS`. If
  `firstScheduledAt` plus `TASK_STATE_PUBLISH_MAX_WAIT_MS` is in the
  past, fire immediately instead of re-arming (max-wait cap).
- **Fire:** Read latest entry, delete it, then
  `await underlyingPublishTaskStateUpdate(taskId, state, relayUrls)`.
  No requeue on failure — `failed-publish-drafts.ts` already retries.
- **Flush:** Walk the pending map, clear timers, fire every entry.

Lifecycle:

- `useEffect` cleanup on unmount: clear timers and flush
  best-effort. Underlying publish is async (WebSocket); a true
  synchronous flush isn't possible — we kick the call off, and the
  existing failed-publish retry path absorbs whatever doesn't land.
- `beforeunload` listener: same best-effort flush.
- Re-create / reset the map if the signer identity changes
  (handled implicitly by hook re-mount when `NDKProvider` swaps user;
  verify in `Index.tsx` that the controller is below that boundary
  — if not, expose a `flushPendingTaskStatePublishes` effect tied
  to the current user's pubkey).

### Constants

In the new hook file:

```ts
const TASK_STATE_PUBLISH_DEBOUNCE_MS = 2500;
const TASK_STATE_PUBLISH_MAX_WAIT_MS = 8000;
```

Rationale: 2.5 s is long enough to coalesce double-clicks, kanban
drag-through, and quick "open → active → done" sweeps; short enough
that users don't notice lag when they tab away. The max-wait cap
prevents a user who keeps fiddling from indefinitely delaying any
publish at all.

### Wiring

1. `use-task-publish-controls.ts` — unchanged. Still exposes
   `publishTaskStateUpdate`.
2. `Index.tsx` (or wherever the controller is constructed) —
   instantiate the new debounced publisher with the underlying
   `publishTaskStateUpdate`, then pass
   `schedulePublishTaskStateUpdate` into `useTaskStatusController`
   under the same `publishTaskStateUpdate` prop name (signature is
   `(taskId, state, relayUrls?) => void`; return type widens from
   `Promise<unknown>` to `void`, so update
   `UseTaskStatusControllerOptions` accordingly).
3. `use-task-status-controller.ts` — no logic changes. The single
   `void publishTaskStateUpdate(...)` call inside `commitTaskStatus`
   and the one inside `cascadeActiveToOpenAncestors` (line 148)
   both flow through the debounced API automatically.

### Type change

`UseTaskStatusControllerOptions.publishTaskStateUpdate` becomes
`(taskId, state, relayUrls?) => void` (no `Promise`). Drop the
`void` operator on the call sites since they no longer return a
promise. The underlying async publish is owned by the debounce hook.

## Edge cases

- **"Latest wins" drops intermediate states.** `open → active → done`
  publishes only `done`. Intended — Nostr state events
  (kinds 1630–1633) are point-in-time observations; only the final
  one matters. `triggerCompletionFeedback` still fires on the local
  transition to done (it lives outside the debounce), so the
  celebration UX is unaffected, and `completionConfettiLastAtRef`
  already self-debounces confetti.
- **Permission / guard checks** must stay pre-schedule
  (`resolveAuthorizedTask`). Denied changes never enter the pending
  map.
- **Cascade ancestors share the debounce map** keyed by
  `taskId`. Two updates to the same parent (from sibling cascades)
  correctly coalesce.
- **Cascade reads `pendingTaskStatusesRef`** (line 141), which is
  the local-store hold map — NOT the new debounce map. The two are
  independent and that's correct: cascade decides what to do based
  on what the UI shows, not based on what's queued for the network.
- **Pending update for an unloaded task.** If a task is removed
  from `allTasks` between schedule and fire, the publish should
  still go out — we don't gate publishing on `allTasks` membership.
  The hook should not read `allTasks`.
- **Manual flush on logout.** Optional; the existing
  failed-publish-drafts retry path covers it. If we add explicit
  flush, do it before the signer changes.

## Tests

Extend `use-task-status-controller.test.tsx` with fake-timer
assertions. The existing tests pass a synchronous
`publishTaskStateUpdate` mock — keep them green by adapting the
harness to wrap the mock in the debounce hook (or by adding new
tests against the new hook directly in
`use-debounced-task-state-publish.test.tsx`).

New cases:

- Local task store mutates immediately on a status change.
- Underlying publish is **not** called before
  `TASK_STATE_PUBLISH_DEBOUNCE_MS` elapses.
- Three rapid changes within the window → **one** publish, with the
  final state.
- A change, wait past the window, then a second change → **two**
  publishes.
- Continuous churn for longer than `TASK_STATE_PUBLISH_MAX_WAIT_MS`
  → publish fires once at the cap, then the cycle restarts.
- Unmount with a pending entry → flush fires the publish.
- Cascade to ancestors coalesces with a direct edit of the same
  ancestor (same `taskId` → single publish).

## Out of scope

- Date publishing (`publishTaskDueUpdate`) and priority publishing
  (`publishTaskPriorityUpdate`). Not requested, and their semantics
  are different (cumulative or distinct events rather than a single
  point-in-time observation).
- Changes to `task-state-events.ts` mapping.
- The `failed-publish-drafts.ts` retry path (orthogonal).
- The local reorder hold (`TASK_STATUS_REORDER_DELAY_MS = 260`).
  That timer is about sort stability after an optimistic change and
  is independent of the network publish.

## Open questions

- Should `beforeunload` synchronously call `publishEvent`, or rely
  entirely on the failed-publish-drafts retry path? Synchronous call
  is best-effort (the WebSocket may not flush), but it costs
  nothing.
- Should the `signer change → flush` hook live inside
  `NDKProvider` (broadcast a "signer changing" event) or inside the
  debouncer (listen via a context value)? Defer until we see whether
  in practice the controller unmounts on logout.
