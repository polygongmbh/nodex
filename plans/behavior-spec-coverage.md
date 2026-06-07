# Plan: Behavior Spec Coverage Strategy

Assessment of how well nodex's existing documentation + test suite serves as the behavior spec a future rewrite (or any major refactor) would need to reproduce. Concludes that the major assets are already in place and recommends targeted gap-fill rather than a new `docs/behaviors.md`.

## TL;DR

**Do not create `docs/behaviors.md`.** [`USER_GUIDE.md`](/Users/tj/IT/nostr/nodex/USER_GUIDE.md) already covers ~70-80% of user-visible behavior in concrete prose; the 1,662 passing tests (per [`rewrite-vs-refactor-strategy.md`](/Users/tj/IT/nostr/nodex/plans/rewrite-vs-refactor-strategy.md)) encode the engineering invariants. Together they form the behavior spec a rewrite would reproduce.

The gap is a narrow band of *engine lifecycle* behavior (state-machine transitions, subscription/reconnect timing, publish-queue retry semantics, cache hydration boundary, NIP-42 auth sequencing) that USER_GUIDE.md doesn't describe in spec terms and that tests verify per-unit without composing into a narrative. Fill that with one short engineering-facing doc only if a specific flow keeps biting during PMF iteration or rewrite scoping.

## Why This Question Exists

Earlier conversation proposed starting a `docs/behaviors.md` to preserve UX behaviors through any future framework rewrite — the rationale being that UX is encoded in React component code, and without a portable spec, the rewrite would have to reverse-engineer it from the React source.

That rationale is sound in general but partially obsolete for nodex: substantial behavior documentation already exists, and a behavior-focused test suite is in place. The right move is to use what's there.

## What Already Covers Behavior

### [`USER_GUIDE.md`](/Users/tj/IT/nostr/nodex/USER_GUIDE.md) (~200 lines, user-facing)

Sections present:

- Quick Start, Core Concepts, Navigation
- Channel and Tag Filtering (extensive — desktop cycle, content-hashtag click, AND/OR mode, header toggle-all, folded-sidebar preview, focused-scope preview)
- People Filtering (desktop + mobile)
- Feed Filtering and Publishing (probe behavior, NIP-65 enrichment, connection state, demo feed flag, root-task feed requirement, subtask routing, debug utilities)
- Saved Filter Presets (capture surface, apply, clear, rename/delete)
- Mobile Usage (Manage view, legal actions, version label, bottom bar combined search/compose)
- Legal Information (desktop bottom dock, mobile Manage)
- Onboarding Guide (signed-out gating, area overlays, auto-advance, anchor stability)
- Compose Rules (hashtag requirement, core-channel rule, NIP-05 username rules, kind change, color-code parsing, filter-as-metadata chips, undo-send, attachment paths, NIP-96/98 signing, image caption inference, date types, location, calendar integration)
- Compose keyboard behavior (desktop) — every shortcut documented
- Search behavior (match scope, URL mirroring, focus interactions)
- Table and Calendar Editing
- Responsive Breakpoints
- Reliability and Sorting (failed-publish banner, relay auto-pause, latest-event cache, status-reorder delay, presence publishing rules)
- Task Permissions (tagged vs untagged, relay-driven update ignore rules)

This covers the *user-observable* surface in prose at a level that a rewrite team could implement against directly. It is not just marketing — it documents edge-case rules ("click the same channel name again while it is the only included channel to clear that exclusive channel filter") that would otherwise live only in code.

### The test suite (~32,900 LOC test, 1,662 tests passing)

Per [`rewrite-vs-refactor-strategy.md`](/Users/tj/IT/nostr/nodex/plans/rewrite-vs-refactor-strategy.md): "1,662 behavior-focused tests encode permission rules, channel filter semantics, kind→status mapping, replaceable-event dedup, compose-submit blocking, NIP-19 mention parsing, hashtag extraction." Test-to-code ratio ~45%, all passing.

This covers the *engineering invariants* — the things that must remain true regardless of UI framework. A rewrite team would port these tests as-is (after stripping React-specific glue) and use green-on-port as the migration completion signal.

### Existing plans documents

- [`rewrite-vs-refactor-strategy.md`](/Users/tj/IT/nostr/nodex/plans/rewrite-vs-refactor-strategy.md) lists the load-bearing engine pieces explicitly under "What Genuine Complexity Looks Like (Keep)": NIP-42 auth pre-flight, subscription replay on relay reconnect, adaptive event-cache flush, replaceable-event key resolution, `canPubkeyUpdateTask` permission gates, kind-0 profile merge across relay origins.
- The other ~45 plan files collectively encode intent and decisions for various refactors-in-flight.

### CLAUDE.md "Context" and "Component Structure" sections

Document the architectural shape (provider layer, data flow, key types, views & routing, context concept) — i.e. the high-level mental model a rewrite team needs.

## The Actual Gap

What none of the above covers in spec form:

