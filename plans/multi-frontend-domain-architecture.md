# Plan: Multi-Frontend Domain Architecture

## Goal

Reshape the current feed-centric architecture so the same core logic can power multiple frontends without duplicating business rules:

- current task/discussion feed
- listings map
- marketplace-style listing browser
- more social-media-like timeline/feed

## Layer Model

Use a pragmatic layered model. Do not force classic MVC literally.

```text
domain      -> pure business logic; no React, no localStorage, no Nostr wire format
infrastructure -> adapters for storage, Nostr transport, external APIs; may depend on domain
feature controllers -> React hooks that assemble domain + infrastructure for one frontend
views/pages -> rendering and event wiring; depend only on feature controllers
```

Dependency direction:

```text
domain/content
domain/listings       (none import infrastructure or React)
domain/relays
domain/preferences

infrastructure/nostr       (imports domain, no pages, no feature controllers)
infrastructure/preferences (imports domain/preferences, no React)

features/feed-page/controllers  (imports domain + infrastructure)
features/feed-page/views

pages/Index.tsx         (imports only feature controllers + layout components)
```

Quick heuristic:

- "what should happen?" → `domain`
- "how do we fetch/store/send it?" → `infrastructure`
- "how does this specific page orchestrate it?" → `features/<name>/controllers`

## `domain/preferences` — Emergent Layer

The original plan put all preferences under `infrastructure`. During implementation a cleaner pattern emerged: split each preference module into two files:

- `domain/preferences/<name>-state.ts` — pure state model, mutation helpers, business rules; no I/O
- `infrastructure/preferences/<name>-storage.ts` — zod parsing, localStorage read/write; imports domain type

`pinned-channels` already follows this pattern. Apply the same split to all remaining preference modules.

## Target Structure

```text
src/
  domain/
    content/          ✅ established
    listings/         ✗ not started
    relays/           ✅ established
    preferences/      ✅ established (pinned-channel-state.ts)
  infrastructure/
    nostr/            ~ started (relay-identity, task-converter only)
    preferences/      ~ started (pinned-channels-storage only)
  features/
    feed-page/
      controllers/    ✅ established (13 files)
      views/          ✗ not started
    marketplace/      ✗ future
    listings-map/     ✗ future
    social-feed/      ✗ future
```

## Current State

### Already in place

**`domain/content/`**
- `task-merge.ts` — merge + deduplication of Task arrays
- `task-collections.ts` — pending-publish dedup key, relay/listing deduplication, sort overlays
- `channels.ts` — channel derivation from tasks
- `sidebar-people.ts` — author/people derivation

**`domain/relays/`**
- `relay-scope.ts` — relay scope resolution and visibility checks

**`domain/preferences/`**
- `pinned-channel-state.ts` — pinned channel state model and mutation helpers

**`infrastructure/nostr/`**
- `relay-identity.ts` — relay URL → id/name mapping
- `task-converter.ts` — Nostr wire events → Task/Person domain objects

**`infrastructure/preferences/`**
- `pinned-channels-storage.ts` — zod-parsed localStorage adapter for pinned channel state

**`features/feed-page/controllers/`** (13 files)
- `use-auth-modal-route`, `use-feed-demo-bootstrap`, `use-feed-navigation`
- `use-index-derived-data`, `use-index-filters`, `use-index-onboarding`
- `use-index-relay-shell`, `use-listing-status-publish`, `use-pinned-sidebar-channels`
- `use-saved-filter-configs`, `use-task-publish-controls`, `use-task-publish-flow`
- `use-task-status-controller`

### Ghost test files to delete

These were left behind after their source moved to `domain/`. The domain folders already have their own test files.

- `src/lib/channels.test.ts` (source now in `domain/content/channels.ts`)
- `src/lib/relay-scope.test.ts` (source now in `domain/relays/relay-scope.ts`)
- `src/lib/sidebar-people.test.ts` (source now in `domain/content/sidebar-people.ts`)
- `src/hooks/use-index-derived-data.test.ts` (source now in `features/feed-page/controllers/`)

## Remaining Work

### Milestone A: Finish `domain/content`

Move the following pure files from `src/lib/` to `src/domain/content/`:

