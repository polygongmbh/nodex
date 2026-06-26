# Failed-publish drafts: rebuild from composer content + Edit-in-composer

Status: **planned, not started** (designed 2026-06-27). Greenfield for a fresh session.

## Context / why

A `FailedPublishDraft` is the localStorage recovery entry written when a publish
fails; the user retries/reposts it from `FailedPublishQueueBanner`. Today the draft
redundantly stores **both** the full composer content **and** a pre-built wire
payload (`publishKind` / `publishTags` / `publishParentId`).

The bug: retry/repost only re-publish the stored `publishTags` **verbatim** and
never read the composer fields, so `mentionPubkeys`, `assigneePubkeys`, `nip99`,
`attachments`, `priority`, `titledPost`, `locationGeohash`, `recomposeOf`,
`postType`, `parentId`, `createdAt` are **persisted but unused**. Commit
`f5e977ae8` widened the draft to "be serialized composer content" but never
rewired retry to consume it — a half-finished refactor, with now-false comments
(e.g. `WireTagging` claims `assigneePubkeys` exists "so the retry path can re-emit
verbatim" — it doesn't).

### Decisions (confirmed with the user)
- **Composer content is the single source of truth.** Retry/repost REBUILD the
  event from the stored composer content via one shared payload builder that the
  initial publish also uses. Drop the redundant `publishKind`/`publishTags`/`publishParentId`.
- **Add an "Edit" action** to the banner that restores a failed draft into the
  composer (reuse the existing `ComposeRestoreRequest` path) so the user can fix
  and resend.
- **Drop incompatible old drafts** (failed drafts are transient recovery state):
  bump the storage key to `…v2`, fully use `SerializedComposerContent` so
  `attachments` is required again (remove the `Omit<…,"attachments">` widening).
- **Collapse `mentionPubkeys` / `assigneePubkeys`.** At
  `use-task-publish-flow.ts:439-441`, `assigneePubkeys = Array.from(new Set(mentionPubkeys))`
  for tasks and `undefined` otherwise; both only emit `p` tags. The distinction is
  valueless on the wire — store one `mentionPubkeys` and p-tag it for every kind.
  (The live `TaskPost.assigneePubkeys`, derived from `p` tags on ingest, is a
  separate concern and stays untouched.)

## Verified facts (file:line anchors, gathered during planning)

- Draft type + zod schema: `src/infrastructure/preferences/failed-publish-drafts-storage.ts`
  (type `:25-40`, schema `:71-109`). Key in `storage-registry.ts` (`FAILED_PUBLISH_DRAFTS_STORAGE_KEY`).
- Retry/repost read only `draft.publishKind/content/publishTags/publishParentId`
  (`use-task-publish-flow.ts:879-885`) + `draft.dates`/`draft.initialState` for
  follow-ups (`:901-918`). Banner reads `draft.content`/`draft.tags` (`FailedPublishQueueBanner.tsx:123-125`)
  and `relayIds`/`relayUrls` for relay gating (`:37-40`).
- Payload-building branch (move this into the shared builder):
  `use-task-publish-flow.ts:469-533` — `eventBuilt` → `publishKind` → `validParentId`
  → `primaryRelayUrl` → `publishTags` (4-way branch by postType) → `publishParentId`.
  Calendar-time derivation at `:339-344`. All tag builders are **synchronous**:
  `buildStandaloneCalendarEvent` (`infrastructure/nostr/nip52-task-calendar-events.ts`),
  `buildTaskPublishTags` (`infrastructure/nostr/task-publish-tags.ts`),
  `buildNip99PublishTags` (`infrastructure/nostr/nip99-metadata.ts`),
  `buildImetaTag` (`lib/attachments.ts`).
- The publish flow ALREADY assembles a `composeRestoreState: ComposerDraft`
  (`:665-677`) — the exact editable state the Edit action needs.
- Restore pipeline is fully wired: hook exposes `composeRestoreRequest`/
  `onComposeRestoreRequestConsumed` → `Index.tsx:633-637` → `composer-signals-store`
  → `TaskCreateComposer.tsx:55-56` + `UnifiedBottomBar.tsx:71` (`useComposeRestoreSignal`)
  → `TaskComposer.tsx:529-568` applies it. **The composer restore effect ignores
  `selectedRelays`** — recompose restores relays separately via
  `useFilterStore.getState().setActiveRelayIds(...)` (`:1055-1061`); the Edit handler
  must do the same.
- `taskCommands` assembled in `Index.tsx:707-732`, typed by `FeedTaskCommands`
  (`feed-task-commands-context.tsx:12-28`), dispatched in `FeedPageProviders.tsx:197-218`
  from intents in `feed-interaction-intent.ts:78-81`.
- `mentionPubkeys`/`assigneePubkeys` derivation: `use-task-publish-flow.ts:425-441`
  (`assigneePubkeys` is just a deduped copy of `mentionPubkeys`).
- Types: `ComposerContent`/`SerializedComposerContent`/`DraftTagging`/`SubmitTagging`/
  `WireTagging`/`SerializedTaskDate` in `src/types/composer-base.ts`;
  `ComposerDraft`/`ComposeRestoreRequest` re-exported from `src/types/index.ts`.
  `ComposerContent.attachments: PublishedAttachment[]` is **required**.

## Implementation

### New `FailedPublishDraft` shape (`failed-publish-drafts-storage.ts`)
```ts
export type FailedPublishDraft = SerializedComposerContent & {
  id: string;
  tags: string[];            // resolved submission tags (channels + hashtags)
  mentionPubkeys: string[];  // resolved p-tag pubkeys (mentions == assignees)
  relayIds: string[];
  relayUrls: string[];
  parentId?: string;         // comment parent (rebuild + threading)
  initialState?: TaskState;  // task follow-ups
};
```
- Drop `publishKind`/`publishTags`/`publishParentId` (rebuilt), `createdAt` (never
  read), `assigneePubkeys` (== mentionPubkeys), and the `FailedPublishContent`
  Omit/widen. `SerializedComposerContent` supplies content/postType/dates/priority?/
  attachments/titledPost?/nip99?/locationGeohash?/recomposeOf?.
- Simplify `WireTagging` to `{ tags; mentionPubkeys }` (drop `assigneePubkeys`) — it
  is only used by this draft — or inline the two fields and delete the type.
- New zod schema: `attachments` **required**; drop removed fields. Old/malformed
  entries → the store `merge` (`failed-publish-drafts-store.ts:35-43`) `safeParse`
  falls back to `[]` (clean cut). Bump `FAILED_PUBLISH_DRAFTS_STORAGE_KEY` → `…v2`.

### Shared builder — new `src/infrastructure/nostr/build-publish-payload.ts`
`buildPublishPayload(input) → { kind, content, tags, parentId }`, moving
`use-task-publish-flow.ts:469-533` + `:339-344` (`deriveCalendarTimes`). Inputs:
already-resolved composer content + single `mentionPubkeys` + `primaryRelayUrl`.
For tasks, pass `mentionPubkeys` as the assignee/p-tag list to `buildTaskPublishTags`.
`handleNewTask` calls it (behavior-preserving); `buildPost` reuses `deriveCalendarTimes`
for its calendar locals.

### Retry/repost rebuild (`publishFailedDraft`, `:865-932`)
Extract `rehydrateSerializedDates(dates) → TaskDate[]` (currently inline `:901-909`);
hoist it above the build; call `buildPublishPayload({ ...draft, parentId: draft.parentId,
primaryRelayUrl: relayUrls[0] ?? "" })`; publish rebuilt `{kind, content, tags,
parentId}`; follow-ups with the rebuilt `kind`. Retry vs repost still differ only by
relay resolver. Bonus: repost now recomputes the parent `e`-tag relay hint for the
new relay set. Optionally replay `recomposeOf` deletion on success (latent gap —
`publishRecomposeDeletion` is only called at `:790`/`:832`).

### Edit-in-composer
- Intent `{ type: "publish.failed.edit"; draftId }` (`feed-interaction-intent.ts`).
- `FeedTaskCommands.editFailedPublish(draftId)` + default (`feed-task-commands-context.tsx`).
- `handleEditFailedPublish` (model on `handleRecomposeTask` `:1014-1089`): build a
  `ComposerDraft` from the draft — `explicitTagNames` = `tags` minus inline hashtags
  (mirror `:1042-1045` with `extractHashtagsFromContent`); `explicitMentionPubkeys ←
  mentionPubkeys`; `priority` via `displayPriorityFromStored`; carry attachments/
  titledPost/nip99/dates/locationGeohash/recomposeOf/selectedRelays — restore relays
  via `useFilterStore.getState().setActiveRelayIds(...)`, `setComposeRestoreRequest({id, state})`,
  then discard the draft immediately.
- Wire through `Index.tsx` (binding + deps) and `FeedPageProviders.tsx`
  (`"publish.failed.edit"` handler). Add an "Edit" button (lucide `Pencil`,
  `data-testid="failed-publish-edit"`, always enabled) to `FailedPublishQueueBanner.tsx`
  + i18n keys in every `src/locales/*/composer.json`.

### Commit sequence (each compiles + tests green)
1. **Extract** `buildPublishPayload` / `deriveCalendarTimes`; rewire `handleNewTask`.
   Behavior-preserving — existing publish-flow tests must pass unchanged.
2. **Rewire** retry/repost to rebuild from the draft (+ optional recompose-deletion replay).
3. **Edit action** end-to-end (intent / command / handler / banner / i18n).
4. **Tighten schema**: new flat type, `attachments` required, drop publish/assignee/
   createdAt fields, simplify `buildFailedPublishDraft()` (no publish args), bump key
   → `…v2`; update fixtures + add rebuild / edit / malformed-drop tests.

## Critical files
- `src/features/feed-page/controllers/use-task-publish-flow.ts` — builder extraction, retry rebuild, edit handler
- `src/infrastructure/nostr/build-publish-payload.ts` — **new** shared builder
- `src/infrastructure/preferences/failed-publish-drafts-storage.ts`, `src/infrastructure/preferences/storage-registry.ts`, `src/types/composer-base.ts` — type / schema / key / WireTagging
- `src/components/tasks/FailedPublishQueueBanner.tsx`, `src/features/feed-page/interactions/feed-interaction-intent.ts`, `src/features/feed-page/controllers/feed-task-commands-context.tsx`, `src/pages/Index.tsx`, `src/features/feed-page/views/FeedPageProviders.tsx` — Edit wiring
- Tests: `use-task-publish-flow.test.tsx`, `failed-publish-drafts-store.test.ts`, `FailedPublishQueueBanner.test.tsx`

## Risks
- **Calendar `d` tag and NIP-99 `identifier`/`published_at` are time/random-seeded**
  in their builders (`nip52-task-calendar-events.ts:343`, `nip99-metadata.ts:59/67`),
  so a rebuilt event differs from the original. The original never landed (it failed)
  → no replaceable-event collision; accept + document, or derive `d` from `draft.id`
  for determinism. **Verify** the listing `nip99.identifier`/`publishedAt` actually
  persist on the draft; if the original used a generated identifier it was never
  persisted — capture it at draft-build time if listing-retry fidelity matters.
- **Commit 1 must be byte-identical** to today's publish output — guard by diffing
  `publishEvent` args (dev-log `tagCount`/tags) before/after for each post type.

## Follow-ups to consider (not in scope, note for later)
- **`recomposeOf` deletion on retry**: currently a failed recompose never re-issues
  the original-event deletion on retry. Decide whether retry should replay it.
- **`assigneePubkeys` as a first-class concept**: this plan only collapses it on the
  wire/draft. The composer never lets you pick assignees distinctly from mentions
  (they're the same @-mention set); a future cleanup could drop the `assigneePubkeys`
  local var in `handleNewTask` and source `TaskPost.assigneePubkeys`/`buildTaskPublishTags`
  directly from `mentionPubkeys`.
- **Unify draft-vs-failed persistence**: the autosave composer draft
  (`task-composer-runtime.ts` `serializeDraft` → `PersistedComposerDraft`) and the
  failed-publish draft are two near-identical serialized-composer shapes. Once this
  lands they could share a single serialize/restore helper.
- **Edit discard timing**: this plan discards on Edit-open. If "edit but keep on
  cancel" is wanted, thread a signal from composer-cancel back to re-add the draft.

## Verification
- `npx tsc -b` — `attachments`-required + dropped fields surface every stale reader (only the known files).
- `npx vitest run` on the three test files; add: retry rebuild (rebuilt tags +
  parent `e`-tag relay hint reflects the retry relay set), calendar-event retry
  (fresh kind 31922/31923 from stored `dates`), edit-restore (ComposerDraft content/
  tags/mentions/attachments/dates correct + draft removed), malformed-entry → empty queue.
- Manual: publish each post type (identical wire output post-Commit-1); force a
  failure → Retry/Repost (rebuilt event publishes; repost hint reflects new relays);
  Edit (composer populates, sidebar relays switch, banner entry clears); confirm old
  key ignored and a malformed `…v2` array yields an empty queue.
