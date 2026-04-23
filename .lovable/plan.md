

## Goal

Make task card hover tooltips (`title`) more informative across all views by including an extended-but-bounded preview of the task content, instead of the generic "Focus task" / "Focus comment".

## Current Behavior

| View | Hover tooltip today |
|---|---|
| Tree (`TreeTaskItem`) | "Focus task" / "Focus comment" — no content |
| List (`ListTaskRow`) | "Focus task" — no content |
| Feed (`FeedTaskCard`) | No tooltip on the body at all |
| Kanban (`KanbanTaskCard`) | No tooltip on the body |
| Calendar (`CalendarView`) | No tooltip on the task body |

Only the Tree aria-label uses `task.content.slice(0, 50)`. Tooltips themselves are content-less.

## Proposed Behavior

Hover any task card surface (Tree row, List row, Feed card, Kanban card, Calendar entry) → native browser tooltip shows:

```
Focus task: <preview>
Focus comment: <preview>
```

Where `<preview>` is:
- A single-line, whitespace-collapsed version of `task.content`
- Capped at ~160 characters (extended, not unlimited)
- Truncated with `…` when longer
- Falls back to the existing generic label when content is empty (e.g. listings rendered from metadata only)

## Implementation

### 1. New helper: `src/lib/task-content-preview.ts`

Add a sibling to the existing `shouldCollapseTaskContent` util:

```ts
export const TASK_TOOLTIP_PREVIEW_MAX = 160;

export function getTaskTooltipPreview(content: string, max = TASK_TOOLTIP_PREVIEW_MAX): string {
  const collapsed = content.replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) return collapsed;
  return `${collapsed.slice(0, max - 1).trimEnd()}…`;
}
```

### 2. Locale strings (en, de, es)

Reuse the existing `focusBreadcrumbTitle` pattern (already includes `{{title}}`) by adding a parallel key for comments and switching the empty-content fallback:

```json
"focusTaskTitle": "Focus {{type}}",
"focusTaskWithPreview": "Focus {{type}}: {{preview}}"
```

(Translate "Focus {{type}}: {{preview}}" / "{{type}} fokussieren: {{preview}}" / "Enfocar {{type}}: {{preview}}".)

### 3. Wire previews into each view

Apply the same pattern in five places — compute `preview = getTaskTooltipPreview(task.content)` once, then set `title` to `focusTaskWithPreview` when non-empty, otherwise the existing `focusTaskTitle`.

| File | Change |
|---|---|
| `src/components/tasks/TreeTaskItem.tsx` | Replace `title` on the row button (line 303). Also enrich `aria-label` to use the same preview length. |
| `src/components/tasks/list/ListTaskRow.tsx` | Replace `title` on the content div (line 169). |
| `src/components/tasks/feed/FeedTaskCard.tsx` | Add `title` to the `TaskSurface` (currently none). |
| `src/components/tasks/kanban/KanbanTaskCard.tsx` | Add `title` to the `TaskSurface` (currently none). |
| `src/components/tasks/CalendarView.tsx` | Add `title` to the clickable task row in both the day cell and the "more tasks" popover. |

Tree-specific note: keep using `t("tasks.task")` / `t("tasks.comment")` for the `{{type}}` placeholder so comments still read "Focus comment: …".

### 4. Tests

- Add a small unit test for `getTaskTooltipPreview` covering: short content, long content truncation, multi-line whitespace collapse, empty string.
- No UI snapshot/copy tests added (per project policy on copy assertions); existing aria-label tests in `FeedView.test.tsx` / `ListView.test.tsx` continue to work because they use regex matching against the title prefix.

## Out of Scope

- Visual hover styling (already handled by `task-card-surface` / `task-hover-text` classes).
- Any change to the focused/keyboard-ring treatment.
- Mobile long-press tooltips (browsers don't surface `title` on touch; no change needed).

## Files Touched

- `src/lib/task-content-preview.ts` (add export + test)
- `src/lib/task-content-preview.test.ts` (new)
- `src/locales/{en,de,es}/tasks.json`
- `src/components/tasks/TreeTaskItem.tsx`
- `src/components/tasks/list/ListTaskRow.tsx`
- `src/components/tasks/feed/FeedTaskCard.tsx`
- `src/components/tasks/kanban/KanbanTaskCard.tsx`
- `src/components/tasks/CalendarView.tsx`

