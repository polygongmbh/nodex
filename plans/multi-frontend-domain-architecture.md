# Plan: Multi-Frontend Domain Architecture

## Goal

Reshape the current feed-centric architecture so the same core logic can power multiple frontends without duplicating business rules:

- current task/discussion feed
- listings map
- marketplace-style listing browser
- more social-media-like timeline/feed

## Layer Model

```text
domain      -> pure business logic; no React, no localStorage, no Nostr wire format
infrastructure -> adapters for storage, Nostr transport, external APIs; may depend on domain
features/<name>/controllers -> React hooks that assemble domain + infrastructure for one frontend
features/<name>/views       -> React components; depend only on feature controllers
pages/Index.tsx             -> route wiring + layout composition only
```

Dependency direction:

```text
domain/*            (no imports from infrastructure, React, or features)
infrastructure/*    (imports domain; no feature or page imports)
features/*/controllers  (imports domain + infrastructure)
features/*/views        (imports feature controllers)
pages/Index.tsx         (imports feature controllers + layout primitives only)
```

Quick heuristic:

- "what should happen?" → `domain`
- "how do we fetch/store/send it?" → `infrastructure`
- "how does this specific page orchestrate it?" → `features/<name>/controllers`

## Current Structure (as of this writing)

```text
src/
  domain/
    content/        ✅ complete — task rules, filtering, sorting, channel derivation
    listings/       ~ started — listing-identity.ts only
    relays/         ~ started — relay-scope.ts, relay-reconnect-policy.ts
    preferences/    ✅ complete — pinned-entity, pinned-channel, pinned-person,
                                  filter-state, saved-filter-state
  infrastructure/
    nostr/          ✅ complete — event cache, converter, publish tags, relay auth,
                                  NIP parsing, subscription hooks, provider/
    cache/          ~ started — ndk-cache-adapter.ts
    preferences/    ✅ complete — all *-storage.ts adapters, storage-registry
  features/
    feed-page/
      controllers/  ✅ substantial — hooks plus controller-scoped contexts covering
                                  filters, publish, navigation, relay state,
                                  sidebar, status, onboarding
      interactions/ ~ new — interaction pipeline, intents, middleware skeleton
      views/        ~ active — desktop/mobile shells, sidebar, view pane,
                               ui config context
  hooks/            ~ clean — cross-cutting UI hooks only
  lib/              ~ residual — still has unclassified modules
  lib/nostr/        ~ residual — some files still need moving or deletion
  pages/
    Index.tsx       ✗ still larger than intended; should end as route/layout composition only
```

## Remaining Work

### 1. Rename `features/feed-page/controllers/` → `features/feed-page/hooks/`

The rename is no longer a purely mechanical cleanup, because the directory now contains both hooks and controller-scoped context providers such as `feed-sidebar-controller-context.tsx`.

Revised decision point:
- either split non-hook files out first, then rename `controllers/` → `hooks/`
- or keep `controllers/` intentionally and document that this repo uses it for feature orchestration modules, not just hooks

Do not treat this as a trivial rename anymore.

### 2. Finish `lib/nostr/` classification

**Move to `infrastructure/nostr/`:**
- `event-id.ts` — Nostr event ID format validator (wire format concern)
- `utils.ts` — NIP-01 event creation, serialization, validation utilities
- `content-references.ts` — NIP-19/27 content reference parsing (uses nostr-tools)
- `user-facing-pubkey.ts` — NDKUser pubkey formatting (uses NDK)

**Move to `domain/relays/`:**
- `task-relay-routing.ts` → rename to `submission-routing.ts`
  - Pure relay selection policy for submission: which relay to target based on task type, parent task, and selected relays
  - Remove the `nostrDevLog` call before moving (domain must not import logging infrastructure)
  - The `RELAY_SELECTION_ERROR_KEY` i18n string can stay as a typed constant

**Leave in `lib/nostr/`** (not worth moving):
- `types.ts` — shared Nostr type definitions used everywhere; moving requires touching all importers
- `dev-logs.ts` — debug logging utility; infrastructure-adjacent but fine here
- `nip05-resolver.ts`, `nip05-verify.ts`, `nip49-utils.ts`, `nip49-test-vector.ts`
- `nip96-attachment-upload.ts`, `nip98-http-auth.ts`, `noas-client.ts`

### 3. Finish `lib/` classification

**Move to `domain/content/`:**
- `kanban-sorting.ts` — already imports from `domain/content/task-sorting`; move it there
- `task-dates.ts` — imports `i18n` only for display formatting; extract the pure date logic (parsing, comparison, type narrowing) to `domain/content/task-dates.ts` and leave display formatting in `lib/`
- `mentions.ts` — pure text parsing, no I/O; move to `domain/content/mentions.ts` (currently used by `domain/content/task-permissions.ts` via `@/lib/mentions`)
- `hashtags.ts` — pure regex-based hashtag parsing; move to `domain/content/hashtags.ts`

**Move to `infrastructure/preferences/`:**
- `person-frecency.ts` — imports storage-registry, has load/save I/O; move as `person-frecency-storage.ts`
- `channel-frecency.ts` — same pattern; move as `channel-frecency-storage.ts`