| File | Dependencies | Note |
|------|-------------|------|
| `task-status.ts` | `@/types` only | trivially pure |
| `task-type.ts` | `@/types` only | trivially pure |
| `task-permissions.ts` | `@/types`, `mentions.ts` | `mentions.ts` may follow or be re-imported from lib |
| `task-filtering.ts` | `@/types`, `channel-filtering`, `person-filter` | depends on next two |
| `channel-filtering.ts` | `@/types` only | pure |
| `person-filter.ts` | `@/types` only | pure |
| `task-sorting.ts` | likely `@/types` only | verify |
| `task-text-filter.ts` | likely `@/types` only | verify |
| `depth-mode-filter.ts` | likely `@/types` only | verify |
| `task-view-filtering.ts` | wraps several above | move after its dependencies |
| `filter-state-utils.ts` | pure state derivation | verify no storage deps |
| `filter-snapshot.ts` | pure snapshot building | verify no storage deps |

`task-dates.ts` imports `i18n` for date formatting. Split if needed: pure date parsing/calculation → `domain/content/task-dates.ts`; display formatting → leave in `lib` or move to a view utility.

Also address: `task-collections.ts` imports `NostrEventKind.ClassifiedListing` from `@/lib/nostr/types`. This is a wire-format constant leaking into domain. Define a local domain constant (`LISTING_KIND = 30402`) and remove the infrastructure import.

### Milestone B: Migrate `infrastructure/preferences`

Apply the same `domain/preferences` + `infrastructure/preferences` split used for pinned-channels to every remaining preference module.

**Modules to split:**

`filter-preferences.ts` → split into:
- `domain/preferences/filter-state.ts` — Channel/Person filter state model and defaults
- `infrastructure/preferences/filter-preferences-storage.ts` — zod + localStorage

`saved-filter-configurations.ts` → split into:
- `domain/preferences/saved-filter-configurations-state.ts` — SavedFilterConfiguration model and rules
- `infrastructure/preferences/saved-filter-configurations-storage.ts` — zod + localStorage

`failed-publish-drafts.ts` → `infrastructure/preferences/failed-publish-drafts-storage.ts`
(state type can stay in `@/types`; no separate domain model needed unless business rules emerge)

**Thin adapters — move directly to `infrastructure/preferences/`:**
- `theme-preferences.ts` → `infrastructure/preferences/theme-preferences-storage.ts`
- `user-preferences.ts` → `infrastructure/preferences/user-preferences-storage.ts`
- `storage-registry.ts` → `infrastructure/preferences/storage-registry.ts`
(storage-registry is a pure key table; it belongs in infrastructure, not domain)

### Milestone C: Bulk-migrate `infrastructure/nostr`

Move the following from `src/lib/nostr/` to `src/infrastructure/nostr/`. Most are self-contained.

**Wire format / parsing:**
- `nip99-metadata.ts` — NIP-99 tag parsing
- `nip52-task-calendar-events.ts` — calendar event parsing
- `task-property-events.ts` — priority/property event parsing
- `task-state-events.ts` — status event kind checks
- `task-publish-tags.ts` — tag building for publishing
- `people-from-kind0.ts` — Kind-0 → Person mapping
- `profile-metadata.ts` — profile metadata parsing
- `geohash-location.ts` — geohash tag parsing (Note: pure geo math belongs here; keep or move pure geo helpers to `domain/listings` once that layer exists)

**Subscriptions / cache:**
- `event-cache.ts` — in-memory event cache
- `ndk-context.tsx` — NDK React context (infrastructure with React; fine here)

**Relays / config:**
- `default-relays.ts` — env-var relay URL resolution
- `relay-url.ts` — URL normalization utilities
- `relay-info.ts`, `relay-enrichment.ts` — relay metadata
- `nip42-auth.ts`, `nip42-relay-auth-policy.ts` — relay auth
- `replaceable-events.ts` — replaceable event key rules

