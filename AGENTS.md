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
- Use semantic commit messages (Conventional Commits), e.g. `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.
- Ignore changes in `package-lock.json` unless dependencies (or dependency-affecting scripts) were added/updated/removed.

## Startup Repo Check
- At the start of work, check `git status --short`.
- If there are unstaged modifications beyond `package-lock.json`, warn the user before proceeding.

## Test-First Workflow
- Write tests before each change.
- Verify all tests run after each change.
- Ask before adjusting existing tests and explain why.
- Before adjusting existing tests, first consider whether the implementation can be changed to preserve current functionality.

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