**Assess before moving:**
- `app-preferences.ts` — currently just type definitions (`AppPreferenceKey`, `AppPreferenceSurface`); if it stays pure types, move to `domain/preferences/app-preference-types.ts` or merge into `@/types`
- `submission-tags.ts` — check if pure; if so, `domain/content/` or `infrastructure/nostr/`
- `compose-prefill.ts`, `composer-content.ts` — likely domain/content if pure
- `completion-cheer.ts`, `completion-feedback.ts` — check for I/O; may be domain/content

**Leave in `lib/`** (UI or narrow-scope utilities that don't need migration):
- `author-color.ts`, `task-interaction-styles.ts`, `task-timestamp-tooltip.ts` — UI presentation helpers
- `sidebar-collapsed-preview.ts`, `status-menu-focus.ts` — UI state helpers
- `keyboard-platform.ts` — platform detection utility
- `onboarding-*.ts` — onboarding flow logic; could move to features eventually but not blocking
- `current-user.ts`, `current-user-profile-cache.ts`, `guest-name.ts` — identity helpers
- `presence-status.ts` — Nostr presence event building; could go to infrastructure/nostr eventually
- `safe-local-storage.ts`, `runtime-storage-guard.ts` — storage utilities used by infrastructure
- `attachments.ts` — attachment helpers used across features

### 4. Keep Page-Level Orchestration Thin

This plan is not the detailed cleanup plan for `Index.tsx`, but the architecture constraint still matters:

- pages should stay as route wiring + layout composition
- feed-specific orchestration belongs in `features/feed-page/controllers/` and `features/feed-page/views/`
- do not create a single mega-hook just to cosmetically reduce imports

Treat page slimming as an ongoing guardrail, not the main deliverable of this architecture plan.

### 5. Establish `domain/listings` (Milestone F)

`listing-identity.ts` is still the only file there today. Add:
- `location.ts` — pure geohash math and location display helpers (split from `infrastructure/nostr/geohash-location.ts`)
- `listing-status.ts` — listing status rules and transition policies (currently embedded in controller code)
- `listing-projections.ts` — view-model projection helpers for listing cards and markers

This is the prerequisite for the listings-map and marketplace frontends.

### 6. Clarify `features/feed-page/interactions/`

This new subdirectory (`feed-interaction-context.tsx`, `feed-interaction-intent.ts`, `feed-interaction-pipeline.ts`, `feed-interaction-middleware-skeleton.ts`) represents an interaction pipeline pattern not described in the original plan. Before it grows further, document what the intended boundary is:

- Is this the right layer for interaction orchestration, or does it belong in `controllers/`?
- What distinguishes an "interaction" from a "controller hook"?
- Is the middleware skeleton expected to grow into a general pattern used by other features?

Without a clear rule, this directory risks becoming a second `lib/` inside `features/`.

### 7. Validate `infrastructure/cache/`

`ndk-cache-adapter.ts` now exists and currently stores relay NIP-11 status summaries rather than broader event/query cache data.

Decision to make:
- keep it in `infrastructure/cache/` as the home for adapter-backed caches in general, or
- move it closer to relay/Nostr infrastructure if this file remains specifically about relay metadata

This is no longer a hypothetical validation; it is an actual placement decision for an active file.

### 8. Prototype second frontend (Milestone G)

Do not wait for all the above to be complete. Build a thin listings-map frontend once `domain/listings` has the location and projection files (step 5).

Best proof: a map view that renders listing markers using `domain/listings` projections and `domain/relays` scope — without importing any feed-page controllers or Index.tsx logic.

## Dependency Check

Run after each step:

```sh
# Domain must be clean
grep -r "from.*react\|from.*@/infrastructure\|from.*@/features\|from.*@/pages" src/domain/

# No domain files import from lib/nostr
grep -r "from.*@/lib/nostr" src/domain/

# infrastructure/preferences must not import React
grep -r "from.*react" src/infrastructure/preferences/

# Page shells should mostly import from features/, components/, and routing/types
grep "^import" src/pages/Index.tsx | grep -v "from.*@/features\|from.*@/components\|from.*@/types\|from.*react\|from.*react-router"
```

## What To Avoid

- Letting `features/feed-page/controllers/` continue to mix hooks and non-hook controller modules without a clear rule
- Growing page-level orchestration further before the feature boundaries are clearer
- Letting `features/feed-page/interactions/` expand without a clear definition of what it owns
- Moving `lib/nostr/types.ts` — the import blast radius is not worth it; leave it in place
- Creating `domain/listings` files that are too thin to be meaningful — wait until there is real listing logic to extract, not just stubs
- Extracting internal packages (`packages/nodex-domain`) before two frontends prove the seam

## Success Criteria

- Alternate frontends can import `domain/*` and `infrastructure/*` without touching `features/feed-page/` or `pages/Index.tsx`
- Page components stay as route/layout shells rather than frontend-specific orchestration hubs
- `src/lib/` contains only narrow-scope utilities with no clear domain home
- `src/hooks/` contains only genuinely cross-cutting UI hooks
- Pure business logic is testable without React, localStorage, or NDK
