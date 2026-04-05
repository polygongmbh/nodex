# Plan: Post Deletion Semantically Correct via Nostr

## Current State

- `NostrEventKind.EventDeletion = 5` already exists in [src/lib/nostr/types.ts](/Users/tj/IT/nostr/nodex/src/lib/nostr/types.ts), but there is no delete-specific publish flow.
- Feed derivation in [src/features/feed-page/controllers/use-index-derived-data.ts](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-index-derived-data.ts) does not treat deletion events as first-class input.
- Task conversion in [src/infrastructure/nostr/task-converter.ts](/Users/tj/IT/nostr/nodex/src/infrastructure/nostr/task-converter.ts) applies status, due-date, and priority overlays, but no deletion overlay.
- Interaction intents and bus wiring have create, status, due-date, priority, and listing-status actions, but no post/task delete intent.
- The publish abstraction in [src/infrastructure/nostr/provider/use-publish.ts](/Users/tj/IT/nostr/nodex/src/infrastructure/nostr/provider/use-publish.ts) can publish arbitrary kinds, so deletion can be added without changing the transport boundary.

## Opinionated Direction

- Treat deletion as a Nostr event, not a local content mutation.
- Publish NIP-09 deletion events against the original event id instead of rewriting or locally “soft deleting” the task/post record.
- Apply deletion during event-to-view projection so deleted authored events disappear consistently across feed, tree, list, kanban, calendar, focused view, channel derivation, and reply counts.
- Keep deletion authorization strict: only honor deletion events when the deletion author matches the deleted event author.
- Use optimistic local suppression only as a UX bridge after successful submit or while pending confirmation; the durable source of truth remains the deletion event.

## Implementation Steps

### 1. Add a deletion domain helper

- Introduce a small deletion utility in `src/infrastructure/nostr/` or `src/domain/content/` that:
  - extracts referenced event ids from deletion events
  - validates whether a deletion event is allowed to remove a target event
  - chooses the latest effective deletion when duplicates/conflicts exist
- Keep this logic isolated so converter and feed derivation do not each reimplement NIP-09 rules.

### 2. Ingest deletion events into the app’s Nostr pipeline

- Ensure the subscription kinds in [src/pages/Index.tsx](/Users/tj/IT/nostr/nodex/src/pages/Index.tsx) include `NostrEventKind.EventDeletion`.
- Preserve deletion events in cached event data instead of filtering them out before projection.
- Add debug logging for deletion ingest in dev/debug builds only, matching repo logging policy.

### 3. Apply deletions during projection

- Extend [src/infrastructure/nostr/task-converter.ts](/Users/tj/IT/nostr/nodex/src/infrastructure/nostr/task-converter.ts) or the derivation layer around it so base content events are removed when a valid deletion event targets them.
- Apply deletion before downstream merges and channel extraction so deleted posts do not continue to:
  - appear in task lists
  - seed channels
  - contribute replies/counts
  - remain focusable via derived task collections
- Be explicit about scope:
  - root task deleted: remove the task and its visible representation
  - comment/reply deleted: remove only that reply event
  - non-existent target: ignore
  - unauthorized deletion: ignore

### 4. Add a publish helper for deletion events

- Add a dedicated delete publisher beside the existing status/due/priority helpers in [src/features/feed-page/controllers/use-task-publish-controls.ts](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-task-publish-controls.ts).
- Build deletion tags from the target event id and target relay context rather than abusing `parentId`.
- Route deletion publishes to the target event’s origin relay set first, following the same relay resolution rules already used for follow-up task updates.
- Return structured success/failure metadata so the UI can show success/error toasts and optimistically suppress pending-deleted content.

### 5. Add interaction intent and controller wiring

- Introduce a `task.delete` or `post.delete` interaction intent in [src/features/feed-page/interactions/feed-interaction-intent.ts](/Users/tj/IT/nostr/nodex/src/features/feed-page/interactions/feed-interaction-intent.ts).
- Wire it through [src/features/feed-page/controllers/use-index-feed-interaction-bus.ts](/Users/tj/IT/nostr/nodex/src/features/feed-page/controllers/use-index-feed-interaction-bus.ts).
- Implement the handler in the task publish flow/controller layer so permission checks, optimistic suppression, and toast handling stay centralized.

### 6. Add UI affordance only where deletion is actually allowed

- Add a delete action to the relevant task/post card menus instead of overloading the status control.
- Gate the action to authored Nostr-backed content only.
- Require confirmation before publish because deletion is semantically irreversible from the product’s point of view.
- Remove deleted items from the current view immediately after successful publish, and show a clear error toast if relay publish fails.

### 7. Local-state behavior

- For local-only drafts or still-pending unpublished items, keep the existing local removal path rather than creating a deletion event.
- For already-published Nostr events, do not remove only local state; publish deletion and suppress locally once accepted.
- Keep failed deletion attempts recoverable by not permanently stripping the item from local state until publish succeeds.

## Test Plan

- Add converter/domain tests covering:
  - valid author deletion removes target event
  - mismatched author deletion is ignored
  - deletion of reply removes reply only
  - deletion targeting unknown event is ignored
  - deletion does not leak deleted events into channel derivation
- Add controller tests covering:
  - delete intent publishes kind `5`
  - relay routing uses target event origin relay
  - success suppresses/removes visible item
  - failure keeps item visible and shows error handling
- Add focused UI tests for the delete action and confirmation flow.
- Verification target for implementation:
  - `npx vitest run`
  - `npm run build`
  - `npm run lint` recommended because this touches interaction/controller surfaces and protocol behavior

## Key Decisions

- Prefer removing deleted content from normal views instead of rendering tombstones for now.
  - Reason: the current app architecture derives concrete `Task` objects, and full tombstone UX would expand scope across every view.
- Treat deletion as content-level only in the first pass.
  - Reason: status/due/priority follow-up events can be ignored once the base event is deleted; they should not survive independently in UI.
- Keep delete permissions narrower than status updates if needed.
  - Reason: assignee-based status updates make sense, but destructive deletion should default to creator-only unless a stronger product requirement exists.

## Risks / Open Questions

- `canUserUpdateTask` currently allows assignees to update tasks. Deletion should likely not reuse that permission model as-is.
- Some relays may require additional deletion tags or relay-specific behavior. Implementation should verify against the relevant NIP and relay interoperability during coding, not assume current memory is complete.
- If the product wants visible tombstones in focused threads, that should be a separate follow-up after semantic deletion is correct end-to-end.
