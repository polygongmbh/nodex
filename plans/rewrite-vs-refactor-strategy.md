# Plan: Rewrite vs Refactor Strategy

Strategic assessment of whether to rewrite Nodex from scratch versus continue the iterative refactor path. Based on a five-agent codebase audit (provider layer, event-conversion pipeline, view layer, test suite, scale/history).

## TL;DR

**Do not rewrite.** A rewrite would be the Netscape fallacy here. The codebase has real smells, but they are localized to ~6 files and finishable migrations, not architectural deadlocks. The test suite is a genuine behavioral spec, and the hard-won Nostr-protocol knowledge is embedded in code that would be expensive to rediscover.

Recommended path: a tight sequence of file-level demolitions and migration completions, ordered by leverage. Each step ships independently behind the existing test net.

## Codebase Snapshot

| Metric | Value |
|---|---|
| Source files (ts/tsx) | 627 |
| Production LOC (non-test) | ~72,500 |
| Test LOC | ~32,900 |
| Test-to-code ratio | ~45% |
| Tests passing | 1,662 / 1,662 |
| Total commits | 2,609 |
| Refactor commits (last 3 mo) | 307 (~25% of recent work) |

## Why a Rewrite Would Lose

1. **Behavioral spec already exists.** 1,662 behavior-focused tests encode permission rules, channel filter semantics, kind→status mapping, replaceable-event dedup, compose-submit blocking, NIP-19 mention parsing, hashtag extraction. A rewrite restarts from zero coverage.

2. **Embedded protocol knowledge.** Each of these took bug reports to get right and is not obvious from the NIPs:
   - NIP-42 auth pre-flight before subscription
   - Subscription replay when a relay reconnects mid-flight
   - Replaceable / parameterized event dedup keys
   - Relay capability verification (read/write ops with operation counters)
   - Kind-0 profile merge across multiple relay origins
   - Adaptive event-cache flush (64–500 ms debounce based on backfill burst)
   - Permission gating on state-event and property-event mutations

3. **Refactor velocity is healthy.** 307 refactor commits in three months proves the codebase is not stuck — it is mid-stride. Refactor themes have been productive: type unification (`Task`/`Post`), state derivation cleanup, cache architecture simplification, registry-based reactions, hook consolidation.

4. **No architectural deadlock symptoms.** No framework obsolescence (React + Vite + NDK are current). No inability to ship features. No fundamentally wrong domain model — the `Post` union with `TaskPost | CommentPost | ListingPost | CalendarEventPost` and the registry-driven state config are recently unified and tested.

## Where the Real Pain Is

The audit produced a clear concentration of accidental complexity in a small set of files.

### A. God components / files exceeding the 300-line cap

| File | Lines | × cap | Concerns mixed |
|---|---|---|---|
| `src/components/tasks/TaskComposer.tsx` | 2,502 | 8.3× | composer, autocomplete, attachments, metadata, date/time, drag-drop, rich-text, form state |
| `src/components/mobile/UnifiedBottomBar.tsx` | 1,983 | 6.6× | composer, filter UI, view switching, sidebar, mobile nav |
| `src/pages/Index.tsx` | 919 | 3.1× | filter state, derived task lists, 6 context sources + 26 memoized values prop-drilled |
| `src/infrastructure/nostr/provider/ndk-provider.tsx` | 900 | 3.0× | 40 context properties, 13 internal hooks, 8 useRef containers, 23 useState |
| `src/components/tasks/CalendarView.tsx` | 904 | 3.0× | grid, navigation, date selection, embedded composer |
| `src/components/tasks/KanbanView.tsx` | 589 | 2.0× | rendering + own SortContext + own priority calc |
| `src/components/tasks/ListView.tsx` | 581 | 1.9× | rendering + own priority calc |
| `src/components/tasks/FeedView.tsx` | 538 | 1.8× | rendering + own children map |

### B. Cross-cutting duplication across views

All four views independently compute:

- `buildChildrenMap(allTasks)` — at `ListView.tsx:172`, `KanbanView.tsx:173`, `FeedView.tsx:252`, `CalendarView.tsx:148`
- `evaluateTaskPriorities(allTasks)` — at `ListView.tsx:173`, `KanbanView.tsx:174`
- `makeIsProject(allTasks)` — at `FeedView.tsx:249`, `KanbanView.tsx:232`, `ListView.tsx:191`, `CalendarView.tsx:150`

Effects: N+1 recomputation when `allTasks` changes, drift risk across views, blocks any global indexed-lookup optimization.

### C. In-flight migrations that need to land

- **`lib/nostr/` ↔ `infrastructure/nostr/` split.** Boundary is real (utilities vs adapters) but unfinished. `infrastructure/nostr/` currently mixes domain logic (`task-converter.ts`, `task-state-fold.ts`, `task-property-events.ts`) with React glue (`use-nostr-event-cache.tsx`, `use-kind0-people.tsx`). The `ndk-context.tsx` re-export bridge appears to be an unpopulated facade. The existing `plans/post-architecture-next-steps.md` already targets this; finish it.
- **Triple-dispatch task state mapping.** Kind → `TaskStateEventKind` set (`task-state-events.ts:8`), then kind+content → `TaskStatus` (`task-state-events.ts:58`), then `TaskStatus`+label → `TaskStateDefinition` (`task-state-config.ts:88`). Callers wire three lookups; no single `eventToTaskState()`.

### D. Specific hotspot: `nostrEventsToTasks`

`task-converter.ts:217–402` is a 185-line single function doing 13 phases (deletion maps → filter → replaceable dedup → state-fold → date hydration → priority hydration → calendar event hydration) with 4 mutable Maps and 2 arrays in flight. The protocol complexity is real and tested; the linear monolithic shape is accidental.

