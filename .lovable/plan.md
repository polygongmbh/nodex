# Generalized "Soft-Disabled" Control Pattern

## Problem

Two competing UX needs collide on touch devices:

1. Controls gated on a writable relay / sign-in / permission should **look** unavailable so users understand they can't use them right now.
2. They must still be **tappable** so we can show a toast explaining *why* they're unavailable — `disabled` buttons swallow taps and give zero feedback on mobile (no hover, no title tooltip).

Today this is handled inconsistently:

- **Profile edit (mobile)** — currently fully enabled, no visual hint it requires a relay.
- **Kanban DnD / Shift+H/L moves** — guarded inside `handleMoveLeft/Right` with `guardModify()`, but the card itself shows no "soft-disabled" affordance.
- **Status toggle / completion checkbox** — `canCompleteTask` becomes `false` and click handler early-returns silently. No toast.
- **Priority chip in Kanban card** — uses `cursor-not-allowed` styling but `TaskPrioritySelect` receives `taskId={undefined}`, so taps do nothing and explain nothing.
- **List/Tree status menus** — same pattern as Kanban card.

We need one generalized concept used everywhere a relay/auth/permission gate would otherwise produce a fully-disabled, silent control.

## Concept: "Soft-Disabled" Controls

A soft-disabled control:

- Renders with **disabled-looking styling** (muted text, reduced opacity, `cursor-not-allowed` on hover-capable devices).
- Is **not** `disabled` at the DOM level — taps/clicks still fire.
- On activation, instead of running its normal action, fires a **feedback callback** that surfaces a toast (and may open the auth modal).
- Skips/short-circuits any sub-interactions (e.g. opening a popover/menu) so we don't double-prompt.

## Implementation Plan

### 1. New shared primitive: `useSoftDisabled` hook + `SoftDisabledButton` wrapper

**New file** `src/components/ui/soft-disabled.tsx`

Exports:

- `useSoftDisabled({ blockedReason, onBlockedAttempt })` — returns:
  - `isBlocked: boolean`
  - `softDisabledClassName: string` (opacity-60, cursor-not-allowed via Tailwind, no `pointer-events-none`)
  - `aria-disabled` props bundle
  - `interceptClick(originalHandler)` — wraps an onClick: if blocked, calls `onBlockedAttempt()` and stops propagation; otherwise delegates.
- `SoftDisabledButton` — convenience `<button>` wrapping the above for the most common case.

Soft-disabled styling rules (matches current "disabled-look" used in `KanbanTaskCard` priority chip):

- `opacity-60`
- `cursor-not-allowed` on hover-capable input
- No pointer-events disable; no `disabled` attribute
- `aria-disabled="true"` so AT users still hear it as unavailable

### 2. New shared blocking-reason resolver

**New file** `src/domain/auth/interaction-block-reason.ts`

Exports `resolveInteractionBlockFeedback(input)` returning a typed feedback descriptor:

```ts
type BlockKind = "needsSignin" | "needsWritableRelay" | "needsPermission" | "disconnectedSelectedFeeds";
type BlockFeedback = { kind: BlockKind; toast: () => void; sideEffect?: () => void };
```

Centralizes the choice between:
- `notifyDisconnectedSelectedFeeds()` (already exists)
- `notifyNeedSigninPost / notifyNeedSigninModify` (already exist)
- A new `notifyNeedWritableRelay()` (new helper, wraps the existing `auth:auth.profile.noRelayConnected` key, but generalized: `composer:toasts.warnings.noWritableRelay` — same copy, generalized location). Add `noWritableRelay` key to `composer.json` for `en/de/es`, keep `auth.profile.noRelayConnected` for the profile-specific case to avoid breaking existing usage.
- Permission-denied (existing `getTaskStatusChangeBlockedReason`) → toast via a new `notifyTaskActionBlocked(reason: string)`.

This resolver consumes signals already available in `useTaskPublishControls` (which already exposes `isInteractionBlocked` + `guardInteraction`) and the per-task permission helpers from `task-permissions.ts`.

### 3. Promote `guardInteraction` to a context-friendly callback

`useTaskPublishControls` already exposes `guardInteraction("post" | "modify")`. Extend it with a third mode `"silent-feedback"` that *only* surfaces the appropriate toast without opening the auth modal — used for inline soft-disabled controls where opening a modal mid-tap would be too aggressive (e.g. priority chip, status checkbox).

Expose a memoized `getInteractionFeedback(): BlockFeedback | null` so view components can both:
- Decide whether to render the control as soft-disabled.
- Trigger the appropriate feedback on tap.

Pass this through the existing Feed Surface context (`feed-task-view-model-context`) so all views can consume it without prop drilling.

### 4. Apply the pattern at call sites

