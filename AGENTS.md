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
- If there are unstaged modifications beyond `package-lock.json` and `.env`, warn the user before proceeding.
- Before any larger change (major feature, cross-view UI change, broad refactor, or release prep), run `git pull --rebase --autostash`.

### Protocol Compliance
- Conform to Nostr protocol standards in https://github.com/nostr-protocol/nips/.
- Reference relevant NIPs in commit messages and release or review notes when protocol behavior is affected.

### Product Stage
- Software is in beta.
- Breaking changes are allowed when justified, but document them clearly in commit messages and user-facing notes.

### Logging and User Feedback
- Keep logs structured and minimal.
- Never log secrets, private keys, tokens, or sensitive user data.
- Prefer `console.warn`/`console.error` for actionable issues; avoid noisy debug logs in normal flows.
- Every distinctly new user-facing feature must include debug logs that are enabled by default in debug/dev builds (no manual DevTools/localStorage toggle required), while staying restricted in normal production builds unless explicitly enabled via build-time debug flags.
- Use toasts for significant outcomes:
  - success toast for completed user actions
  - error toast for failures with clear next-step guidance where possible
  - avoid duplicate/spammy toasts for the same event

### CI/Verification Matrix
Use this table and the matching YAML block below as the canonical verification policy. Keep later prose sections focused on interpretation, not restating the matrix.

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
    must_run_before_larger_change:
      - git pull --rebase --autostash
    warn_if_unstaged_beyond:
      - package-lock.json
  commits:
    must_commit_completed_changes: true
    conventional_commits_required: true
    squash_fixup_into_previous_when_local: true
    preferred_contiguous_tip_rewrite_method: git_reset_soft_then_recommit
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
  localization:
    supported_languages:
      - en
      - de
      - es
    production_code_user_facing_strings_must_be_localized: true
    allowed_hardcoded_user_facing_string_exceptions:
      - jurisdiction_or_compliance_text_explicitly_documented_in_code
    locale_updates_must_cover_all_supported_languages: true
  release:
    bump_from_commit_types:
      fix: patch
      enhance: patch
      feat: patch_default_minor_if_substantial
      breaking_change: major
    line_churn_since_last_release_minor_threshold: 1000
    line_churn_measurement: total_insertions_plus_deletions_since_previous_release_or_pushed_version
    minor_requires:
      - multiple_feats
      - significant_scope_or_impact
      - line_churn_at_or_above_minor_threshold
```

## General Workflow Policies

### General Agent Policies
- Follow commit/changelog/test/lint/refactor/process rules in this file for all AI-assisted changes.
- Keep edits focused, reviewable, and behavior-safe unless intentional behavioral changes are requested.
- Prefer explicit, parseable rules for automation; keep prose for rationale and edge cases.
- When a policy already exists in a machine-readable block or matrix, update that source first and keep prose sections non-duplicative.
- Close any background terminal sessions started for the task once they are no longer needed, and always clean them up after each commit before handoff or further workflow steps.
- When changing shared user-facing copy in locale files, propagate equivalent updates across all supported languages in `src/locales/` in the same change unless an omission is explicitly documented.
- Do not leave hardcoded user-facing strings in production code; route them through i18n and keep `en`, `de`, and `es` in sync unless a documented compliance/jurisdiction exception applies.

### Test and Verification
- Follow the verification matrix above for required commands.
- Write tests before each change except minor visual/cosmetic changes, then verify the changed behavior after implementation.
- Before adjusting existing tests, first determine whether failures indicate regressions or deliberate behavior changes.
- Prefer behavior/outcome tests over implementation-detail tests.
- Keep UI tests focused on key flows and accessibility contracts.
- Do not add cosmetic-only assertions unless explicitly required; any class/style assertion must include a short comment explaining the protected product contract.
- Snapshot tests are disallowed for complex UI unless narrowly scoped and justified inline.
- Treat lint warnings as actionable backlog; do not introduce new warnings. If a lint rule is intentionally relaxed or disabled, document scope and rationale in the same commit.

### Commit Discipline
- Always commit every completed change.
- Make atomic commits that build individually and stay coherent.
- You may amend commits with corrections if they are not yet pushed.
- Amend true follow-up fixes into the immediately relevant local commit when they are part of the same change.
- Keep unrelated changes in separate commits even if they are discovered while working on an unpushed local commit.
- If a commit only fixes the immediately previous local commit, squash it before handoff.
- Use Conventional Commits (`feat:`, `fix:`, `enhance:`, `refactor:`, `test:`, `docs:`, `chore:`).
- Ignore changes in `package-lock.json` unless dependencies (or dependency-affecting scripts) changed, ignore changes in `.env`.

### Changelog Discipline
- Keep `CHANGELOG.md` continuously updated.
- Keep `## [Unreleased]` at the top and add notable user-visible changes there until release.
- For notable user-visible behavior changes, add/update a changelog entry in the same change set.
- Do not add changelog entries for minor/internal-only changes unless explicitly requested.
- Keep entries concrete; one entry may summarize closely related commits.
- In version sections, classify genuinely new end-user capabilities under `### Added` and reserve `### Fixed` for regressions in previously existing behavior.
- If a version section has fewer than 4 total change bullets, omit `### Added`/`### Changed`/`### Fixed` subheadings and list bullets directly under the version heading.
- When a feature is first introduced in the same release, do not add separate changelog bullets for implementation/fix-up iterations that occurred while building it; summarize only the final user-visible outcome.
- Use semantic version sections (`MAJOR.MINOR.PATCH`) and ISO dates (`YYYY-MM-DD`).
- For major/minor releases (for example `2.0.0`, `1.7.0`), include a concise update summary line directly under the version heading before any bullet lists/subsections.
- On release, move grouped entries from `Unreleased` into the new versioned section.
- Before every push, prune redundant or iteration-level changelog bullets and reclassify genuinely new user-facing capabilities into `### Added` while keeping refinements and regressions under `### Changed` or `### Fixed`.

