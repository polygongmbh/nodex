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
- If there are unstaged modifications beyond `package-lock.json` and `.env` or `vite.config.ts`, warn the user before proceeding.
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
    ignore_paths_by_default:
      - package-lock.json
      - .env
      - plans/**
  testing:
    test_first_default: true
    skip_test_first_for:
      - minor visual changes
    disallow_copy_specific_assertions_by_default: true
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
    tests_should_avoid_i18n_import_backed_copy_assertions_by_default: true
    allowed_test_i18n_import_exceptions:
      - dedicated_i18n_configuration_or_locale_parity_coverage
      - explicit_translation_contracts_not_expressible_via_semantics_or_stable_test_ids
    allowed_hardcoded_user_facing_string_exceptions:
      - jurisdiction_or_compliance_text_explicitly_documented_in_code
    locale_updates_must_cover_all_supported_languages: true
  release:
    bump_from_commit_types:
      fix: patch
      enhance: patch
      feat: patch_default_minor_if_boundary_met
      breaking_change: major
    line_churn_since_last_release_minor_threshold: 2000
    line_churn_measurement: production_code_insertions_plus_deletions_since_previous_release_or_pushed_version
    changelog_release_scope_source: unreleased_section
    changelog_release_scope_includes:
      - unpushed_commits
      - already_pushed_but_unreleased_changes
      - first_parent_git_history_since_latest_tag
    changelog_release_reconciliation_required_inputs:
      - CHANGELOG.md Unreleased
      - git log --first-parent <latest-tag>..HEAD
      - git diff --stat <latest-tag>..HEAD
    minor_requires_any:
      - at_least_two_feat_commits
      - production_code_line_churn_at_or_above_minor_threshold
```

## General Workflow Policies

### General Agent Policies
- Keep edits focused, reviewable, and behavior-safe unless intentional behavioral changes are requested.
- Treat the machine-readable blocks and verification matrix as canonical; update them first and keep prose additive.
- Avoid introducing new cross-component callback props with bare `(string) => void` signatures for interaction flows; prefer typed interaction intents or a typed command API.
- Prefer reducing `src/pages/Index.tsx` by moving logic into focused controllers, views, or helpers.
- Close background terminal sessions once they are no longer needed, and always clean them up after each commit before handoff.
- Propagate shared locale copy updates across `src/locales/` in the same change unless the omission is explicitly documented.
- Update `.env.example` when supported environment variables are added, removed, renamed, or materially changed.
- Use semantic linebreaks in prose-heavy docs and config comments such as `AGENTS.md`, `README.md`, and `.env.example`.
- Route production user-facing strings through i18n and keep `en`, `de`, and `es` aligned unless a documented compliance or jurisdiction exception applies.
- Ignore unrelated incidental file changes unless they directly conflict with the target work.
- Surface blockers or uncertainty with `⚠️` and revised estimates.

### Test and Verification
- Follow the verification matrix for required commands.
- Write tests before changes by default, except for minor visual or cosmetic changes.
- If an existing test fails, determine whether it reflects a regression or an intentional behavior change before editing it.
- Prefer behavior and outcome coverage over implementation-detail coverage.
- Keep UI tests focused on key flows and accessibility contracts.
- Use semantic queries first. Use `data-testid` only when semantics are unstable or absent, and document why when you do.
- Keep copy-specific assertions in dedicated i18n or messaging coverage unless the exact text is the product contract.
- Avoid importing or mutating shared i18n runtime in feature tests just to get translated copy.
- Snapshot tests for complex UI are disallowed unless narrowly scoped and justified inline.
- Treat lint warnings as backlog; do not introduce new ones, and document any intentional rule relaxation in the same commit.

### Commit Discipline
- Commit every completed change before handoff unless the user explicitly says not to.
- Keep commits atomic, coherent, and individually buildable.
- Amend or squash local follow-up fixes into the immediately relevant unpushed commit after confirming the tip with `git log --oneline -1`.
- Keep unrelated work in separate commits.
- Use Conventional Commits: `feat:`, `fix:`, `enhance:`, `refactor:`, `test:`, `docs:`, `chore:`.
- Ignore `package-lock.json` unless dependencies or dependency-affecting scripts changed, ignore `.env`, and ignore incidental `plans/` changes unless the task explicitly requires them.

### Changelog Discipline
- Keep `CHANGELOG.md` current, with `## [Unreleased]` at the top until release.
- Update the changelog in the same change set for notable user-visible behavior changes.
- Skip changelog entries for minor or internal-only changes unless explicitly requested.
- Keep entries concrete and user-facing; summarize related work once instead of logging iteration details.
- Use semantic versions, ISO dates, and the existing `Added`/`Changed`/`Fixed` classification rules.
- On release or push prep, reconcile `Unreleased` against `git log --first-parent <latest-tag>..HEAD` and `git diff --stat <latest-tag>..HEAD`.

### Release Scope
- Treat minor releases as opt-in. Default to patch unless the configured `feat:` count or production-code churn threshold is met.
- For churn-based minor decisions, count only production-code insertions plus deletions since the previous release or pushed version.

### Refactoring Cadence
- After each major milestone, run a cleanup pass for duplication, consistency, large components, and discovered debt.
- Put cleanup in a separate follow-up `refactor:` commit unless functionality requires it to stay together.
- Prefer small, reviewable, behavior-preserving refactors.
- For each major milestone, include this checklist in handoff or review notes:
  - duplication reviewed
  - consistency issues reviewed
  - large or complex components reviewed
  - deferrals with rationale

## Agent Operating Instructions

### Plans
When asked to create a plan to fix or implement something:
- ALWAYS write the plan to `plans/` at repo root.
- NEVER commit plans to git.
- Use descriptive kebab-case filenames (for example `fix-position-healing.md`).
- After making a plan, give a concise summary that emphasizes the key choices made and the reasoning behind them so assumptions can be corrected early.
- When implementing a plan, use elaborated commit messages that detail the concrete changes made for each step.
- After fully implementing a plan, delete the plan file.
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
- `push` (or starts with `push`) is a special command and MUST run this full release workflow; do not shortcut directly to `git push` unless the user explicitly asks to bypass the routine
- update user-facing guides before release or push
- list commits since last version and provide high-level summary
- reconcile the pending release against `CHANGELOG.md` `Unreleased`, `git log --first-parent <latest-tag>..HEAD`, and `git diff --stat <latest-tag>..HEAD` so already-pushed-but-unreleased entries are included in the version scope unless explicitly deferred
- omit cosmetic-only and internal details from the changelog
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
- Commit reporting format: `✅ <hash> <type>: <message> (+<added> ~<changed> -<removed>)`
- Status indicators:
  - `✅` success/completed
  - `⚠️` warning/risk/blocker
  - `❌` failure
  - `🔍` investigation/diagnostics
  - `🧪` tests/verification
- Use color when supported to reinforce status categories.
- Prefer concise bullets over verbose prose.

### AGENTS Maintenance
- When the user gives new standing workflow/process instructions, update `AGENTS.md` in the same session.
- Keep updates concise and place them in the most relevant existing section (create a new section only when needed).
