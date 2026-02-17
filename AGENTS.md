# AGENTS.md Instructions

These rules apply to all AI-assisted changes in this repository.

## Project-Specific Instructions

### Machine-Readable Metadata
```yaml
project:
  name: Nodex
  type: nostr-native-task-and-discussion-app
  stage: beta
```

### Common Commands (Machine-Readable)
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

### Project Structure (Machine-Readable)
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

### Repository Context
- Nodex is a beta Nostr-native task and discussion application.
- Primary entities are tasks/comments, channels (hashtags), relays, and people filters.
- High-impact behavior areas: compose parsing/submission, channel/tag filtering, Nostr event mapping/publishing tags, and permission/status transitions.
- `mostr-cli/` is an optional behavioral reference only; never require it as a runtime dependency.

### Startup Repo Check
- At the start of work, run `git status --short`.
- If there are unstaged modifications beyond `package-lock.json`, warn the user before proceeding.

### Protocol Compliance
- Conform to Nostr protocol standards in https://github.com/nostr-protocol/nips/.
- Reference relevant NIPs in commit messages and/or PR descriptions when protocol behavior is affected.

### Product Stage
- Software is in beta.
- Breaking changes are allowed when justified, but document them clearly in commit messages and user-facing notes.

### Logging and User Feedback
- Keep logs structured and minimal.
- Never log secrets, private keys, tokens, or sensitive user data.
- Prefer `console.warn`/`console.error` for actionable issues; avoid noisy debug logs in normal flows.
- Use toasts for significant outcomes:
  - success toast for completed user actions
  - error toast for failures with clear next-step guidance where possible
  - avoid duplicate/spammy toasts for the same event

### CI/Verification Matrix
| Change category | Required checks | Recommended checks |
| --- | --- | --- |
| Docs/process-only updates (for example `AGENTS.md`, non-runtime docs) | Targeted sanity check | None |
| Minor localized logic or UI changes | Focused tests for changed area | `npm run build` |
| Major feature, cross-view UI change, release prep, or broad refactor | `npm run lint`, `npx vitest run`, `npm run build` | None |
| Protocol/event mapping/publishing changes | `npx vitest run`, `npm run build` | `npm run lint` |

### Machine-Readable Policy Rules
```yaml
policies:
  startup:
    must_run:
      - git status --short
    warn_if_unstaged_beyond:
      - package-lock.json
  commits:
    must_commit_completed_changes: true
    conventional_commits_required: true
    squash_fixup_into_previous_when_local: true
  testing:
    test_first_default: true
    skip_test_first_for:
      - minor visual changes
    high_impact_required_coverage:
      - compose parsing and submission behavior
      - channel/tag include/exclude filtering
      - Nostr event conversion/mapping/publishing tags
      - permission/status transition rules
  milestones:
    major_default: scope_or_risk
    scope_based_major_when_any:
      - cross_view_ui_change
      - feature_spanning_multiple_modules
      - broad_refactor
      - release_prep
    risk_based_major_when_any:
      - compose_behavior_changes
      - filtering_logic_changes
      - nostr_event_mapping_or_publishing_changes
      - permission_or_status_transition_changes
      - relay_or_people_filter_behavior_changes
  verification_matrix:
    docs_or_agents_only:
      required:
        - targeted sanity check
      recommended: []
    minor_localized_logic_or_ui:
      required:
        - focused tests for changed area
      recommended:
        - npm run build
    major_feature_or_cross_view_or_refactor:
      required:
        - npm run lint
        - npx vitest run
        - npm run build
      recommended: []
    protocol_or_event_mapping_changes:
      required:
        - npx vitest run
        - npm run build
      recommended:
        - npm run lint
  release:
    bump_from_commit_types:
      fix: patch
      feat: minor
      breaking_change: major
```

## General Workflow Policies

### General Agent Policies
- Follow commit/changelog/test/lint/refactor/process rules in this file for all AI-assisted changes.
- Keep edits focused, reviewable, and behavior-safe unless intentional behavioral changes are requested.
- Prefer explicit, parseable rules for automation; keep prose for rationale and edge cases.

### Test and Verification
- Write tests before each change except minor visual/cosmetic changes.
- Verify tests after each change.
- Before adjusting existing tests, first evaluate whether failures indicate regressions or deliberate behavior changes.
- For high-impact behavior areas, require meaningful business-logic coverage before merge.
- Prefer behavior/outcome tests over implementation-detail tests.
- Keep UI tests as targeted checks for key flows or accessibility contracts.
- Do not add cosmetic-only assertions (classes, exact DOM nesting, spacing, non-semantic icons) unless explicitly required.
- Any class/style assertion must include a short comment explaining the protected product contract.
- Snapshot tests are disallowed for complex UI unless narrowly scoped and justified inline.
- Treat lint warnings as actionable backlog; do not introduce new warnings.
- If a lint rule is intentionally relaxed/disabled, document scope and rationale in the same commit.
- Run `npm run lint` for major milestones; for minor/localized changes, defer full lint to the next major milestone.

