# Plan: Multi-Frontend Domain Architecture

## Goal

Reshape the current feed-centric architecture so the same core logic can power multiple frontends without duplicating business rules:

- current task/discussion feed
- listings map
- marketplace-style listing browser
- more social-media-like timeline/feed

This is a structure plan, not just another `Index.tsx` split plan.

## Problem Statement

The current codebase is still organized primarily around one page and one frontend shape:

- `Index.tsx` is the composition root for too much state and orchestration
- many extracted hooks are page-specific controllers, not reusable domain modules
- a lot of valuable logic exists, but it lives behind React hooks and page setters
- view-independent concerns are mixed with feed-specific UI assumptions

That makes reuse harder for alternate frontends like:

- a map that needs geo-scoped listing markers
- a marketplace that needs listing-first projections and actions
- a social feed that needs author/timeline projections more than task trees

## Recommended Architecture Model

Do not force classic MVC literally.

Use a pragmatic layered model:

1. `Domain`
   Pure business logic and canonical entities.
   No React.

2. `Application / Controllers`
   Feature-specific orchestration.
   React hooks are fine here.
   These consume domain modules and infrastructure adapters.

3. `Views`
   React components and route pages.
   Mostly rendering and event wiring.

This is effectively a feature-oriented Presentation Model / MVVM-lite approach.

## Folder Semantics: `domain` vs `infrastructure`

Use `src/domain` only for code that still makes sense if transport, storage, and UI change.

`domain`

- canonical entities and relationships
- merge and dedupe policies
- visibility and filtering rules
- listing/task/comment business rules
- frontend projections that derive from canonical entities

`infrastructure`

- Nostr publish/subscribe adapters
- event parsing/mapping from wire format
- event cache and query cache adapters
- browser and localStorage persistence
- preference storage and serialization
- geolocation and external API integrations

Quick heuristic:

- “what should happen?” -> `domain`
- “how do we fetch/store/send it?” -> `infrastructure`

Important nuance:

- Nostr wire-event parsing belongs in `infrastructure`
- canonical content merge/dedupe policy belongs in `domain`

Do not move mixed `src/lib` modules wholesale. Split them by responsibility.

## Dependency Rules

Target dependency direction:

```text
domain -> no React, no page imports
infrastructure -> may depend on domain, no page imports
feature controllers -> depend on domain + infrastructure
views/pages -> depend on feature controllers
```

Avoid:

- domain importing hooks
- feature controllers importing route pages
- pure derivation logic depending on component props or toasts
- infrastructure details leaking directly into UI components

## Proposed Target Structure

```text
src/
  domain/
    content/
      entities/
      queries/
      projections/
      policies/
    listings/
      queries/
      projections/
      policies/
    relays/
      queries/
      policies/
  infrastructure/
    nostr/
      events/
      publishing/
      subscriptions/
    storage/
    preferences/
  features/
    feed-page/
      controllers/
      views/
    marketplace/
      controllers/
      views/
    listings-map/
      controllers/
      views/
    social-feed/
      controllers/
      views/
```

This does not need to be implemented all at once. The key point is to create a real domain seam before building more frontends.

## Current File Groupings To Steer Toward

These are directional groupings, not a bulk-move instruction.

### Likely `domain/content`

- `src/lib/task-filtering.ts`
- `src/lib/task-status.ts`
- `src/lib/task-permissions.ts`
- `src/lib/task-type.ts`
- `src/lib/task-dates.ts`
- `src/lib/channels.ts`
- `src/lib/channel-filtering.ts`
- `src/lib/sidebar-people.ts`
- `src/lib/relay-scope.ts`
- task/listing merge and dedupe helpers currently living around `event-converter` and `Index`

### Likely `domain/listings`

- `src/lib/nostr/listing-replaceable-key.ts` after splitting out any Nostr-specific assumptions
- listing-specific status rules and projections now embedded in page/controller code
- geohash- and listing-oriented pure rules from `src/lib/nostr/geohash-location.ts`

### Likely `infrastructure/nostr`

- `src/lib/nostr/event-converter.ts`
- `src/lib/nostr/task-publish-tags.ts`
- `src/lib/nostr/nip52-task-calendar-events.ts`
- `src/lib/nostr/task-property-events.ts`
- `src/lib/nostr/nip99-metadata.ts`
- `src/lib/nostr/default-relays.ts`
- `src/lib/nostr/event-cache.ts`
- `src/lib/nostr/ndk-context.tsx`
- `src/hooks/use-nostr-event-cache.tsx`
- `src/hooks/use-kind0-people.ts`

