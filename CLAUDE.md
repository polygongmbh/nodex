# CLAUDE.md

## Commands

```sh
npm run dev          # Start dev server on port 8080
npm run build        # Production build
npm run build:dev    # Development build
npm run lint         # Run ESLint
npx vitest           # Run all tests
npx vitest run src/path/to/file.test.ts  # Run a single test file
npx vitest --reporter=verbose  # Run tests with detailed output
```

## Architecture

**Nodex** is a Nostr-native task and discussion app. It publishes tasks and comments as Nostr events to WebSocket relays with multiple views and context-oriented filtering.

### Provider Layer (`src/lib/nostr/provider/`)
The `NDKProvider` (wrapped as `<NDKProvider>` in `App.tsx`) is the central hub. It manages:
- NDK instance and WebSocket relay connections (NIP-42 auth, relay status tracking)
- User authentication: NIP-07 browser extension, NIP-46 remote signer, or private key
- Session persistence via `localStorage` (see `storage.ts`)
- Subscriptions to Nostr events (tasks, profiles, presence)

The `useNDK()` hook exposes the entire app state: authenticated user, relay list, raw Nostr events, publish functions, and filter/channel state.

### Data Flow
1. Raw `NostrEvent` objects arrive via NDK subscriptions
2. `event-converter.ts` (`nostrEventsToTasks`, `mergeTasks`) transforms them into app-level `Task` and `Person` objects
3. `Index.tsx` is the top-level orchestrator — it holds all filter state, derived task lists, and passes handlers down
4. Task status changes are published as separate state events (kinds 1630–1633) via `task-state-events.ts`
5. Failed publishes are persisted to localStorage via `failed-publish-drafts.ts` and retried

### Key Types (`src/types/index.ts`)
- `Task` — core task entity with id, content, status, tags, relayIds, parentId, dates
- `TaskStatus` — `"open" | "active" | "done" | "closed"`, driven by `task-state-config.ts` registry
- `Person` — Nostr profile with online/presence status
- `Channel` — hashtag-based filter with `included | excluded | neutral` state
- `Relay` — relay connection with status

### Views & Routing
Routes are `/:view` and `/:view/:taskId`. Views (left-to-right in nav): `home` (desktop-only), `status`, `feed`, `tree`, `kanban`, `list`, `calendar`. The canonical order is `VIEW_ORDER` in `src/components/tasks/ViewSwitcher.tsx`; both the URL validator and the keyboard cycler derive from it — do not duplicate. `Index.tsx` renders the appropriate view component via `ViewSwitcher`. `/` redirects to `/home` on desktop and `/status` on mobile.

### Context
The user's **context** is the full current slice of content: sidebar filters (active relays, included/excluded channels, selected people, quick filters, search query) **plus** the currently focused task. Every view-level helper consumes the context — there is no separate "unfocused" mode. The only places that intentionally ignore the focused task (e.g. sidebar list rendering, composer default content) should call that out inline.

### Component Structure
- `src/components/tasks/` — view components (`TaskTree`, `ListView`, `KanbanView`, `CalendarView`, `FeedView`) and task display (`TaskItem`, `TaskComposer`)
- `src/components/layout/` — `Sidebar` with channel/relay/person filters, `SidebarHeader`
- `src/components/mobile/` — `MobileLayout`, `MobileNav`, mobile-specific bottom bars
- `src/components/auth/` — `NostrAuthModal`, `NostrUserMenu`
- `src/components/onboarding/` — onboarding flow (steps, sections, guide)
- `src/components/ui/` — shadcn/ui primitives, do not modify directly

### Path Alias
`@/` maps to `src/`. All imports use this alias.

### Testing
Tests use Vitest + jsdom + `@testing-library/react`.
Setup file is `src/test/setup.ts` (mocks `localStorage`, `matchMedia`, `WebSocket`).
Test fixtures are in `src/test/fixtures.ts`.
Tests live alongside source files as `*.test.ts(x)`.

Write tests for behavior change. 
Prefer behavior/outcome tests over implementation-detail tests.
Snapshot tests are disallowed for complex UI unless narrowly scoped and justified inline.

## Shell Commands

- Prefer Bash commands whose leading token is auto-allowed (e.g. `grep`, `find`, `git`, `npx vitest`, `npx tsc`) over complex scripts that require extra permission prompts.
- Use the `Write` tool instead of `cat > /tmp/script << 'EOF'` heredocs — heredocs trigger a shell-parser bug ("Unhandled node type: string") that bypasses the allowlist.
- For cross-cutting symbol renames across many files, use `jscodeshift` with an inline transform rather than `sed -i` or ad-hoc Python scripts; it handles AST-level renames safely and avoids regex edge cases.

  ```sh
  npx jscodeshift -t <transform-file-or-inline> src/**/*.{ts,tsx}
  ```