### Commit Discipline
- Always commit every completed change.
- Make atomic commits that build individually and stay coherent.
- You may amend commits with corrections if they are not yet pushed.
- If a commit only fixes the immediately previous local commit, squash it before handoff.
- Use Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`).
- Ignore changes in `package-lock.json` unless dependencies (or dependency-affecting scripts) changed.

### Changelog Discipline
- Keep `CHANGELOG.md` continuously updated.
- Keep `## [Unreleased]` at the top and add notable user-visible changes there until release.
- For notable user-visible behavior changes, add/update a changelog entry in the same change set.
- Do not add changelog entries for minor/internal-only changes unless explicitly requested.
- Keep entries concrete; one entry may summarize closely related commits.
- In version sections, classify genuinely new end-user capabilities under `### Added` (for example new guides, new flows, new controls), and reserve `### Fixed` for regressions/bugs in previously existing behavior.
- When a feature is first introduced in the same release, do not add separate changelog bullets for implementation/fix-up iterations that occurred while building it; summarize only the final user-visible outcome.
- Use semantic version sections (`MAJOR.MINOR.PATCH`) and ISO dates (`YYYY-MM-DD`).
- On release, move grouped entries from `Unreleased` into the new versioned section.

### Refactoring Cadence
- After each major milestone, run a cleanup pass for duplication, consistency, complex components, and discovered debt.
- Do cleanup in a separate follow-up `refactor:` commit after the functional milestone commit.
- Do not mix milestone feature/fix and refactor changes in one commit unless required for functionality.
- Prefer small, reviewable refactors that preserve behavior.
- For each major milestone, include a short checklist in handoff/PR notes:
  - duplication reviewed
  - consistency issues reviewed
  - large/complex components reviewed
  - deferrals with rationale

## Agent Operating Instructions

### Plans and Worktrees
When asked to create a plan to fix or implement something:
- ALWAYS write the plan to `plans/` at repo root.
- NEVER commit plans to git.
- Use descriptive kebab-case filenames (for example `fix-position-healing.md`).
- After implementing a plan, you MUST delete the plan file before handoff/final response.
- Before deleting untracked text artifacts (for example files in `plans/`), run this sequence so there is a recoverable hash reference:
  - `git add <file>`
  - `git stash push -m \"archive <file>\" -- <file>`
  - `git stash drop` (drop only after confirming the stash entry exists)

### Prompt Effort Modes
- `quick`: minimize testing/refactoring, run focused checks only, defer broader cleanup unless requested.
- `long`: run thorough workflow with comprehensive testing, deeper edge-case checks, and refactor/debt review.
- No prefix: choose a balanced level based on task complexity and risk.

### Special Commands
- `squash` (or starts with `squash`): inspect recent commits and suggest sensible squashes for repetitive/fixup/tightly related follow-ups.
- For squash checks, preserve atomic coherent history and do not squash unrelated functional changes.
- Rewrite only unpushed local history for squash/rebase unless explicitly instructed otherwise.
- If instructed to `push`:
  - update user-facing guides before release/push when behavior changed (at minimum `USER_GUIDE.md`, plus in-app guide/shortcuts copy where relevant)
  - explicitly review and revise `CHANGELOG.md` before release (wording, section classification, redundancy, and user-facing clarity)
  - list unpushed commits: `git log origin/<branch>..HEAD --oneline`
  - provide one high-level summary across all unpushed commits
  - omit cosmetic-only low-level details unless asked
  - update `package.json` version semantically based on pending changes
  - apply semantic bump examples:
    - patch: `1.4.2 -> 1.4.3` for `fix:` only
    - minor: `1.4.2 -> 1.5.0` when at least one `feat:` exists and no breaking change exists
    - major: `1.4.2 -> 2.0.0` for breaking change (`feat!:`/`fix!:` or `BREAKING CHANGE:`)
  - update `CHANGELOG.md`
  - create annotated tag matching version (for example `v1.1.0`)
  - run verification commands appropriate to risk
  - ask explicit confirmation before pushing
  - on approval, push branch and tags

### Assistant Response Formatting
- Keep summaries compact and scannable.
- Prefer single-line status items when content fits.
- Avoid repetitive progress boilerplate.
- Commit reporting format:
  - `✅ <hash> <type>: <message> (+<added> ~<changed> -<removed>)`
- Status indicators:
  - `✅` success/completed
  - `⚠️` warning/risk/blocker
  - `❌` failure
  - `🔍` investigation/diagnostics
  - `🧪` tests/verification
- Use color when supported to reinforce status categories.
- Prefer concise bullets over verbose prose.

### Progress Reporting Expectations
- Provide progress estimates during active work.
- Use staged labels when suitable:
  - `🔍 Researching (stage 1/5)`
  - `🧭 Planning (stage 2/5)`
  - `🛠️ Implementing (stage 3/5)`
  - `🧪 Testing (stage 4/5)`
  - `✅ Finalizing (stage 5/5)`
- If staged labels are not suitable, use approximate percentage (for example `~40% complete`).
- Pair updates with status icons and keep them concise.
- Prefer milestone-only updates over repetitive phase labels.
- Include blockers/uncertainty with `⚠️` and revised estimates.
- If unrelated files change while working, ignore incidental changes unless they directly conflict with target files.

### AGENTS Maintenance
- When the user gives new standing workflow/process instructions, update `AGENTS.md` in the same session.
- Keep updates concise and place them in the most relevant existing section (create a new section only when needed).