### Release Scope
- When choosing between patch and minor for an unpushed release, include total line churn since the previous release or currently pushed version as an explicit signal.
- If total insertions plus deletions reaches 1000 lines or more, default to at least a minor bump even when the user-visible summary is relatively compact.

### Refactoring Cadence
- After each major milestone, run a cleanup pass for duplication, consistency, complex components, and discovered debt.
- Do cleanup in a separate follow-up `refactor:` commit after the functional milestone commit.
- Do not mix milestone feature/fix and refactor changes in one commit unless required for functionality.
- Prefer small, reviewable refactors that preserve behavior.
- For each major milestone, include a short checklist in handoff or review notes:
  - duplication reviewed
  - consistency issues reviewed
  - large/complex components reviewed
  - deferrals with rationale

## Agent Operating Instructions

### Plans
When asked to create a plan to fix or implement something:
- ALWAYS write the plan to `plans/` at repo root.
- NEVER commit plans to git.
- Use descriptive kebab-case filenames (for example `fix-position-healing.md`).
- After making a plan, give a concise summary that emphasizes the opinionated path, key choices made, and the reasoning behind them so assumptions can be corrected early.
- When implementing a plan, use elaborated commit messages that detail the concrete changes made for each step.
- After implementing a plan, you MUST delete the plan file before handoff/final response.
- Before deleting untracked text artifacts (for example files in `plans/`), run this sequence so there is a recoverable hash reference:
  - `git add -f <file>`
  - `git stash push -m \"archive <file>\" -- <file>`
  - `git stash drop`

### Prompt Effort Modes
- `quick`: minimize testing/refactoring, run focused checks only, defer broader cleanup unless requested.
- `long`: run thorough workflow with comprehensive testing, deeper edge-case checks, and refactor/debt review.
- No prefix: choose a balanced level based on task complexity and risk.

### Special Commands

#### squash
- `squash` (or starts with `squash`): inspect recent commits and suggest sensible squashes for repetitive/fixup/tightly related follow-ups.
- Before any squash/rebase execution, list each squash candidate with its original commit message and intended target commit message.
- For squash checks, preserve atomic coherent history and do not squash unrelated functional changes.
- Rewrite only unpushed local history for squash/rebase unless explicitly instructed otherwise.
- When the commits to rewrite are a contiguous block at the tip, prefer `git reset --soft <target>` followed by selective recommits over an interactive rebase.
- Reserve interactive rebase for non-contiguous history edits or cases where a soft reset would make commit reconstruction materially less clear.
- After squashing, diff current commit to the previous head - there should be no difference, if there is, stop and ask how to proceed.

#### push
- `push` (or starts with `push`) is a special command and MUST run this full release workflow; do not shortcut directly to `git push` unless the user explicitly asks to bypass the routine.
- if no release or push prep changes are needed, still run the checklist, report results, and ask for explicit confirmation before any network push.
- update user-facing guides before release or push when behavior changed
- list unpushed commits: `git log origin/<branch>..HEAD --oneline`
- provide one high-level summary across all unpushed commits
- omit cosmetic-only low-level details unless asked
- update `package.json` version semantically based on the release policy above
- when bumping a patch/minor version, include a short explicit rationale in release/push notes (for example: "patch for fixes only" or "minor for broader user-facing feature scope")
- create annotated tag matching version (for example `v1.1.0`)
- apply the changelog discipline and verification matrix above
- after explicit confirmation, push branch and tags

### Assistant Response Formatting
- Keep summaries compact and scannable.
- Prefer single-line status items when content fits.
- Avoid repetitive progress boilerplate.
- In post-implementation summaries, concisely report added/removed line counts split into production code, test code, and other changes (for example documentation or process files).
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
