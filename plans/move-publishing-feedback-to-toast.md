# Move Publishing Feedback From Warning Banner to Toast

## Goal
Replace the in-composer warning banner for `publishing` with a toast-based in-progress signal, while preserving protection against duplicate submits.

## Why this change
- A warning banner implies user action is needed, but `Publishing...` is informational.
- Toast is a better fit for transient in-progress status and aligns with existing submit success/error feedback patterns.

## Opinionated approach
1. Keep blocker banners for fixable states only (`tag`, `relay`, `selectTask`, `uploading`, `uploadFailed`, etc.).
2. Remove `publishing` from blocker/banner rendering path.
3. Drive publishing progress via a single deduplicated loading toast that closes on success/failure.
4. Keep submit button non-interactive during publish via explicit `isPublishing` guard/disabled handling, not blocker state.

## Implementation steps
1. **TaskComposer state + submit guard**
   - In `src/components/tasks/TaskComposer.tsx`:
   - Add an early return in `handleSubmit` when `isPublishing` is already true.
   - Continue to set/unset `isPublishing` around async submit.
   - Disable submit button directly when `isPublishing` is true (even without a blocker object).

2. **Toast lifecycle for publishing**
   - In `src/components/tasks/TaskComposer.tsx`:
   - On publish start, show `toast.loading(t("composer.blocked.publishing"), { id: "task-composer-publishing" })`.
   - On publish success/failure, `toast.dismiss("task-composer-publishing")`.
   - Keep existing failure toast (`notifyTaskCreationFailed`) for error state.
   - Ensure no duplicate loading toasts from rapid clicks by reusing a stable id.

3. **Blocker model cleanup**
   - In `src/lib/compose-submit-block.ts`:
   - Remove the `publishing` block branch and related type from `ComposeSubmitBlockCode`.
   - Keep `publishing` i18n key for toast copy (or rename to toast-specific key if we want stricter semantics).

4. **UI rendering alignment**
   - In `src/components/tasks/TaskComposer.tsx`:
   - Ensure banner visibility no longer depends on a `publishing` block.
   - Keep button title for empty and other blocked states unchanged.

5. **Tests**
   - Update `src/components/tasks/TaskComposer.test.tsx`:
   - Replace/adjust assertions expecting `Publishing...` in warning banner.
   - Add regression to verify publish start triggers loading toast and no banner appears for publish-in-progress.
   - Add regression for duplicate-click prevention during publish.

6. **Changelog**
   - Add concise `Unreleased` note in `CHANGELOG.md` that publishing feedback moved from banner to toast.

## Validation
- Run:
  - `npx vitest run src/components/tasks/TaskComposer.test.tsx`
  - `npx vitest run src/lib/i18n/locale-parity.test.ts` (if locale keys are touched)

## Risks and mitigations
- **Risk:** duplicate publishes if blocker removal is not replaced with explicit guard.
  - **Mitigation:** hard `if (isPublishing) return;` and disabled button while publishing.
- **Risk:** loading toast persists after thrown error path.
  - **Mitigation:** dismiss in `catch` and after resolved submit path.