## Workflow

- Before any larger change (major feature, cross-view UI change, broad refactor, or release prep), run `git pull --rebase --autostash` and warn if there are multiple unrelated changed files.
- Use Conventional Commits: `feat:`, `fix:`, `enhance:`, `refactor:`, `test:`, `docs:`, `chore:`
- After each self-contained change, commit — for multi-step tasks **and especially big refactors**, commit incrementally at each natural checkpoint (e.g. "store field added", "consumers switched", "Index unwound", "tests updated") rather than batching everything into a single end-of-task commit
- Prefer `git commit -m "..." <explicit file list>` over `git add ...` + `git commit`
- After finishing work, concisely report added/removed line counts split into production code, test code, and other changes (e.g. documentation or build files).
- Amend the immediately previous local commit when the change is a direct fixup of it; use a new commit otherwise.

When the user says `squash`, inspect recent unpushed commits and suggest sensible squashes for fixups or tightly related follow-ups; list candidates with original and target messages before executing anything.

### Changelog
- Keep `CHANGELOG.md` updated; add user-visible changes to `## [Unreleased]` as you go
- Use `### Added` for new capabilities, `### Changed` for enhancements and changes, `### Fixed` for regressions; omit subheadings when fewer than 4 bullets in a version
- Do not add entries for minor/internal-only changes

### Logging and Toasts
- Use `console.warn`/`console.error` for actionable issues
- New user-facing features must include debug logs enabled by default in dev builds
- Use toasts for significant user-facing outcomes; avoid duplicate/spammy toasts for the same event

## Code Standards & Refactor Policy
- Max 300 lines per file — split at natural boundaries if exceeded
- One component per file; index files export only, no logic
- Before making substantial changes to a file, clean it up appropriately
- Never replicate patterns from legacy files without flagging them
- Do NOT touch files outside the current task scope
- localStorage holds caches the live subscription rebuilds. When changing a cache's schema, don't write migration code or default-fill missing fields — reject malformed entries and let the next ingest backfill. Bump the storage key prefix if you want a clean cut.
- when touching tests, check if they might be simplified by dropping overly specific or complex assertions
- Do not use any `aria-*` attributes — this is a visual application with no screen-reader / a11y target. Tests should query by visible test-fixture data (`@alice`, `#general`, task content, displayName), existing `data-onboarding` anchors, or `data-testid` (last-resort for irreducibly icon-only critical actions and form controls without a visible label). The only allowed `aria-hidden="true"` is what Lucide / shadcn `ui/*` primitives render themselves on decorative SVGs — those are vendored, do not touch.

### New Code Discipline

New code arrives clean, even when adjacent to crufty old code:

- New shared state lives in a focused Zustand store under `src/features/feed-page/stores/`, not a new React Context. `useFilterStore` is the canonical home for sidebar filter dimensions (see `plans/filter-state-unification.md`); add new filter dimensions there, not via fresh `useState` in a controller or page.
- New `useEffect` calls include a one-line `// why:` comment explaining the side effect — at minimum the trigger and the externally observable result. Missing `why:` blocks merge.
- Keep `src/infrastructure/nostr/` and `src/domain/` React-free where practical. Pure functions, return data not hooks. These are the layers the test suite treats as the engineering invariant spec (per `plans/behavior-spec-coverage.md`) and the layers that survive any future rewrite.
- Do not extend the known god-files: `TaskComposer.tsx`, `UnifiedBottomBar.tsx`, `Index.tsx`, `ndk-provider.tsx`, `CalendarView.tsx`. New features mount adjacent components / controllers; the priority order for shrinking them is in `plans/rewrite-vs-refactor-strategy.md`.
- New components should not exceed ~8 hooks before splitting; this complements the 300-line file cap above. Use the split as the moment to ask whether the new state belongs in a store instead.
- New controller hooks should not return setters as part of their public API. Per `plans/project-analysis-zustand.md` Fault 3, return commands and derived state; write directly to the appropriate store for everything else.
- When a user-observable behavior changes, update `USER_GUIDE.md` in the same commit. It is the canonical UX behavior spec (see `plans/behavior-spec-coverage.md`); a feature that ships without a USER_GUIDE update creates documentation debt that compounds.
