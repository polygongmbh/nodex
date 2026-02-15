# AGENTS.md Instructions

These rules apply to all AI-assisted changes in this repository.

## Machine-Readable Metadata
```yaml
project:
  name: Nodex
  type: nostr-native-task-and-discussion-app
  stage: beta
```

## Common Commands (Machine-Readable)
```yaml
commands:
  install:
    cmd: npm i
    purpose: install dependencies
  dev:
    cmd: npm run dev
    purpose: start local development server
  build:
    cmd: npm run build
    purpose: create production build
  build_dev:
    cmd: npm run build:dev
    purpose: create development-mode build
  lint:
    cmd: npm run lint
    purpose: run eslint checks
  preview:
    cmd: npm run preview
    purpose: preview production build locally
  test:
    cmd: npx vitest run
    purpose: run test suite
  test_watch:
    cmd: npx vitest
    purpose: run tests in watch mode
```

## Project Structure (Machine-Readable)
```yaml
structure:
  root:
    - path: src/
      role: application source code
    - path: public/
      role: static public assets
    - path: dist/
      role: production build output (generated)
    - path: package.json
      role: scripts and dependency manifest
    - path: vite.config.ts
      role: vite build/dev configuration
    - path: tsconfig.json
      role: typescript project configuration
    - path: mostr-cli/
      role: optional reference implementation for functional behavior
      optional: true
      notes:
        - may be absent in some checkouts
        - use as behavioral reference; Nodex should implement equivalent UX visually
  src:
    - path: src/pages/
      role: route-level page components
    - path: src/components/
      role: reusable ui and feature components
    - path: src/components/tasks/
      role: task views, compose flows, and task interactions
    - path: src/components/mobile/
      role: mobile layout/navigation and compose controls
    - path: src/lib/
      role: shared utilities and nostr integration helpers
    - path: src/hooks/
      role: custom react hooks
    - path: src/types/
      role: shared type definitions
    - path: src/data/
      role: mock/demo data
```

## Project Overview
- Nodex is a Nostr-native task and discussion application.
- Primary entities are tasks/comments, channels (hashtags), relays, and people filters.
- Compose behavior, filtering logic, and Nostr event compatibility are core product behavior and should be treated as high-impact areas.
- `mostr-cli/` is an optional reference implementation for behavior parity, not a required runtime dependency.