1. **Task state machine transitions.** USER_GUIDE.md uses status names (`open`, `active`, `done`, `closed`) but doesn't document the legal transitions, the events that drive them, the priority resolution when multiple events compete, or the per-status sort behavior. Code at [`src/domain/task-states/task-state-config.ts`](/Users/tj/IT/nostr/nodex/src/domain/task-states/task-state-config.ts) is the spec; not readable as one.
2. **Subscription / relay reconnect lifecycle.** What triggers a resubscribe? What happens to in-flight events when a relay drops mid-subscription? How does NIP-42 auth interleave with subscription start? Tests verify pieces; no narrative.
3. **Publish queue retry semantics.** USER_GUIDE.md says "failed-publish banner with retry/dismiss actions" but not: what triggers automatic vs manual retry, what the backoff is, what counts as "failed" vs "pending", how queue state survives reload, what happens if the user signs out while drafts pending.
4. **Cache hydration boundary.** localStorage feeds initial render before live subscriptions confirm. What's the contract? Which cached fields are trusted, which are placeholder-only? CLAUDE.md gives the policy fragment ("reject malformed entries, let the next ingest backfill") but not the per-cache contract.
5. **NIP-42 auth flow ordering.** When does the challenge land, how is the response sequenced relative to subscription start, what happens if signer isn't ready (see [`src/lib/nostr/...nip42...`] handling — recent commit `3ec436b2 fix(nip42): defer to NDK signer:ready queue when no signer` is exactly the kind of edge case that lives only in commit messages).

These five are the *high-leverage rewrite preserves* — they're load-bearing, they took bug reports to get right (per `rewrite-vs-refactor-strategy.md`), and they're not legible from either USER_GUIDE.md or any single test file.

## Recommendation

### Do

- **Keep [`USER_GUIDE.md`](/Users/tj/IT/nostr/nodex/USER_GUIDE.md) current as features evolve.** It is already the canonical UX behavior spec. Treat updates to it as a deliverable of each user-visible feature change (the existing CLAUDE.md workflow only mentions CHANGELOG; consider also "update USER_GUIDE.md when user-observable behavior changes").
- **Treat the test suite as the canonical engineering invariant spec.** Per `rewrite-vs-refactor-strategy.md`, the suite is the asset that makes the no-rewrite recommendation viable.
- **Add a small `docs/engine-behaviors.md` only when a specific flow keeps biting** (PMF support load, rewrite scoping difficulty, or a regression cluster). Don't write it speculatively — write it the moment a flow becomes painful to explain. Likely candidates listed in §"The Actual Gap" above; start with whichever bites first.

### Do not

- **Don't create `docs/behaviors.md` as a from-scratch spec.** It would duplicate USER_GUIDE.md and never stay in sync.
- **Don't try to one-shot-document the engine lifecycle.** Each of the five gap items is a 1-page note at most when written; together they're a procrastination target. Write them as needed.
- **Don't replace USER_GUIDE.md with engineering-flavored prose.** Its user-facing tone is the right one for its audience; an engineering doc serves a different audience.

## Coverage Map

| Behavior category | USER_GUIDE.md | Tests | CLAUDE.md | Other plans | Gap? |
|---|---|---|---|---|---|
| Channel / people / relay filter UI | ✓ extensive | ✓ | ✓ "Context" | mobile centralization, filter unification | none |
| Compose rules and validation | ✓ | ✓ | partial | composer split plans | small |
| Keyboard shortcuts | ✓ desktop | ✓ partial | — | — | mobile shortcuts not in USER_GUIDE |
| Onboarding | ✓ | ✓ | — | — | none |
| Failed-publish recovery | ✓ surface | ✓ unit | — | debounce-task-state-publish | semantics narrative missing |
| Saved presets | ✓ | ✓ | — | — | none |
| Calendar events | ✓ | ✓ | ✓ Views | — | none |
| Permissions | ✓ | ✓ | — | — | none |
| Search behavior | ✓ | ✓ | — | mobile centralization | none |
| Reliability (relay pause, cache rehydrate, presence) | ✓ surface | ✓ unit | partial | — | engine-lifecycle narrative missing |
| **Task state machine transitions** | partial (names only) | ✓ | partial | task-state-config-registry, task-state-registry-next | **YES — gap** |
| **Subscription / reconnect lifecycle** | — | ✓ unit | — | — | **YES — gap** |
| **NIP-42 auth ordering** | — | ✓ unit | — | — | **YES — gap** |
| **Publish queue retry semantics** | surface only | ✓ unit | — | — | **YES — gap** |
| **Cache hydration boundary contract** | — | ✓ unit | policy fragment | — | **YES — gap** |

## Decision

**Status: don't add a new spec doc now.** USER_GUIDE.md + tests already cover everything customer-facing and most engineering invariants. The five engine-lifecycle gaps are real but not blocking — they become worth writing only when one of them costs more (in support load, rewrite scoping, or regression frequency) than the hour it takes to write that one doc.

When that moment arrives, add `docs/engine-behaviors.md` and write *only the section that bit*. Resist the urge to write all five at once.

## Out of Scope

- Migrating USER_GUIDE.md format or structure
- Adding ARIA / accessibility notes (per CLAUDE.md, nodex has no a11y target)
- A separate `CONTRIBUTING.md` — CLAUDE.md serves that role
- API-style docs for `infrastructure/nostr/` exports — handled by code + tests