### Likely `infrastructure/preferences`

- `src/lib/filter-preferences.ts`
- `src/lib/pinned-channels-preferences.ts`
- `src/lib/saved-filter-configurations.ts`
- `src/lib/failed-publish-drafts.ts`
- `src/lib/theme-preferences.ts`
- `src/lib/publish-delay-preferences.ts`
- `src/lib/current-user-profile-cache.ts`
- `src/lib/storage-registry.ts`
- `src/lib/user-preferences.ts`

### Likely `features/feed-page/controllers`

- `src/hooks/use-feed-navigation.ts`
- `src/hooks/use-index-filters.ts`
- `src/hooks/use-index-onboarding.ts`
- `src/hooks/use-index-derived-data.ts`
- `src/hooks/use-index-relay-shell.ts`
- `src/hooks/use-pinned-sidebar-channels.ts`
- `src/hooks/use-task-publish-controls.ts`
- `src/hooks/use-task-publish-flow.ts`
- `src/hooks/use-task-status-controller.ts`
- `src/hooks/use-auth-modal-route.ts`
- remaining `Index` orchestration such as listing-status publish and guide/demo bootstrap

The main steer is:

- shared business rules go down into `domain`
- transport/persistence specifics go sideways into `infrastructure`
- page-shaped orchestration moves under `features/feed-page`

## Domain Boundaries To Establish First

### 1. Content Graph Domain

Shared logic for tasks, comments, listings, and derived content relationships.

Owns:

- canonical content entities
- parent/child relationships
- merge and dedupe rules
- optimistic overlay application
- relay-scope membership checks
- channel extraction and filtering inputs
- author/sidebar people derivation inputs

Good candidates to move here:

- `mergeTasks`
- listing replaceable dedupe rules
- pending-publish dedupe key logic
- `filterTasks`
- channel derivation inputs and helpers
- relay-scope checks that are currently page-consumed

### 2. Listing Domain

Shared logic for listings regardless of whether they appear in a feed, a map, or a marketplace grid.

Owns:

- listing identity and replaceable-key rules
- listing status mutation rules
- listing projection helpers
- listing map marker projection
- listing card projection
- location-aware listing filters

Good candidates:

- `getListingReplaceableKey`
- listing status publish tag building
- geohash normalization and location display helpers
- listing-specific feed filters

### 3. Relay / Feed Scope Domain

Shared logic for relay selection, routeable feed scope, and visibility rules.

Owns:

- relay scope resolution
- relay selection policies for submission
- selected relay visibility rules
- channel pinning by relay scope
- frontends asking “what is visible in this scope?”

### 4. User Preference / Filter Domain

Shared, frontend-agnostic preferences and filters.

Owns:

- saved filter snapshots
- channel/person filter state
- publish-delay preference
- completion feedback preference
- pinned channel preferences

This should likely converge into a more coherent preference layer rather than many small `loadX` / `saveX` modules.

## Application-Layer Controllers To Aim For

These are not globally reusable domain modules. They are frontend-specific assemblies.

### Feed Page Controller

Replaces `Index.tsx` as the main feed frontend assembly layer.

Owns:

- route/view state composition
- task status interactions
- task publish interactions
- view-ready projections for tree/feed/list/calendar/kanban

### Marketplace Controller

Consumes the shared listing domain but projects into:

- searchable listing cards
- price/location/status filters
- seller-centric actions

### Listings Map Controller

Consumes the shared listing domain but projects into:

- marker models
- viewport/cluster-ready listing results
- listing preview side panel data

### Social Feed Controller

Consumes the shared content graph but projects into:

- author-centric timeline cards
- reply threads
- engagement-oriented feed ordering

## Projection Layer

To support multiple frontends cleanly, define projections explicitly instead of reusing `Task` everywhere.

Examples:

- `FeedEntryViewModel`
- `ListingCardViewModel`
- `ListingMarkerViewModel`
- `TimelinePostViewModel`
- `SidebarChannelViewModel`

The point is:

- domain entities stay canonical
- each frontend consumes a projection tailored to its UI
- different UIs stop fighting over one catch-all entity shape

Further steer:

- stop treating `Task` as the universal frontend entity
- introduce a canonical content model, then project to:
  - feed entries
  - listing cards
  - listing markers
  - social timeline posts

