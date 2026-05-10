# Task priority evaluation — next steps

The first cut lives in `src/domain/content/task-priority-evaluation.ts` with tests in
`src/domain/content/task-priority-evaluation.test.ts`. It computes a per-task
`PriorityScore` from local urgency, importance (the existing `priority` field), a
frecency boost from touches, and a hierarchical aggregation. Several layers from the
original design were intentionally left out — this plan tracks them.

## Already in place

- Local urgency: due-date proximity (`dueBase^-daysUntilDue`), overdue ramp with cap,
  weak baseline for undated tasks.
- Importance: derived from `task.priority / 50` so that the stored 20–100 range maps
  to 0.4–2.0; default 1 when unset.
- Frecency: count-only inverse-time decay over `stateUpdates` and comment children,
  log-normalized and clamped to `1 + maxFrecencyBoost`.
- Progress: subtask completion average, ignoring comments. Falls back to own
  status for leaves.
- Hierarchy:
  - Bottom-up `selfSum` raises a parent when subtasks are more urgent or more
    important.
  - Top-down `geometricMean` over the ancestor path contextualizes children.
- Final score: `cbrt(U * I * F)`.

## Not yet implemented

### 1. Dependencies

`Task` does not currently carry a `dependencyIds` field. To enable dependency
demand propagation we need to:

- Decide how dependencies are expressed on Nostr (a new tag kind, a reference in
  the existing `tags`, or a separate event kind). Coordinate with the team
  working on `task-state-events.ts`.
- Extend `Task` and the converter (`event-converter.ts`) to surface
  `dependencyIds`.
- Implement reverse-topological propagation of `sqrt(U * I)` demand to blockers
  using `maxSum` with `dependencyDampening`.
- Cycle handling: detect, collapse into a group, and surface as a UI warning.
- View behavior: hide blocked tasks from the default actionable list; expose a
  "Show blocked" toggle that displays transferred pressure.

### 2. Started vs. unstarted urgency

The current local urgency only uses the due date. To match section 4 of the
design we need:

- A reliable "started" signal. `Task` has no `startedAt` today — closest proxy
  is the first `stateUpdates` entry whose status is `active`, or any non-zero
  derived progress.
- An age-pressure term `(n_a / (n_a + n_d))^f_a` for unstarted tasks so dormant
  large items surface before the deadline.
- A progress-relief term `n_s / ((n_s + n_d) * p^f_p)` for started tasks so
  late-started work stays visible.
- A `sizeUnits` heuristic. We can derive it from subtask count for the first
  pass and let the user override later.

### 3. Local value / relevance / tenure

Section 11's `R = sqrt(F^(c/I) * T)` and `T = sqrt(A^q * I^p)` were skipped per
request ("ignore local value-calculation for now"). Bring them back when the
basic three-factor blend feels too noisy on real data.

### 4. Touch-quality nuances

The user explicitly asked to ignore touch durations. If/when we revisit:

- Differentiate touch types (state change vs. comment vs. edit) with a small
  weight map.
- Consider an exponential half-life model instead of inverse-time decay so the
  curve is interpretable in days.

### 5. Wiring into the UI

The current evaluator is pure and unused. Integration points:

- `src/domain/content/task-sorting.ts` — replace or augment the tier-based
  `getSortTier` with a priority-driven secondary key. Keep tiers for terminal
  tasks at the bottom.
- `Index.tsx` — compute the score map once per render with `useMemo` keyed on
  the visible task list, pass into views that need it.
- `QuickFilterState` — expose a "Sort by smart priority" toggle so the new
  ordering is opt-in until it has been validated.
- Project view: surface `ownPriority` vs. `aggregatePriority` per section 15.

### 6. Performance

- The evaluator is O(n) over tasks plus O(depth) per task for ancestor walks.
  Memoize `getAncestors` if profiling shows hot paths in deep hierarchies.
- For large boards consider recomputing only when the underlying tasks change
  (cache key on event ids + last-edited timestamps).

### 7. Tunability

`DEFAULT_PRIORITY_PARAMS` is a single exported constant. Before exposing knobs
to users, gather usage data and pick defaults that work on real boards. A
hidden debug overlay that prints `(U, I, F, P)` per task would help calibrate.

### 8. Not in scope

- No persistence of computed scores. Recompute on demand from current task
  state — this matches how the rest of the app treats derived data.
- No new Nostr event kinds for priority. Importance stays in the existing
  `priority` tag.
