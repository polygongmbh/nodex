# Plan: Tighten Relay URL To Required

## Goal

Make `Relay.url` required in the app model so relay objects consistently represent concrete relay endpoints, then remove the defensive branches and test fixtures that still assume URL-less relays.

## Current State

- `Relay.url` is still optional in [`src/types/index.ts`](/Users/tj/IT/nostr/nodex/src/types/index.ts).
- Production relay construction now supplies a URL for both NDK relays and the demo relay in [`src/pages/Index.tsx`](/Users/tj/IT/nostr/nodex/src/pages/Index.tsx).
- Several runtime paths still carry `relay.url` guards, fallbacks, or narrowing helpers that exist mainly because the shared type allows `undefined`.
- A non-trivial number of tests and shared fixtures still construct `Relay` values without `url`.

## Opinionated Path

Treat missing relay URLs as invalid app-model data, not as a normal variant.

That means:
- require `url` on `Relay`
- keep any explicit `demo` special-casing that is semantic, not structural
- remove fallback code that only exists to tolerate missing URLs
- update tests/fixtures to always provide a concrete URL

This is the cleanest path because the live app already behaves as though relays are URL-backed entities.

## Scope

### In scope

- Tighten the `Relay` type to `url: string`
- Update shared relay fixtures/builders
- Simplify runtime guards that only defend against `undefined` URLs
- Run focused test updates where compile errors or behavior changes surface

### Out of scope

- Renaming relay IDs or changing relay identity semantics
- Removing `demo` relay behavior
- Broad relay-management UX changes

## Execution Plan

### Phase 1: Tighten the type contract

Files:
- [`src/types/index.ts`](/Users/tj/IT/nostr/nodex/src/types/index.ts)

Actions:
- Change `Relay.url?: string` to `Relay.url: string`
- Let TypeScript expose every caller that still depends on optionality

Reasoning:
- This should be the first edit so the compiler drives the rest of the migration instead of chasing references manually.

### Phase 2: Normalize test fixtures and obvious constructors

Files likely affected:
- [`src/test/fixtures.ts`](/Users/tj/IT/nostr/nodex/src/test/fixtures.ts)
- relay literals in component/controller tests

Actions:
- Give `makeRelay()` a stable default URL
- Update inline `Relay` test objects that omit `url`
- Prefer realistic `wss://...` values instead of placeholder empty strings

Reasoning:
- Most fallout appears to be test-only.
- Fixing the shared builder first should collapse a large amount of compile noise.

### Phase 3: Remove runtime branches that only exist for optional URLs

Primary candidates:
- [`src/components/layout/sidebar/RelayItem.tsx`](/Users/tj/IT/nostr/nodex/src/components/layout/sidebar/RelayItem.tsx)
- [`src/features/feed-page/controllers/use-relay-selection-controller.ts`](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-relay-selection-controller.ts)
- [`src/features/feed-page/controllers/use-relay-auto-reconnect.ts`](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-relay-auto-reconnect.ts)
- [`src/lib/nostr/relay-write-targets.ts`](/Users/tj/IT/nostr/nodex/src/lib/nostr/relay-write-targets.ts)
- [`src/infrastructure/nostr/relay-url.ts`](/Users/tj/IT/nostr/nodex/src/infrastructure/nostr/relay-url.ts)

Actions:
- Replace `relay.url ? ... : ...` display fallbacks with direct URL-derived behavior where appropriate
- Remove `Boolean(relay.url)` and `relay.url ?? ""` patterns when they are only satisfying the old type
- Keep guards that represent real domain rules, such as excluding the demo relay from write/reconnect behavior

Reasoning:
- Some guards are still semantically useful; for example, demo-relay exclusion is real behavior.
- The cleanup should distinguish between “not a writable relay” and “might not have a URL”.

### Phase 4: Recheck persistence and provider code for redundant optional handling

Primary candidates:
- [`src/features/feed-page/controllers/use-index-relay-shell.ts`](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-index-relay-shell.ts)
- [`src/infrastructure/nostr/provider/ndk-provider.tsx`](/Users/tj/IT/nostr/nodex/src/infrastructure/nostr/provider/ndk-provider.tsx)
- [`src/infrastructure/nostr/provider/use-auth-actions.ts`](/Users/tj/IT/nostr/nodex/src/infrastructure/nostr/provider/use-auth-actions.ts)
- [`src/infrastructure/nostr/provider/use-publish.ts`](/Users/tj/IT/nostr/nodex/src/infrastructure/nostr/provider/use-publish.ts)

Actions:
- Remove any now-redundant optional chaining or fallback arrays around relay URLs
- Confirm persistence helpers still normalize and dedupe correctly after the type change

Reasoning:
- These files already appear URL-centric, so changes should be small and mostly mechanical.

## Risks

- Some tests intentionally exercised URL-less relays as a defensive edge case; those assertions may need to be deleted rather than mechanically updated.
- A few UI fallbacks currently use `relay.name || relay.id` when no URL exists. Requiring URLs may justify simplifying display naming, but that should be verified against product intent before changing visible labels broadly.
- The repo likely contains more compile-time fallout than runtime behavior changes, so the main risk is noisy patch scope rather than user-facing regression.

## Commit Shape

1. `refactor: require urls on relay model`
- Type change
- shared fixture updates
- minimal runtime cleanup needed to compile

2. `test: remove url-less relay assumptions`
- targeted test expectation cleanup where cases were only defending the old model

If the diff stays small, these can collapse into one coherent commit.

## Verification Plan

Required baseline for this change category:
- focused tests for changed area

Recommended:
- `npm run build`

Practical execution order:
1. Run focused tests for relay controllers/helpers and touched components
2. Run `npm run build`
3. Expand to `npx vitest run` only if the type fallout spreads broadly enough that focused verification stops being credible

## Success Criteria

- `Relay` requires `url` at the type level
- App/runtime relay creation always satisfies that contract
- No production code branches remain that only exist to tolerate missing relay URLs
- Shared fixtures and touched tests stop constructing URL-less relays
- Verification passes for the touched surface
