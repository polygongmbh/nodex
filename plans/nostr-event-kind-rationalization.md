# NostrEventKind ↔ NDKKind rationalization

## Problem

The project defines its own numeric enum `NostrEventKind` (`src/lib/nostr/types.ts`) with ~325 usages across the codebase. It overlaps NDK's `NDKKind` for common kinds (Metadata=0, Reaction=7, ChannelCreation=40, etc.) but adds NIP-34 / project-specific ones NDK doesn't ship (Task=1621, GitStatusOpen/Applied/Closed/Draft=1630–1633, Procedure=1639, CalendarDateBased/TimeBased, UserStatus=30315, ClassifiedListingDraft=30403).

The smell that surfaced this: `kinds: [REACTION_EVENT_KIND as unknown as NDKKind]` in `use-reactions.ts`. TS treats the two enums as distinct branded types even when the numeric value matches, so any code passing a `NostrEventKind` member to an NDK API typed against `NDKKind` requires a cast. The wider issue: do we need two parallel enums at all?

Also worth noting: NDK's `NDKKind.Task = 1934` is an NDK-only convention paired with `NDKProject` (kind 31933), **not** a ratified NIP. The project's `Task = 1621` is the NIP-34 *Issue* kind. So the name `Task` is doing double duty across two unrelated data models — whichever direction we go, this collision needs resolving.

## Options

### Option A — Status quo, keep both enums

Leave `NostrEventKind` as-is. Cast at the NDK boundary when needed (we just did this for `use-reactions.ts` by using `NDKKind.Reaction` directly at the call site).

- **Pros**: zero churn; project owns its domain naming; clear separation between "what we publish/consume" and "what NDK happens to model".
- **Cons**: every new NDK API call site that takes filters needs awareness of the two-enum dance; the casts/double-imports keep cropping up.
- **Effort**: none.

### Option B — Replace `NostrEventKind` with NDKKind + small companion modules

Drop the project enum. Use `NDKKind` everywhere it suffices. Add small focused modules for the missing kinds:

```ts
// src/lib/nostr/nip34-kinds.ts
export const NIP34_ISSUE = 1621;
export const NIP34_STATUS_OPEN = 1630;
export const NIP34_STATUS_APPLIED = 1631;
export const NIP34_STATUS_CLOSED = 1632;
export const NIP34_STATUS_DRAFT = 1633;
export type Nip34StatusKind =
  | typeof NIP34_STATUS_OPEN
  | typeof NIP34_STATUS_APPLIED
  | typeof NIP34_STATUS_CLOSED
  | typeof NIP34_STATUS_DRAFT;
```

Similar for calendar / user-status / procedure kinds, grouped by NIP or domain.

- **Pros**: no fake unification; types stop lying about being interchangeable; NDK API boundary cost disappears; small literal unions like `Nip34StatusKind` are honest about the valid value set (genuinely useful for `Task.status` discriminators); the NIP grouping makes the protocol surface easier to learn.
- **Cons**: large mechanical refactor across ~325 call sites; the project loses one umbrella import; reverse mapping (`NostrEventKind[7] === "Reaction"`) goes away.
- **Effort**: high. Most edits are `NostrEventKind.X` → `NDKKind.X` or `NIP34_*`. Codemod-able via jscodeshift.

### Option C — Make `NostrEventKind` a superset of `NDKKind` via const-object merge

Build the project enum as a const object that spreads NDKKind and adds the project-specific kinds:

```ts
export const NostrEventKind = {
  ...NDKKind,
  Issue: 1621,            // NIP-34 issue (was Task)
  GitStatusOpen: 1630,
  GitStatusApplied: 1631,
  GitStatusClosed: 1632,
  GitStatusDraft: 1633,
  Procedure: 1639,
  // ...
} as const;
export type NostrEventKind = (typeof NostrEventKind)[keyof typeof NostrEventKind];
```

Now `NostrEventKind.Reaction === NDKKind.Reaction` at the *type* level, so filters accept it without casts.

- **Pros**: solves the NDK-boundary cast smell at the source; single import for the whole kind surface; minimal call-site churn (renames only where members collide).
- **Cons**: must rename one of the `Task` collisions (recommend `Task` → `Issue` in the project, since 1621 is NIP-34's issue kind, not a "task"); loses numeric-enum reverse mapping; conceptually fuses two different things (NDK's app-level convention + the wire protocol) into one identifier.
- **Effort**: medium. The `Task` rename is the bulk of the work; other members keep the same names.

### Option D — No union at all; kinds are just numbers

Accept that `kind` is `number` at the wire level. Keep `NDKKind` for code that hits NDK APIs. Define project-specific kinds as plain `const`s or tightly-scoped literal unions where they actually constrain something (e.g. `Task.status: 1630 | 1631 | 1632 | 1633`). Drop the umbrella `NostrEventKind` enum entirely.

- **Pros**: most honest — the network really does just send numbers; literal unions appear only where they earn their keep; no enum cross-pollination problems.
- **Cons**: same migration cost as B; loses the documentation value of a single named enum listing all kinds the app knows about.
- **Effort**: high, similar to B.

## Recommendation

**Option B or C, leaning B.**

- B is cleaner conceptually: NDKKind for NDK-known kinds, NIP-grouped modules for the rest. The NIP grouping doubles as protocol documentation.
- C is less disruptive but adopts NDK's app-level conventions (NDKKind includes things like `NDKKind.Project = 31933`, `NDKKind.AppHandler`) which we don't necessarily endorse just because they're in the enum.
- A is fine for now if no broader refactor is in flight — the cast smell is small and isolated.
- D is the purist answer but the migration cost matches B without B's documentation upside.

Whichever path, **rename the project's `Task = 1621` to `Issue`** along the way. It's the right NIP-34 name and removes the collision with NDK's `Task = 1934`.

## Out of scope

- Refactoring the `Task` *domain model* (`src/types/index.ts` `Task` interface, view components) — only the enum name needs to change. Keep "task" as the app's user-facing concept.
- Adding NDKKind-style wrapper classes (`NDKTask`, `NDKArticle`). The project doesn't use this NDK pattern and adopting it is a separate question.
