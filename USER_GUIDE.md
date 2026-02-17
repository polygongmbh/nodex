# Nodex User Guide

## Quick Start
- Sign in from the profile menu to post tasks/comments to relays.
- Compose a post with at least one `#channel` tag.
- Choose Task or Comment from the mobile/desktop kind control.
- Optional: set task priority before posting.
- Optional: switch UI language (`EN`/`DE`) from the language toggle.

## Core Concepts
- Tasks and comments are Nostr events.
- Channels are hashtag-based labels and filters.
- Views share the same relay/channel/people filter state.

## Navigation
- Use the top view switcher to move between Tree, Feed, Kanban, Calendar, and Table.
- Click a task to focus on that task context.
- Use breadcrumb navigation (`All Tasks` / `Up` / parent path) to move through hierarchy.

## Channel and Tag Filtering
### Desktop sidebar channels
- Click a channel name to cycle filter state:
  - `neutral` -> `included` -> `excluded` -> `neutral`
- Click the `#` icon next to a channel to show only that channel (`included`) and reset other channels to `neutral`.
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
  - click person name to toggle.
  - click person avatar/icon for exclusive person filter.
- Mobile (Manage view):
  - tap people chips to toggle selected users.

## Relay Filtering and Publishing
- Relay filter controls determine which items are visible.
- New root tasks require exactly one selected relay.
- Subtasks, task-context comments, and task updates publish to the task's origin relay.
- If only demo/local relay is selected, item is stored locally (demo flow).

## Mobile Usage
- The view navigation is at the top.
- Open *Manage* for relay, channel, people, profile, and guide controls.
- *Open Guide* in *Manage* launches onboarding.
- The bottom bar is a combined search/compose field:
  - typing updates search results live,
  - submit creates a task/comment from the same text.

## Onboarding Guide
- Open guide from:
  - Desktop sidebar: *Guide*
  - Mobile *Manage* view: *Open Guide*
- Choose area overlay:
  - Navigation
  - Filters
  - Compose
- Some steps auto-advance after required interaction.
- If no interaction is detected for a few seconds, `Next` unlocks.

## Compose Rules
- At least one hashtag is required to post.
- Task/comment kind changes event behavior.
- `#tags` and `@mentions` are supported in compose text.
- Included channel filters automatically prepopulate compose with matching `#channel` tags.
- Task compose supports optional priority selection.
- Next to the date picker, choose the date type: `Due`, `Scheduled`, `Start`, `End`, or `Milestone`.
- Date-typed tasks appear in Calendar view.
- Tasks with a future `Start` date are shown as not yet doable (greyed out) until that date.
- On mobile, use the submit button in the combined bottom bar to create.

## Table and Calendar Editing
- Table view supports inline priority editing.
- Table view supports inline due date/time/date-type editing.
- Calendar urgency colors shift from yellow (sooner) toward greener tones (farther out).

### Compose keyboard behavior (desktop)
- `Enter` / `Tab` with autocomplete open: insert the highlighted suggestion into text.
- `Ctrl/Cmd+Enter`: submit as the currently selected kind.
- `Alt+Enter` with no autocomplete open: submit as the other kind (Task <-> Comment).
- `Alt/Ctrl/Cmd/Shift+Enter` with hashtag/mention autocomplete open: add the selected tag/mention to publish metadata without inserting token text.

### Search behavior
- Bottom search matches:
  - task/comment text,
  - hashtag and mention chips,
  - posting user identity (username/display name), including resolved names from cached profile metadata.

## Notes
- Nodex is in beta; behavior can evolve as Nostr integrations mature.
