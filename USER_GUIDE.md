# Nodex User Guide

## Quick Start
- Sign in from the profile menu to post tasks/comments to relays.
- Compose a post with at least one `#channel` tag.
- Choose Task or Comment from the compose kind control.

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
- Click the Channels section header icon to toggle/reset all channels.

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
- Compose publishes to selected active relays.
- If only demo/local relay is selected, item is stored locally (demo flow).

## Mobile Usage
- The view navigation is at the top.
- Open `Manage` for relay, channel, people, profile, and guide controls.
- `Open Guide` in Manage launches onboarding.

## Onboarding Guide
- Open guide from:
  - Desktop sidebar: `Guide`
  - Mobile Manage view: `Open Guide`
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

## Notes
- Nodex is in beta; behavior can evolve as Nostr integrations mature.
