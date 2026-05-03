# Keyboard interaction fixes

Three independent fixes around tab/arrow-key handling.

## 1. Status checkbox dropdown is "sticky" when tabbed to

**Cause** — `use-task-status-menu.ts` opens the menu on `onFocus` whenever the trigger matches `:focus-visible` (i.e. on tab focus). After Escape/click-away closes the menu, Radix returns focus to the trigger, which is still `:focus-visible`, so `onFocus` fires again and re-opens the menu. Tab also lands on the trigger and immediately opens it.

**Fix** — Stop auto-opening on focus. Keyboard users can open the menu explicitly with Space/Enter/ArrowDown (Radix handles those on the trigger natively). Tab should only move focus, not open a menu.

- In `src/components/tasks/task-card/use-task-status-menu.ts`: remove the `onFocus` auto-open branch (or guard it so it never auto-opens for tab focus). Keep `statusTriggerPointerDownRef` reset for pointer flow.
- Delete `src/lib/status-menu-focus.ts` and its test (`status-menu-focus.test.ts`) — they become dead code.
- Verify Escape from inside the menu closes it cleanly (Radix default), and tabbing forward from the trigger after close moves to the next focusable element rather than re-opening.

## 2. Composer submit button has no visible focus ring when tabbed to

**Cause** — In `src/components/tasks/TaskComposer.tsx` (~lines 2180–2205), the create/post submit `<button>` uses bespoke `className` styles and lacks any `focus-visible:` ring. Same for the sign-in fallback button just above.

**Fix** — Add a focus-visible ring matching the rest of the app:
- Append `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background` to both submit-button class strings (signed-out and signed-in branches).
- Also apply the same to the secondary task-type toggle buttons in the same row if they're missing it (quick audit while there).

## 3. Arrow keys both navigate feed selection AND move dropdown selection

**Cause** — `src/hooks/use-task-navigation.tsx` `handleKeyDown` is bound to `document` and only pauses for `[role="dialog"][data-state="open"]`. Radix `DropdownMenu.Content` uses `role="menu"`, not dialog, so arrow keys reach both the menu (Radix) and the feed nav simultaneously.

**Fix** — Extend the pause guard to cover any open Radix overlay surface that owns keyboard focus:
- Update the guard in `use-task-navigation.tsx` to skip when any of these are present and open:
  - `[role="dialog"][data-state="open"]`
  - `[role="menu"][data-state="open"]`
  - `[role="listbox"][data-state="open"]`
  - `[role="combobox"][aria-expanded="true"]`
- Combine into a single `document.querySelector` selector list.
- Add a unit test in `use-task-navigation.test.tsx` asserting arrow keys are no-ops while a `role="menu"` element with `data-state="open"` exists in the DOM.

## Technical notes

- The status-menu trigger remains a `DropdownMenuTrigger`, so Radix still opens the menu on Space/Enter/ArrowDown for keyboard users — we only remove the *implicit* auto-open on focus.
- No locale changes; no protocol changes.
- Verification: focused vitest run on `use-task-navigation.test.tsx` and any `use-task-status-menu` tests, plus a manual tab/escape walk through Feed and Kanban.

## Files touched

- `src/components/tasks/task-card/use-task-status-menu.ts` — drop onFocus auto-open
- `src/lib/status-menu-focus.ts` + `.test.ts` — delete (dead code)
- `src/components/tasks/TaskComposer.tsx` — add `focus-visible:` ring to submit buttons
- `src/hooks/use-task-navigation.tsx` — broaden overlay pause guard
- `src/hooks/use-task-navigation.test.tsx` — add menu-open guard test
