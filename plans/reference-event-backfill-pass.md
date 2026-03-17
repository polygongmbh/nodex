# Reference Event Backfill Pass

## Status

- Do not implement this yet.
- First verify the observed behavior in practice with runtime diagnostics so we can confirm whether the old base task is coming from the initial broad subscription, relay-side replay behavior, or a path we have not yet identified.
- Revisit implementation only after that verification step produces concrete evidence.

## Current behavior

- Nodex currently does one broad initial read subscription in [src/hooks/use-nostr-event-cache.tsx](/Users/tj/IT/nodex/src/hooks/use-nostr-event-cache.tsx) using `subscribe([{ kinds: subscribedKinds }], ...)` and stores whatever arrives in the cache.
- There is no second-pass scan for missing `e`/`a` references after bootstrap, and no current code path that fetches referenced events on demand.
- The app uses NDK, not `rnostr`. NDK exposes `fetchEvent` and `fetchEventFromTag` in `node_modules/@nostr-dev-kit/ndk`, but Nodex does not call either from app code today.
- Old tasks can still show up in the feed because:
  - the original task event may already be present from the broad initial subscription, even if it is old
  - feed rendering emits both task entries and status-update entries; recent state updates become feed entries in [src/components/tasks/FeedView.tsx](/Users/tj/IT/nodex/src/components/tasks/FeedView.tsx)
  - `nostrEventsToTasks` applies state/property updates only when the target task already exists in the loaded task map in [src/lib/nostr/event-converter.ts](/Users/tj/IT/nodex/src/lib/nostr/event-converter.ts)

## Goal

After the initial relay fetch completes, run a lower-priority asynchronous pass that:

1. scans loaded events for referenced parents/targets
2. detects references whose base events are missing locally
3. attempts to fetch those missing events from likely relays
4. hydrates the cache without blocking initial feed render

## Immediate next step: verify first

- Add temporary diagnostics before any backfill implementation.
- Capture, for the suspicious old task and its related state event:
  - when each event first enters the app cache
  - which relay delivered it
  - whether it arrived during the initial broad subscription or later
  - whether the base task was already present before the status update was processed
- Suggested verification points:
  - [src/hooks/use-nostr-event-cache.tsx](/Users/tj/IT/nodex/src/hooks/use-nostr-event-cache.tsx)
  - [src/lib/nostr/event-converter.ts](/Users/tj/IT/nodex/src/lib/nostr/event-converter.ts)
  - [src/components/tasks/FeedView.tsx](/Users/tj/IT/nodex/src/components/tasks/FeedView.tsx)
- Only proceed with the implementation sections below if verification shows the app truly lacks the needed referenced-event fetch behavior.

## Proposed implementation

### 1. Add a reference discovery helper

- Create a helper in `src/lib/nostr/` to extract referenced event identifiers from cached events.
- Include:
  - `e` tags used for replies/parents
  - `e` tags used for property/state targets
  - optionally `a` tags if Nodex needs replaceable parent support soon
- Return both:
  - the referenced id/value
  - any relay hints present in the tag
  - the source event id for dedupe/debugging

### 2. Add a low-priority backfill runner to the event cache hook

- Extend [src/hooks/use-nostr-event-cache.tsx](/Users/tj/IT/nodex/src/hooks/use-nostr-event-cache.tsx) to start a post-bootstrap pass once `finalizeBootstrapScope()` runs.
- Schedule it with low priority:
  - `requestIdleCallback` when available
  - fallback to `setTimeout`
- Keep it separate from initial hydration so first paint/feed remains fast.

### 3. Fetch only missing references

- Build a set of known event ids from the current cache.
- Scan cached events and collect referenced ids not already present.
- Ignore:
  - ids already requested in this session
  - ids already known missing after a recent failed attempt
  - self-references / malformed ids

### 4. Use NDK fetch APIs explicitly

- Prefer a provider-level helper that wraps `ndk.fetchEvent` / `ndk.fetchEventFromTag` so the hook does not need direct NDK access.
- Suggested provider contract addition:
  - `fetchEventById(id: string, relayHints?: string[]): Promise<NDKEvent | null>`
- Fetch strategy:
  - first try explicit relay hints from tags when present
  - then fall back to NDK’s normal relay selection for `ids: [id]`
- Batch carefully; do not launch unbounded parallel requests.

### 5. Merge fetched events back into cache

- Reuse the existing `pushEvent` / `upsertCachedEvent` path so fetched events are normalized and deduped identically to subscribed events.
- If a fetched event introduces new missing references, allow one follow-up round, but cap recursion depth to avoid runaway graph walks.

### 6. Add debug logging and guardrails

- Add dev/debug logs for:
  - number of references scanned
  - number missing
  - number fetched
  - number still unresolved
- Add simple session-level limits:
  - max referenced ids scanned per pass
  - max fetch concurrency
  - cooldown for repeated misses

### 7. Verify behavior with tests

- Add focused tests for:
  - extracting reply/property target refs
  - detecting missing refs from cached event sets
  - scheduling only after bootstrap finalization
  - merging fetched referenced events into cache
  - not repeatedly fetching known-missing ids
- Recommended implementation-level verification if/when code is changed:
  - `npx vitest run src/hooks/use-nostr-event-cache.test.tsx src/lib/nostr/event-converter.test.ts`
  - `npm run build`

## Notes on the feed symptom

- The “very old event present because it has a recent status change” effect is consistent with current Nodex behavior without any hidden reference fetch:
  - the base task event exists in cache
  - a newer state update is attached to it
  - the feed renders that state update as a fresh entry
- If the base task event is truly absent, current `nostrEventsToTasks` logic will skip applying the state update because it requires the target task to already exist in `taskMap`.

## Open design choice

- Decide whether backfill should be:
  - `id-only`: fetch just directly referenced parents/targets
  - `shallow-thread`: fetch direct refs plus one additional hop
- Recommendation: start with `id-only` plus one optional follow-up pass after successful fetches.