## Commit Discipline
- Always commit every completed change.
- After every change, create atomic commits that build individually and are coherent.
- You may amend commits with corrections if they are not yet pushed.
- If a commit only fixes the immediately previous local commit, squash it before handoff (amend or autosquash); do not leave standalone fixup commits in shared history.
- Use semantic commit messages (Conventional Commits), e.g. `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.
- Ignore changes in `package-lock.json` unless dependencies (or dependency-affecting scripts) were added/updated/removed.

## Startup Repo Check
- At the start of work, check `git status --short`.
- If there are unstaged modifications beyond `package-lock.json`, warn the user before proceeding.

## Test-First Workflow
- Write tests before each change except for minor visual / cosmetic changes.
- Verify all tests run after each change.
- Before adjusting existing tests, first consider whether the tests fails because of a regression or because of a deliberate change.
- Prioritize comprehensive coverage of core functionality and business logic (filtering, compose behavior, Nostr event mapping/publishing, permissions, state transitions).
- Keep UI tests as targeted spot checks only where they protect important user flows or accessibility contracts.
- Prefer behavior and outcome tests over implementation-detail tests.
- Do not add tests that only assert cosmetic details (styling classes, exact DOM nesting, spacing, non-semantic icons) unless those are explicit product requirements.
- Avoid tests that mainly duplicate implementation internals; test public behavior and contracts instead.
- Any class/style assertion in tests must include a short comment explaining the product contract being protected.
- For high-impact areas, require meaningful business-logic coverage before merge:
  - compose parsing and submission behavior
  - channel/tag include/exclude filtering
  - Nostr event conversion/mapping/publishing tags
  - permission/status transition rules
- Snapshot tests are disallowed for complex UI surfaces unless narrowly scoped and justified in-file with a short rationale.

## Refactoring Cadence
- After each major milestone (feature completion, major bugfix batch, or cross-view UI change), run a cleanup pass focused on:
  - reducing duplication
  - harmonizing inconsistent patterns
  - simplifying large/complex components
  - paying down technical debt discovered during delivery
- Execute this cleanup in a separate follow-up commit (`refactor:`) after the functional milestone commit is completed.
- Do not mix milestone feature/fix changes and refactoring changes in the same commit, unless the refactor is strictly required to make the feature work.
- Prefer incremental refactors in small, reviewable commits that preserve behavior.
- When adding new code in duplicated areas, favor extracting shared helpers/components rather than copy-pasting.
- For each major milestone, include a short refactor checklist in handoff notes/PR description covering:
  - duplication reviewed
  - consistency issues reviewed
  - large/complex components reviewed
  - deferrals (if any) with rationale

## Protocol Compliance
- Conform to Nostr protocol standards as written in the NIPs repository:
  - https://github.com/nostr-protocol/nips/
- Reference relevant NIPs in commit messages and/or PR descriptions when protocol behavior is affected.

## Product Stage
- The software is currently in beta state.
- Breaking changes are allowed when justified, but document them clearly in commit messages and user-facing notes.

## Logging and User Feedback
- Implement consistent but safe console logging:
  - Keep logs structured and minimal.
  - Never log secrets, private keys, tokens, or sensitive user data.
  - Prefer `console.warn`/`console.error` for actionable issues and avoid noisy debug output in normal flows.
- Provide user feedback via toasts for significant outcomes:
  - Success toast for completed user actions.
  - Error toast for failures with clear next-step guidance where possible.
  - Avoid duplicate or spammy toasts for the same event.

## Plans and Worktrees

When the user asks you to create a plan to fix or implement something:

- ALWAYS write that plan to the plans/ directory on the root of the repo.
- NEVER commit plans to git
- Give the plan a descriptive name using kebab-case (e.g., `fix-position-healing.md`, `feat-new-feature.md`)
- Before deleting untracked text artifacts (for example files in `plans/`), run `git add` on them once without committing so they remain recoverable from the index/reflog if deletion was a mistake.

## Assistant Response Formatting
- Keep summaries compact and scannable.
- Prefer single-line status items when the content fits.
- Commit reporting should be one line per commit in this format:
  - `✅ <hash> <type>: <message>`
- Use concise visual indicators for sections and outcomes:
  - `✅` success/completed
  - `⚠️` warning/risk/blocker
  - `❌` failure
  - `🔍` investigation/diagnostics
  - `🧪` tests/verification
- When color is supported by the client, use it to reinforce the same status categories above.
- Avoid verbose prose when short bullet points communicate the same information.

## Prompt Effort Modes
- If the user prompt starts with `quick`:
  - minimize time spent on testing/refactoring
  - run focused checks only for the changed area
  - defer broader cleanup unless explicitly requested
- If the user prompt starts with `long`:
  - execute full, thorough workflow
  - include comprehensive testing, deeper edge-case checks, and refactor/debt review
  - include cleanup opportunities discovered during implementation
- If neither prefix is used:
  - choose a balanced level of testing/refactoring based on task complexity and risk.

## Progress Reporting Expectations
- During active work, provide progress estimates in short updates.
- Use staged progress labels when applicable, for example:
  - `🔍 Researching (stage 1/5)`
  - `🧭 Planning (stage 2/5)`
  - `🛠️ Implementing (stage 3/5)`
  - `🧪 Testing (stage 4/5)`
  - `✅ Finalizing (stage 5/5)`
- If staged labels are not suitable, use approximate percentage progress (e.g. `~40% complete`).
- Pair each progress update with a visual indicator icon and keep the update to 1-2 concise lines.
- Include blockers or uncertainty explicitly with `⚠️` and revised estimates when scope changes.