**Leave in `src/lib/nostr/`** (these are utility/auth concerns that don't cleanly belong in infra):
- `nip05-resolver.ts`, `nip05-verify.ts`
- `nip49-utils.ts`, `nip49-test-vector.ts`
- `nip96-attachment-upload.ts`
- `nip98-http-auth.ts`
- `noas-client.ts`
- `dev-logs.ts`
- `utils.ts`
- `types.ts` (shared Nostr type definitions; moving requires updating all importers)

**Move Nostr subscription hooks from `src/hooks/` to `src/infrastructure/nostr/`:**
- `use-nostr-event-cache.tsx` — NDK subscription wrapper
- `use-kind0-people.ts` — Kind-0 subscription → Person[]
- `use-nostr-profiles.tsx` — profile subscription

These are infrastructure adapters that happen to use React hooks. They are not page-shaped controllers.

### Milestone D: Move remaining feed-page hooks

These three files in `src/hooks/` are feed-page-specific controllers:

- `use-relay-filter-state.ts` → `features/feed-page/controllers/`
- `use-filter-url-sync.ts` → `features/feed-page/controllers/`
- `use-task-view-filtering.ts` → `features/feed-page/controllers/`

After this, `src/hooks/` should contain only genuinely cross-cutting hooks:
`use-keyboard-shortcuts`, `use-mobile`, `use-swipe-navigation`, `use-task-navigation`,
`use-task-media-preview`, `use-toast`, `use-profile-editor`

### Milestone E: Slim `Index.tsx`

Currently 807 lines / 55 imports. Target: route wiring + layout composition only.

`Index.tsx` should:
- read route params
- instantiate the feed page controller (one hook call or small set)
- render desktop/mobile layouts

Remaining direct `@/lib/*` and `@/hooks/*` imports in `Index.tsx` after milestones A–D complete should all resolve to the new locations. Use that as the integration check.

Do not create a single `useFeedPageController` mega-hook unless it actually simplifies `Index.tsx`. The existing controller decomposition is fine; just ensure none of it lives in `src/hooks/` or is imported directly from `src/lib/` by the page.

### Milestone F: Establish `domain/listings`

Once `domain/content` is stable, extract listing-specific pure logic:

- Move `listing-replaceable-key.ts` from `src/lib/nostr/` — split out the pure identity function into `domain/listings/listing-identity.ts`; keep Nostr tag-building in `infrastructure/nostr/`
- Move listing status rules and projections out of controller code
- Move pure geo/geohash rules from `geohash-location.ts` into `domain/listings/location.ts`

This creates the foundation for the listings-map and marketplace frontends.

### Milestone G: Prototype second frontend

Validate the architecture by building one small second frontend.

Best candidate: **listings map**

- stresses location projections
- reuses `domain/listings` and `domain/relays`
- forces clearer separation from feed UI assumptions

Do not wait until the rest of the migration is 100% complete. Build this once `domain/listings` is established (Milestone F) to prove the seam.

## Dependency Check Points

After each milestone, verify:

```sh
# No domain files import React, infrastructure, or page code
grep -r "from.*react\|from.*@/infrastructure\|from.*@/features\|from.*@/pages" src/domain/

# No infrastructure/preferences files import React
grep -r "from.*react" src/infrastructure/preferences/

# No domain files import from src/lib/nostr
grep -r "from.*@/lib/nostr" src/domain/
```

After Milestone C:
```sh
# task-collections.ts should no longer import NostrEventKind
grep "NostrEventKind" src/domain/
```

## What To Avoid

- More root-level `src/hooks/use-index-*` files — any new feed-page hook goes under `features/feed-page/controllers/` from this point forward
- Letting `src/domain` become a renamed `src/lib` — every file moved to domain must be React-free and storage-free
- Pushing toasts, navigation, or localStorage into pure logic
- Moving `infrastructure/nostr` files in bulk without verifying their import graphs first
- Creating a `features/feed-page/views/` directory just to have it — only create it when the second frontend makes the separation load-bearing
- Extracting internal packages (`packages/nodex-domain`) before two frontends prove the boundary

## Success Criteria

- Alternate frontends can be built without importing `Index.tsx` logic or `src/lib/` directly
- Pure business logic is testable without React, without localStorage, without NDK
- `Index.tsx` becomes a layout adapter, not the app's implicit domain center
- `src/hooks/` contains only genuinely cross-cutting UI hooks
- `src/lib/` is a residual holding area, not the primary location for new logic
