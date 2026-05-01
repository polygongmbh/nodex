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

**Nodex** is a Nostr-native task and discussion app. It publishes tasks and comments as Nostr events to WebSocket relays, supporting offline queuing, multiple views, and channel/person filtering.

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
Routes are `/:view` and `/:view/:taskId`. Views: `feed`, `tree`, `list`, `kanban`, `calendar`, `table`. `Index.tsx` renders the appropriate view component via `ViewSwitcher`.

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
Tests use Vitest + jsdom + `@testing-library/react`. Setup file is `src/test/setup.ts` (mocks `localStorage`, `matchMedia`, `WebSocket`). Test fixtures are in `src/test/fixtures.ts`. Tests live alongside source files as `*.test.ts(x)`.

Write tests before each change except minor visual/cosmetic changes. Prefer behavior/outcome tests over implementation-detail tests. Snapshot tests are disallowed for complex UI unless narrowly scoped and justified inline.

High-impact areas that require test coverage:
- Compose parsing and submission behavior
- Channel/tag include/exclude filtering
- Nostr event conversion, mapping, and publishing tags
- Permission and status transition rules

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
- Amend the immediately previous local commit when the change is a direct fixup of it; use a new commit otherwise.
- In post-implementation summaries, after committing your changes, concisely report added/removed line counts split into production code, test code, and other changes (e.g. documentation or build files).

When the user says `squash`, inspect recent unpushed commits and suggest sensible squashes for fixups or tightly related follow-ups; list candidates with original and target messages before executing anything.

### Changelog
- Keep `CHANGELOG.md` updated; add user-visible changes to `## [Unreleased]` as you go
- Use `### Added` for new capabilities, `### Changed` for enhancements and changes, `### Fixed` for regressions; omit subheadings when fewer than 4 bullets in a version
- Do not add entries for minor/internal-only changes

### Plans
- Write plans to `plans/` at repo root using kebab-case filenames; never commit them
- After implementing a plan, delete the plan file before handoff
- Before deleting, archive with: `git add -f <file>` → `git stash push -m "archive <file>" -- <file>` → `git stash drop`

### Logging and Toasts
- Use `console.warn`/`console.error` for actionable issues; avoid noisy debug logs in normal production flows
- New user-facing features must include debug logs enabled by default in dev builds without manual toggling
- Use toasts for significant user-facing outcomes; avoid duplicate/spammy toasts for the same event
