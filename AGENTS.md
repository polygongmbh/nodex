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

## Changelog Discipline
- Keep `CHANGELOG.md` continuously updated.
- Keep a top `## [Unreleased]` section and add new entries there until a release is cut.
- For each notable user-visible behavior change, add or update a changelog entry in the same change set.
- Do not add changelog entries for minor/internal-only changes (for example refactors, test-only updates, or small technical guardrail changes) unless the user explicitly asks.
- One changelog entry may summarize multiple closely related commits, but it must stay concrete about user-facing effects.
- Use semantic version sections (`MAJOR.MINOR.PATCH`) and dates in ISO format (`YYYY-MM-DD`).
- On release, move grouped entries from `Unreleased` into the new versioned section.

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

## Lint Verification
- Run `npm run lint` after major change sets (feature milestones, cross-view UI changes, release prep, or broad refactors), not after every minor edit.
- Treat lint warnings as actionable backlog; do not introduce new warnings.
- For major milestones, verify at minimum:
  - `npm run lint`
  - `npx vitest run`
  - `npm run build`
- For minor/localized changes, run focused tests and build checks as appropriate; defer full lint to the next major milestone.
- If a lint rule is intentionally relaxed or disabled, document the scope and rationale in the same commit.

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
- Avoid repetitive progress boilerplate; do not repeat the same phase/status label unless the phase actually changed.
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

## Special Commands
- If the user message is `squash` (or starts with `squash`), inspect recent commits and check whether some should be sensibly squashed because they are repetitive, fixups, or tightly related follow-ups.
- In that check, prioritize preserving atomic, coherent history and avoid squashing unrelated functional changes together.
- Only rewrite unpushed local history when performing squash/rebase operations; do not rewrite pushed/shared history unless the user explicitly requests it.
- If the user instructs to `push`:
  - first list all unpushed commits (`git log origin/<branch>..HEAD --oneline`)
  - then provide one high-level summary across all unpushed commits (not per-commit), focused on major functional/product changes
  - omit cosmetic-only or low-level implementation details from that summary unless explicitly requested
  - update `package.json` version semantically based on pending changes
  - update `CHANGELOG.md` for that version
  - create an annotated release tag matching the version (for example `v1.1.0`) before pushing
  - run verification commands appropriate for the risk level
  - explicitly ask whether to push after providing the commit list and high-level summary
  - push with `git push` only after the summary, version/changelog/tag updates, and explicit user confirmation are complete
  - when approved, push both branch and tags (`git push` and `git push --tags`, or equivalent explicit ref pushes)

## AGENTS Maintenance
- When the user gives new standing workflow/process instructions for this repository, update `AGENTS.md` in the same session so the rule is persisted.
- Keep these updates concise and place them in the most relevant existing section (create a new section only when needed).

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
- Prefer milestone-only progress updates (phase changes, blockers, completion) instead of repeating researching/implementing/testing labels in every message.
- Include blockers or uncertainty explicitly with `⚠️` and revised estimates when scope changes.
- If unrelated files change while working, ignore those incidental changes and continue focusing on files you intentionally edited; do not treat this as a blocker unless it creates a direct conflict with your target files.
