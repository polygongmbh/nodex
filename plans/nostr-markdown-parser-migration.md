# Plan: Exhaustive Nostr Parsing + Markdown Parser Migration

## Goal
Replace scattered regex-based content parsing with a unified markdown parsing pipeline and deeper use of `nostr-tools` + NDK primitives, while preserving current Nodex behavior and NIP-compliant event/tag handling.

## Opinionated Direction
- Use a **single canonical content-analysis layer** that returns:
  - renderable markdown AST output
  - normalized hashtags/mentions/URLs/media refs
  - normalized Nostr references (`npub`, `note`, `nevent`, `naddr`, `nostr:` URIs, indexed refs)
- Keep Nostr tag authority in one place (publish + inbound conversion share the same parser utilities).
- Adopt **`react-markdown` + `remark-gfm` + `rehype-sanitize`** as the default markdown pipeline (incremental complexity, safe rendering, easy React integration).
- Use `nostr-tools` decoding utilities for Nostr references and route publishing through a shared tag-builder utility consumed by current NDK publish flow.

## Scope
- Rendering: replace regex markdown parsing in `src/lib/linkify.tsx` with markdown AST rendering where possible.
- Content extraction: centralize hashtag/mention/Nostr-ref extraction currently spread across:
  - `src/lib/hashtags.ts`
  - `src/lib/mentions.ts`
  - `src/infrastructure/nostr/task-converter.ts`
  - `src/infrastructure/nostr/provider/use-publish.ts`
  - `src/features/feed-page/controllers/use-task-publish-flow.ts`
- Protocol mapping: improve conversion for indexed refs and bech32 references using `nostr-tools` helpers.

## Non-Goals
- Full WYSIWYG editor.
- Rich markdown block feature parity in one pass (tables/task lists can land later if not currently needed).
- Rewriting all task UI components in a single commit.

## Milestone Plan

### Milestone 1: Inventory + Contract Definition
1. Create `content-parser` interfaces in `src/lib/content-parser/types.ts`:
   - `ParsedContent`
   - `ParsedNostrRefs`
   - `ParsedRichSegments`
2. Define canonical extraction contract:
   - hashtags (case-normalized)
   - mention identifiers + resolved pubkeys
   - standalone embeddable URLs
   - markdown-safe render tree
   - nostr references from content and tags
3. Add tests that lock current behavior before refactor (especially hashtag/mention edge cases).

Acceptance:
- A golden test suite captures existing behavior in linkify/hashtags/mentions/task-converter publish mapping.

### Milestone 2: Introduce Markdown Pipeline (Render Path)
1. Add deps:
   - `react-markdown`
   - `remark-gfm`
   - `rehype-sanitize`
2. Implement `renderParsedContent()` in `src/lib/content-parser/render.tsx`.
3. Port current custom behaviors:
   - clickable hashtags
   - mention rendering/click actions
   - standalone media embeds
   - safe external links
4. Switch primary task content rendering callsites (`TaskItem`, `FeedView`, `KanbanView`, `CalendarView`) to the new renderer.

Acceptance:
- UI snapshots not required; behavior tests cover click interactions and embed behavior.
- `linkify.tsx` either becomes a thin adapter or is deprecated.

### Milestone 3: Centralize Extraction + Nostr Refs
1. Implement `parseContentEntities()` in `src/lib/content-parser/extract.ts`.
2. Use `nostr-tools` decode helpers for:
   - bech32 refs (`npub`, `note`, `nevent`, `naddr`)
   - `nostr:` URI forms
3. Consolidate indexed mention handling (`#[i]`) into one utility consumed by both ingest and render layers.
4. Replace direct regex extraction callsites with parser outputs:
   - composer chips
   - compose submit validation
   - compose restore state
   - task converter content tag extraction

Acceptance:
- No duplicate hashtag/mention regex in publish/converter/composer paths.
- Existing tests pass; add new tests for bech32 + `nostr:` references.

### Milestone 4: Publish Tag Builder Unification
1. Add `buildPublishTagsFromParsedContent(parsed, existingTags, context)` in `src/infrastructure/nostr/tag-builder.ts`.
2. Route both `use-publish.ts` and NDK provider publish path through this builder.
3. Ensure NIP alignment for tag forms (`t`, `p`, `e`, `a` and contextual markers where needed).

Acceptance:
- Identical publish tag behavior across both publish paths.
- No local regex hashtag extraction during publish.

### Milestone 5: Inbound Converter Alignment
1. Refactor `task-converter.ts` to consume shared parser utilities for content entities.
2. Preserve current behavior around spam, attachments, due/status tags, and permission logic.
3. Improve mapping coverage for content-level Nostr references into structured mentions/references.

Acceptance:
- Converter tests pass with equal or better coverage.
- Added tests for indexed refs + bech32 references.

### Milestone 6: Cleanup + Hardening
1. Remove dead regex helpers superseded by parser abstractions.
2. Keep backwards-compatible adapters only where migration risk is high.
3. Add perf smoke test on long content payloads.
4. Add debug/dev logs for parser diagnostics (guarded in production per existing policy).

Acceptance:
- Lint/test/build green.
- No new user-facing regressions in compose/render/publish flows.

## Testing Strategy
- Test-first for logic migrations.
- Required checks by risk profile (this is major/cross-view/protocol-sensitive):
  - `npm run lint`
  - `npx vitest run`
  - `npm run build`
- Add focused suites:
  - markdown rendering interactions
  - Nostr reference extraction/decoding
  - publish tag generation from parsed content
  - converter parity tests

## Rollout Strategy
- Ship behind incremental internal feature flags if needed (`useMarkdownParserV2`, `useUnifiedTagBuilder`) but default-on once parity is verified.
- Migrate in small commits per milestone to simplify regression triage.

## Risks + Mitigations
- Risk: markdown rendering changes visual output.
  - Mitigation: parity tests for current supported formatting + staged rollout.
- Risk: mention/tag extraction drift affects permissions/filtering.
  - Mitigation: golden tests around composer and `task-permissions` behavior.
- Risk: publish tag differences across code paths.
  - Mitigation: single tag-builder utility and shared tests for both publish entry points.

## Deliverables
- New shared parser module(s):
  - `src/lib/content-parser/*`
  - `src/infrastructure/nostr/tag-builder.ts`
- Updated callsites in composer/task views/publish/converter.
- Expanded tests covering markdown + nostr refs + tag generation parity.