This is one of the most important changes if map/marketplace/social frontends are real goals.

## Anti-Corruption Layer

Create an explicit seam between Nostr wire events and the app’s canonical content model.

Target shape:

```text
Nostr event -> infrastructure mapping -> canonical domain entity -> frontend projection
```

Why:

- map frontend should not care about raw Nostr tags
- marketplace frontend should not need feed-specific task shaping
- social frontend should not inherit tree/task assumptions accidentally

Without this seam, alternate frontends will keep importing feed-era assumptions.

## Recommended Implementation Order

### Milestone 1: Establish `domain/content` and move pure derivation logic

Move pure functions first.
No React.
No route logic.
No toasts.

Target extractions:

- task merge/dedupe
- optimistic overlay application helpers
- content filtering inputs
- channel derivation helpers
- sidebar people derivation
- canonical content entity and projection inputs

### Milestone 2: Establish `domain/listings`

Move listing-specific pure logic out of page/controller code.

Target:

- listing identity
- listing projections
- listing status rules
- location/geohash listing helpers

### Milestone 3: Build a real `feed-page` controller layer

Consolidate the current page-specific hooks under one feature assembly boundary.

Likely shape:

```text
src/features/feed-page/controllers/
  use-feed-page-controller.ts
  use-feed-page-status.ts
  use-feed-page-sidebar.ts
```

The current small hooks can either remain internal or be absorbed.

Do not keep adding new root-level `src/hooks/use-index-*` files once this starts.

### Milestone 4: Reduce `Index.tsx` to route wiring + layout composition

At this point `Index.tsx` should mostly:

- read route params
- instantiate the feed page controller
- render desktop/mobile layouts

### Milestone 5: Prototype second frontend on shared domain

Do not wait forever to validate the architecture.
Build one small second frontend to prove the seam.

Best candidate:

- listings map

Reason:

- it stresses location projections
- it reuses listings and relay scope
- it forces clearer separation from the current feed UI

## What To Avoid

- more tiny page-specific hooks as the main strategy
- a full-package split before shared seams are proven
- pushing toasts/navigation into pure logic
- letting every frontend mutate the same giant `Task` shape directly
- creating a “common” folder with mixed concerns and no dependency rules
- letting `src/domain` become a renamed `src/lib`
- extracting an internal package before a second frontend proves the boundary

## Reusability Assessment Of Current Extractions

### Stronger Reuse Potential

- feed navigation logic
- publish controls
- completion cheer utility

### Mostly Feed-Page Internal

- index filters
- index onboarding
- task publish flow

That is fine, but it means the next step should be stronger domain extraction, not more hook splitting.

## Possible Future Internal Library Boundary

Only after the shared domain is proven across two frontends, consider an internal package boundary such as:

```text
packages/
  nodex-domain/
  nodex-nostr/
```

Do not do this yet.

First prove reuse inside `src/domain` and `src/features`.

## Further Sensible Steers

### 1. Add `src/app` as a top-level composition layer

Use `src/app` for:

- providers
- router setup
- global wiring

This keeps `features` from becoming the new dumping ground for app bootstrap concerns.

### 2. Prefer feature folders over cross-cutting hook folders for page logic

Example:

```text
src/features/feed-page/controllers/use-task-status-controller.ts
```

is better than:

```text
src/hooks/use-task-status-controller.ts
```

when the logic is still feed-page-specific.

### 3. Write one short architecture note before moving lots of files

Even a lightweight ADR is enough:

- what goes in `domain`
- what goes in `infrastructure`
- what stays feature-local
- dependency direction

This will prevent `domain` from becoming a semantic junk drawer.

### 4. Validate the architecture with one second frontend early

Best proof target remains a listing map, because it forces:

- location projection
- listing-centric rendering
- less dependence on task tree assumptions

### 5. Delay package extraction

Only consider `packages/nodex-domain` or similar after:

- two frontends consume the shared domain
- imports are already stable inside the monorepo tree
- infrastructure boundaries are clear

## Success Criteria

- alternate frontends can be built without importing `Index.tsx` logic
- feed/map/marketplace/social frontends reuse the same domain rules
- pure business logic is testable without React
- `Index.tsx` becomes one frontend adapter, not the app’s implicit domain center

## Best Next Step

Do not start with another `Index` micro-extraction.

Start by carving out `src/domain/content` with the current pure derivation logic, then align the remaining `Index` split work around that boundary.
