# Nodex User Guide

## Quick Start
- Sign in from the profile menu to post tasks/comments to feeds.
- Guest sign-in starts with a deterministic placeholder username derived from your pubkey.
- Compose a post with at least one `#channel` tag.
- Desktop: choose Task or Comment from the compose kind control.
- Mobile: use the dedicated send actions for task/comment in the bottom bar.
- Optional: set task priority before posting.
- Optional: switch UI language (`EN`/`DE`/`ES`) from the language dropdown in the desktop top-right controls.

## Core Concepts
- Tasks and comments are Nostr events.
- Channels are hashtag-based labels and filters.
- Views share the same feed/channel/people filter state.

## Navigation
- Use the top view switcher to move between Tree, Feed, Kanban, Table, and Calendar.
- Click a task to focus on that task context.
- Use breadcrumb navigation (`All Tasks` / `Up` / parent path) to move through hierarchy.
- In Kanban, use the Levels dropdown near search to switch hierarchy scope:
  - `Top-level`: only root tasks (no parent).
  - `2/3 levels`: include subtasks up to that depth.
  - `All levels`: full parent/subtask hierarchy.
  - `Leaves only`: only end-node tasks with no subtasks.

## Channel and Tag Filtering
### Desktop sidebar channels
- Click the `#` icon next to a channel to cycle filter state:
  - `neutral` -> `included` -> `excluded` -> `neutral`
- Click a channel name to show only that channel (`included`) and reset other channels to `neutral`.
- Click the same channel name again while it is the only included channel to clear that exclusive channel filter.
- Click the Channels section header icon (next to the section title) to toggle all channels:
  - if all are neutral -> set all to included
  - otherwise -> reset all to neutral

### Content hashtag click behavior
- Clicking a hashtag inside task/comment content applies an exclusive channel focus:
  - clicked tag -> `included`
  - all other channels -> `neutral`

### Filter logic
- Included channels use AND logic:
  - an item must contain all included channels to be visible.
- Excluded channels hide items containing any excluded channel.

## People Filtering
- Desktop:
  - click person avatar/icon to toggle that person.
  - click person name for exclusive person filter.
  - click the same person name again while it is the only selected person to clear the exclusive people filter.
- Mobile (Manage view):
  - tap people chips to toggle selected users.

## Feed Filtering and Publishing
- Feed filter controls determine which items are visible.
- Feed chips show live connection state; selected disconnected feeds block posting/task edits until reconnected.
- New root tasks require exactly one selected feed.
- Subtasks, task-context comments, and task updates publish to the task's origin feed.
- If only demo/local feed is selected, item is stored locally (demo flow).
- In Relay Management, use debug utilities to copy relay diagnostics JSON or the configured relay URL list.

## Mobile Usage
- The view navigation is at the top.
- Open *Manage* for feed, channel, people, profile, and guide controls.
- *Open Guide* in *Manage* launches onboarding.
- The bottom bar is a combined search/compose field:
  - typing updates search results live,
  - send buttons post as task/comment from the same text.

## Onboarding Guide
- Open guide from:
  - Desktop sidebar: *Guide*
  - Mobile *Manage* view: *Open Guide*
- Desktop sidebar *Guide* and *Shortcuts* actions are directly labeled and no longer show duplicate hover popovers.
- Choose area overlay:
  - Navigation
  - Filters
  - Compose
- Some steps auto-advance after required interaction.
- If no interaction is detected for a few seconds, `Next` unlocks.

## Compose Rules
- At least one hashtag is required to post.
- Profile username (`Name`) follows NIP-05 local-part rules: lowercase `a-z`, digits `0-9`, `.`, `_`, `-`.
- Compose text must include meaningful message content; hashtags/mentions alone are not sufficient.
- Task/comment kind changes event behavior.
- `#tags` and `@mentions` are supported in compose text.
- Included channel filters are added to compose as metadata-only hashtag chips (without injecting `#channel` text).
- Selected people filters are added to compose as metadata-only mention chips.
- Feed-backed posts can use a short undo-send delay; undo restores the full compose draft state.
- If posting from mobile with no selected/typed channel tag, the app shows immediate feedback instead of silently failing.
- Task compose supports optional priority selection.
- Next to the date picker, choose the date type: `Due`, `Scheduled`, `Start`, `End`, or `Milestone`.
- On mobile, the inline date picker above the bottom bar scrolls horizontally through months (infinite-style strip) without month arrow controls.
- Date-typed tasks appear in Calendar view.
- Tasks with a future `Start` date are shown as not yet doable (greyed out) until that date.
- On mobile, use the task/comment send actions in the combined bottom bar to create.

## Table and Calendar Editing
- Table view supports inline priority editing.
- Table view supports inline due date/time/date-type editing.
- Calendar urgency colors shift from yellow (sooner) toward greener tones (farther out).

## Responsive Breakpoints
- UI breakpoints follow Tailwind defaults:
  - `sm`: `>=640px`
  - `md`: `>=768px`
  - `lg`: `>=1024px`
  - `xl`: `>=1280px`
  - `2xl`: `>=1536px`
- Components may change visibility, density, and control labels at these breakpoints.

## Reliability and Sorting
- If feed publish fails, the post is queued locally in a failed-publish banner with retry/dismiss actions instead of being treated as a normal published task/comment.
- Latest feed events are cached locally and rehydrated on app load for better offline/reconnect continuity.
- Task state changes now delay status-driven reorder updates slightly to reduce jarring list/table/kanban jumps during completion transitions.
- Edit profile/setup modal does not open when no feed is connected.
- Current-user profile metadata is cached locally and reused across sidebar/feed/top-right/profile-edit surfaces when live profile fields are temporarily missing.
- Presence status is published with NIP-38 updates (unless disabled in profile settings) and clears on sign-out/tab close.
- Non-feed task views use a shared priority order: due-now/overdue, then in-progress, high priority (`50+`), upcoming due, medium priority (`30-49`), no priority, then low priority (`<30`); Kanban `done` stays chronological.

## Task Permissions
- Tasks can be modified by tagged users (`p` tags).
- If no users are tagged, only the creator can modify the task.

### Compose keyboard behavior (desktop)
- `Enter` / `Tab` with autocomplete open: insert the highlighted suggestion into text.
- `Ctrl/Cmd+Enter`: submit as the currently selected kind.
- `Alt+Enter` with no autocomplete open: submit as the other kind (Task <-> Comment).
- `Alt/Ctrl/Cmd/Shift+Enter` with hashtag/mention autocomplete open: add the selected tag/mention to publish metadata without inserting token text.
- `Alt+Click` on a hashtag/mention autocomplete option: add that selected tag/mention as publish metadata only (no token text insertion).
- In the mobile combined composer, `Alt+Enter` while typing a hashtag token adds that hashtag as metadata-only, even for new tags.

### Search behavior
- Bottom search matches:
  - task/comment text,
  - hashtag and mention chips,
  - posting user identity (username/display name), including resolved names from cached profile metadata.

## Notes
- Nodex is in beta; behavior can evolve as Nostr integrations mature.