## What Genuine Complexity Looks Like (Keep)

These are not refactor targets — they are the load-bearing pieces:

- NIP-42 auth pre-flight + challenge priming (`use-relay-verification.ts:156–223`)
- Subscription replay on relay reconnect (`use-relay-verification.ts:238–260`)
- Adaptive event-cache flush (`use-nostr-event-cache.tsx`)
- Replaceable-event key resolution (`task-converter.ts:253–266`)
- `canPubkeyUpdateTask` permission gates (`task-converter.ts:303, 347`)
- Kind-0 profile merge across relay origins

## Prioritized Demolition Sequence

Ordered by leverage = (touch frequency × current pain) ÷ extraction cost. Each milestone is independently shippable.

### Milestone 1: Split `TaskComposer.tsx` (2,502 → ~6 files of ~300–400 lines)

**Why first:** highest-touched surface in the app; its mass is what makes every feature change feel slow. Demolition here also reveals whether the rest of the codebase will yield to extraction (test).

Existing plan: `plans/composer-shell-ownership-refactor.md`, `plans/task-composer-display-ownership-shift.md` — consolidate them.

Target split:
- `TaskComposerShell.tsx` — form state + submission wiring
- `ComposerAutocomplete.tsx` — channel/person/hashtag autocomplete
- `ComposerAttachments.tsx` — file upload, imeta, drag-drop
- `ComposerMetadata.tsx` — date/time/geohash/priority pickers
- `ComposerRichText.tsx` — input rendering + paste handling
- `useComposerSubmit.ts` — submit pipeline (already partly extracted)

Tests already exist in `TaskComposer.test.tsx`; verify they still pass at each step.

### Milestone 2: Share view helpers (eliminate 4× duplication)

**Why next:** small, cheap, prevents drift, and unblocks future index-based optimizations.

Create `src/features/feed-page/use-view-derived-data.ts` returning `{ childrenMap, priorityScores, isProject }` memoized once at `Index.tsx` and passed down (or via a `ViewDerivedDataContext`).

Then remove the inline `useMemo` in `ListView`, `KanbanView`, `FeedView`, `CalendarView`.

### Milestone 3: Decompose `Index.tsx` (919 → <300)

**Why:** the orchestrator currently does too much; downstream views inherit its prop list.

Existing plan: `plans/split-index-page-remaining.md` — execute it.

Target structure:
- `Index.tsx` — shell + route → view dispatch only
- `useIndexFilters.ts` — sidebar filter state (already partly extracted)
- `useIndexDerivedData.ts` — task list derivation (referenced in recent refactor commits)
- `IndexContextProvider` — single context exposing what views need

### Milestone 4: Split `UnifiedBottomBar.tsx` (1,983 → ~5 files)

**Why:** parallels Milestone 1 for mobile. Don't start before Milestone 1 — the composer split there will inform the mobile split.

Target: separate composer, filter chips, view switcher, sidebar trigger, nav into peer components co-located under `src/components/mobile/bottom-bar/`.

### Milestone 5: Finish `lib/nostr` → `infrastructure/nostr` migration

**Why:** kill the half-done split that confuses imports and ownership. Land what `plans/post-architecture-next-steps.md` already specifies.

Steps:
1. Move pure domain logic (`task-converter.ts`, `task-state-fold.ts`, `task-property-events.ts`) into `src/domain/content/` or similar.
2. Keep `infrastructure/nostr/` for adapters and React glue only.
3. Delete `ndk-context.tsx` re-export bridge (replace with direct imports of the provider module).
4. Move `lib/nostr/task-relay-routing.ts` into `domain/` per the existing plan.

### Milestone 6: Decompose `NDKProvider` context (40 props → 4 contexts)

**Why later:** highest blast radius — 64 files import `useNDK`. Save until the simpler wins are landed and the seams are clearer.

Target split:
- `AuthContext` — user, authMethod, login/logout actions
- `RelayPoolContext` — relays, addRelay/removeRelay, status
- `PublishContext` — publish, failed-publish queue, retry
- `SubscriptionContext` — subscribe, raw events

Use codemod (`jscodeshift`) to migrate call sites file-by-file. Each context can be introduced behind a fan-out from `useNDK` so callers migrate incrementally.

### Milestone 7: Phase the `nostrEventsToTasks` pipeline

**Why last:** the function is well-tested and works; touch it only when adding a new event kind or phase forces the issue.

Target shape:
```
nostrEventsToTasks(events) =
  events
    |> applyDeletions
    |> dedupReplaceable
    |> partitionByKind
    |> foldStateEvents
    |> hydrateDates
    |> hydratePriorities
    |> hydrateCalendarLinks
```

Each phase returns a typed intermediate; the orchestrator function drops from 185 to ~30 lines.

## Decision Checkpoint

After Milestone 1 (TaskComposer split), re-evaluate:

- **If extraction yielded cleanly** — the codebase is in better shape than it feels. Continue down the sequence.
- **If extraction fought hard** — there is a hidden coupling worth understanding before continuing. Stop and diagnose; don't rewrite reflexively.

Almost all rewrites of a 72k-LOC codebase with 1.6k tests cost more than predicted and ship later than the refactored version would have. Re-evaluate the rewrite question only if Milestone 1 reveals a coupling problem that local extraction cannot resolve — and even then, prefer surgical replacement of the offending subsystem over a full restart.

## Out of Scope for This Plan

- Framework migration (React, Vite, NDK) — no signal that any is needed.
- Domain model rework — `Post` union and state registry are recently unified and tested.
- New features — this plan is purely structural.
- Test rewrite — the suite is the asset that makes this whole strategy viable.