For each of the following, swap the current "disabled" or "silently no-op" treatment for soft-disabled:

- **`src/components/mobile/MobileFilters.tsx`** — Edit Profile button:
  - When `!hasWritableRelayConnection`, render with `softDisabledClassName` and `aria-disabled`.
  - Tap fires `notifyNeedWritableRelay()` (toast); does not open editor.
  - Remove the current always-enabled visual treatment.

- **`src/components/tasks/kanban/KanbanTaskCard.tsx`**:
  - Priority chip: when `!canChangeStatus`, mark soft-disabled and on tap call shared feedback (replaces silent no-op via `taskId={undefined}`).
  - Card status chip / completion toggle handled via `useTaskStatusMenu` (see below).

- **`src/components/tasks/task-card/use-task-status-menu.ts`**:
  - Today, when `!canCompleteTask`, all click/pointer handlers early-return silently. Change so a click invokes the resolver to surface either:
    - permission reason via `getTaskStatusChangeBlockedReason(...)` → `notifyTaskActionBlocked(reason)`
    - relay/auth reason via `getInteractionFeedback()`
  - Long-press still suppressed (no menu opens), but a single tap now produces a toast.

- **`src/components/tasks/KanbanView.tsx`** `handleMoveLeft/Right`: already calls `guardModify()` for the relay case — also surface a permission-specific toast when only `canUserChangeTaskStatus` fails (currently silent return on line 268/290).

- **`src/components/tasks/list/ListTaskRow.tsx`** and **`src/components/tasks/feed/FeedTaskCard.tsx`** — they consume `useTaskStatusMenu`, so they pick up the change automatically. Audit any other inline gated controls (assignee changes, due date chip) and apply soft-disabled where they currently no-op.

- **`src/components/tasks/TreeTaskItem.tsx`** — same audit; apply to status checkbox and any inline edit chips.

### 5. Toast hygiene

- Each new toast uses a stable `id` (e.g. `"need-writable-relay"`, `"task-action-blocked"`) so rapid taps don't stack duplicates — matches the pattern already in `notifyDisconnectedSelectedFeeds`.
- Reuse existing copy where possible; only add `composer:toasts.warnings.noWritableRelay` (mirrors existing `auth.profile.noRelayConnected` text) and a generic `tasks:toasts.warnings.actionBlocked` if no specific reason is available. Update `en`, `de`, `es` together.

### 6. Tests

- Unit-test `useSoftDisabled` (intercepts click, emits feedback, preserves normal click when not blocked).
- Unit-test `resolveInteractionBlockFeedback` decision tree.
- Behavior test: tapping mobile Edit Profile without a writable relay surfaces toast and does not open the editor.
- Behavior test: tapping a Kanban priority chip on a task you don't own surfaces a permission toast.
- Behavior test: tapping the status checkbox on a non-writable-relay task surfaces the disconnected-feeds toast.
- Verification matrix: cross-view UI change → run lint + vitest + build.

### 7. Cleanup pass (separate `refactor:` commit)

After functional commit, audit remaining `disabled={...}` props on non-form-submit buttons in interactive surfaces (sidebar filters, compose chips, etc.) and migrate any that suffer from the same "silent on mobile" issue.

## Files to Add

- `src/components/ui/soft-disabled.tsx`
- `src/domain/auth/interaction-block-reason.ts`
- `src/components/ui/soft-disabled.test.tsx`
- `src/domain/auth/interaction-block-reason.test.ts`

## Files to Modify

- `src/lib/notifications.ts` (add `notifyNeedWritableRelay`, `notifyTaskActionBlocked`)
- `src/locales/{en,de,es}/composer.json` (new `noWritableRelay` key)
- `src/locales/{en,de,es}/tasks.json` (new `actionBlocked` key)
- `src/features/feed-page/controllers/use-task-publish-controls.ts` (expose `getInteractionFeedback`, extend `guardInteraction`)
- `src/features/feed-page/views/feed-task-view-model-context.tsx` (thread feedback resolver)
- `src/components/mobile/MobileFilters.tsx`
- `src/components/tasks/task-card/use-task-status-menu.ts`
- `src/components/tasks/kanban/KanbanTaskCard.tsx`
- `src/components/tasks/KanbanView.tsx`
- `src/components/tasks/list/ListTaskRow.tsx`
- `src/components/tasks/feed/FeedTaskCard.tsx`
- `src/components/tasks/TreeTaskItem.tsx`
- `CHANGELOG.md` (Unreleased — `### Changed` bullet about soft-disabled feedback for relay/permission-gated controls)

## Out of Scope

- Re-styling the global "disabled" look across all forms — only inline interactive controls that previously fully blocked taps on touch.
- Changing relay connection logic itself.
