# Nodex User Guide

## Quick Start
- Sign in from the profile menu to post tasks/comments to feeds.
- Guest sign-in starts with a deterministic placeholder username derived from your pubkey.
- When creating a Noas account, typing four or more username characters (with the private-key field still empty) auto-generates a matching vanity key in the background — the resulting `npub` starts with your initials (the first three npub-safe characters), ignoring any characters that can't appear in an npub. A "Mining vanity key…" hint shows while it works; pasting your own key cancels it, and it never overwrites a key you entered. Clicking **Generate** also mines: it uses your username if the field has any content, or produces an `npub` starting with `0` when the username is empty. Pressing **Generate** again while a mine is already running shortens the prefix to two characters so the retry resolves quickly.
- Compose a post with at least one `#channel` tag.
- Desktop: choose Task, Comment, Listing, or Event from the compose kind control.
- Mobile: the bottom-bar send button posts a message in the timeline and a task in upcoming (no kind picker); the tree view keeps task/comment send actions. Attach an event from the timeline's extras button to post a calendar event.
- Optional: set task priority before posting.
- Optional: switch UI language (`EN`/`DE`/`ES`) from the language dropdown in the desktop top-right controls.

## Core Concepts
- Tasks and comments are Nostr events.
- Channels are hashtag-based labels and filters.
- Views share the current context: selected feeds, included/excluded channels, selected people, quick filters, search text, and the focused task when one is active.

## Navigation
- Use the top view switcher to move between Home, Status, Feed, Kanban, and Calendar. Tree and Table are hidden from the top nav but remain reachable via direct URL (`/tree`, `/list`) and the numeric view shortcuts.
- Home is the default landing view on desktop (mobile lands on Status; Home is desktop-only).
- The Home timeline (left) shows top-level activity plus anything that involves you — posts you authored, tasks assigned to you, and activity beneath those. Activating any sidebar channel or person filter lifts that restriction and shows everything matching the filters.
- The Home right column shows My Tasks (same ownership rules as the Status view) above a small month calendar. Days with dated tasks or events carry a dot.
- Clicking a day in the Home mini calendar scopes both panels to that day — the timeline shows posts created or dated that day plus that day's status updates and messages; My Tasks shows your tasks whose dates fall on that day. Clicking the selected day again clears the selection. While a day is selected, new tasks composed in Home pre-fill it as their primary date. The day selection does not affect other views.
- Status highlights active projects, your relevant tasks, and recent task/comment activity for the current context.
- The Status projects row lists active top-level work. Project cards stay in the Status workflow, while clicking an active non-project task opens it in the Feed view.
- Status activity includes task and comment updates. Task activity rows expose a status checkbox for quick state changes.
- Click a task to focus on that task context.
- Feed cards show NIP-25 emoji reaction totals; use the reaction picker on a card to add a quick emoji reaction, or tap your own reaction chip to remove it.
- Feed cards expose post actions: on desktop, use the three-dot menu next to the timestamp; on mobile, swipe a card left to reveal Copy link, React, and Delete when available.
- Use breadcrumb navigation (`All Tasks` / `Up` / parent path) to move through hierarchy.
- Breadcrumb paths stay single-line and left-aligned; page-header breadcrumbs evenly share available width when constrained, while feed-card breadcrumbs use compact capped widths before truncating.
- Kanban uses four status columns: `To Do`, `In Progress`, `Done`, and `Closed`; `Closed` is available from explicit status selection rather than the normal click-cycle toggle.
- In Kanban, use the Levels dropdown near search to switch hierarchy scope:
  - `Top-level`: only root tasks (no parent).
  - `2/3 levels`: include subtasks up to that depth.
  - `All levels`: full parent/subtask hierarchy.
  - `Leaves only`: only end-node tasks with no subtasks.

## Sidebar Projects
- The desktop sidebar's Projects section (above Spaces) lists active top-level tasks that still have open subtasks, with active subprojects (active subtasks that themselves have an active subtask) indented beneath them.
- Clicking a project focuses it, the same as clicking the task elsewhere. The section hides itself when nothing qualifies.
- Clicking the folder icon in the section header goes back to the root, clearing the current focus.
- In every view the Projects section mirrors the breadcrumb for any focused post — task, comment, or note: the rows containing it are highlighted and temporary indented entries trace the path down to the focused post itself, even through posts that are not subprojects. A focused post whose root is not a listed project appears as its own temporary group, so the section also shows up while only such a post is focused (in Home this replaces the breadcrumb bar).

## Channel and Tag Filtering
### Desktop sidebar channels
- Click the `#` icon next to a channel to cycle filter state:
  - `neutral` -> `included` -> `excluded` -> `neutral`
- Click a channel name to show only that channel (`included`) and reset other channels to `neutral`.
- Click the same channel name again while it is the only included channel to clear that exclusive channel filter.
- Visible sidebar channels are selected from feed-scoped activity and personal usage signals, then displayed alphabetically for stable ordering.
- Instance-configured core channels stay visible in the folded sidebar and are bolded in channel lists
  and task tag chips.
- Use the `AND/OR` toggle in the Channels header to control how included channels match:
  - `AND`: items must contain every included channel.
  - `OR`: items must contain at least one included channel.
- Click the Channels section header icon (next to the section title) to toggle all channels:
  - if all are neutral -> set all to included
  - otherwise -> reset all to neutral

### Mobile channel chips
- Every mobile view shows a horizontally scrollable chip row under the nav bar: a *Manage* (burger) chip, a space selector pill, a *Home* chip, then one chip per channel.
- The first chip is the burger/manage menu (moved out of the view switcher); tap it to open or close the *Manage* pane.
- The space selector pill shows the current space's (relay's) icon. Tap it to open a menu with: *All spaces* (no space filter), your connected spaces, then — after a divider — any disconnected spaces, and finally an inline *Connect to another space* URL field (type a `wss://…` address and press Enter or the add button). Selecting a space scopes everything to just that space; *All spaces* clears the filter.
- Channel chips list your pinned channels first (in pin order, shown with a small pin icon instead of the `#`), then the other channels in the same order as the sidebar. Each chip shows the channel's usage count.
- Tap a channel chip to show only that channel; tap it again (or tap *Home*) to clear it back to the home filter. Switching channels this way does not show a toast. Tapping a chip while *Manage* is open also closes *Manage*.
- Every included channel lights up its chip, so a multi-channel scope (selected from the sidebar / *Manage* pane) highlights all of those chips at once; *Home* is highlighted only when no channel is included.
- Long-press a channel chip to pin/unpin it.
- On the feed and status timeline, *Home* shows top-level posts from your pinned channels plus anything involving you (authored, assigned, or replies under your posts). On tree/list/calendar, *Home* simply means no channel filter.

### Content hashtag click behavior
- Clicking a hashtag inside task/comment content adds that tag to the included channel filters without clearing existing channel selections.

### Filter logic
- Included channels respect the Channels match mode toggle (`AND` or `OR`).
- Excluded channels hide items containing any excluded channel.
- When Channels/People are collapsed in the desktop sidebar, selected filters stay visible alongside a compact preview of top entries.
- While a specific task/thread is focused, those folded Channel/People previews only list entries active inside the current focused scope.

## People Filtering
- Desktop:
  - click person avatar/icon to toggle that person.
  - click person name for exclusive person filter.
  - click the same person name again while it is the only selected person to clear the exclusive people filter.
- Mobile (Manage view):
  - tap people chips to toggle selected users.

## Feed Filtering and Publishing
- Feed filter controls determine which items are visible.
- If no default relays are configured and no relay list is stored yet, Nodex probes host-derived relay candidates (`base.`, `feed.`, `nostr.`, `tasks.`) from the current domain and auto-connects only to reachable relays.
- After sign-in, relay enrichment prefers relays from your NIP-65 relay list (`kind:10002`) and only falls back to verified NIP-05 relay hints when needed.
- After sign-in, once a relay is connected, Nodex checks whether the relays already hold your profile (`kind:0`). If none is found, it publishes your current profile so your name/picture show up there; if you already have a profile, it is left untouched. Guest identities are never published this way.
- The demo feed is hidden by default and can be explicitly enabled with `VITE_ENABLE_DEMO_FEED=true`.
- Feed chips show live connection state; selected disconnected feeds block posting/task edits until reconnected.
- Selecting a disconnected feed (toggle, exclusive-select, or select-all) triggers an automatic reconnect attempt.
- If no feeds are selected, channel suggestions/chips behave like all feeds are selected (channel list does not collapse to empty).
- New root tasks require exactly one selected feed.
- Subtasks, task-context comments, and task updates publish to the task's origin feed.
- If only demo/local feed is selected, item is stored locally (demo flow).
- In Relay Management, use debug utilities to copy relay diagnostics JSON or the configured relay URL list.

## Saved Filter Presets
- In the desktop sidebar above Feeds, click `Save current` to store the active filter combination.
- Presets capture selected feeds, channel states, selected people, and Channels `AND/OR` mode.
- Click a preset chip to apply it.
- Click the active preset chip again to clear the active preset and reset filters to defaults.
- Use the preset chip menu to rename or delete a saved preset.

## Mobile Usage
- The view navigation is at the top, with a channel-chip row directly beneath it (see *Mobile channel chips*).
- Top-bar view buttons switch directly between task views; they do not close/reopen Manage unless Manage is currently open.
- Open *Manage* (the burger chip in the channel-chip row) for feed, channel, people, profile, and guide controls.
- In *Manage* (same row as *Open Guide*), use legal actions:
  - `Impressum` opens the imprint dialog section.
  - `Datenschutz` opens the privacy policy dialog section.
  - `Kontakt` opens your mail app via `mailto:`.
- Tap the version label (`vX.Y.Z`) to open the in-app changelog dialog.
- *Open Guide* in *Manage* launches onboarding for signed-out users.
- The bottom bar is a combined search/compose field:
  - typing updates search results live,
  - the send button posts from the same text; in the timeline (Timeline) it posts a **message**, in upcoming (Upcoming) it creates a **task** — neither shows a post-kind picker. The tree/thread view keeps its task/comment send options.
  - the send button only appears once a channel is selected (or a `#hashtag` is typed); until then the bar is a pure search field. If your typed search has no matches and no channel is selected, the empty-results notice adds a line reminding you to select a channel before you can post.
  - in the timeline, a small **extras** button sits to the left of the text field (whenever the send button is shown). It opens a popup to attach media or attach an **event** — the event popup asks for a start date (required) plus optional end date, start and end times, title, and location, and turns the message into a NIP-52 calendar event (all-day when no time is set, timed otherwise; an end time on a single picked day makes a same-day timed event). An attached event shows as a chip you can tap to edit or remove. The timeline hides the task-property second bar, since a message has no due date/priority.
  - while signed out the send button is a sign-in button — tapping it opens the sign-in popup instead of attempting to post.

## Legal Information
- Desktop: the bottom search dock now includes an `Impressum` link next to the version hint.
- Desktop: a compact mail icon next to `Impressum` opens direct contact by email.
- Mobile: legal actions are available in *Manage* next to *Open Guide*.

## Onboarding Guide
- Onboarding is available only while signed out.
- Signed-out users see a short Welcome popover on startup with sign-in / create-account actions. Dismiss it with the close (X) button or by clicking outside it.
- Open guide from:
  - Desktop sidebar: *Guide*
  - Mobile *Manage* view: *Open Guide*
- Desktop sidebar *Guide* and *Shortcuts* actions are directly labeled and no longer show duplicate hover popovers.
- Desktop navigation onboarding now starts by focusing a task, then teaches breadcrumbs, then view switching.
- If breadcrumb context is missing on breadcrumb step entry, the guide auto-activates the first visible task (across views) to surface breadcrumbs.
- On revisiting the breadcrumb step, the guide advances automatically when breadcrumb context disappears (for example after navigating up), instead of forcing repeated interaction.
- Guide popup and spotlight transitions are synchronized and keep anchor stability when target elements appear/disappear during step transitions.
- Choose area overlay:
  - Navigation
  - Filters
  - Compose
- Some steps auto-advance after required interaction.
- If no interaction is detected for a few seconds, `Next` unlocks.

## Compose Rules
- At least one hashtag is required to post.
- If the instance has core channels configured,
  new root posts must include at least one of those core channel tags.
- Profile username (`Name`) follows NIP-05 local-part rules: lowercase `a-z`, digits `0-9`, `.`, `_`, `-`.
- Compose text must include meaningful message content; hashtags/mentions alone are not sufficient.
- Task/comment kind changes event behavior.
- `#tags` and `@mentions` are supported in compose text.
- Uppercase hex color codes such as `#FEE`, `#123FEF`, and `#A1B2C3D4` render as inline color swatches and are not treated as channel tags.
- Included channel filters are added to compose as metadata-only hashtag chips (without injecting `#channel` text).
- Selected people filters are added to compose as metadata-only mention chips.
- Filter/relay confirmation messages use neutral toasts; canceling a delayed publish shows an informational toast.
- Feed-backed posts can use an optional short undo-send delay (disabled by default); when enabled, undo restores the full compose draft state.
- If posting from mobile with no selected/typed channel tag, the app shows immediate feedback instead of silently failing.
- Task compose supports optional priority selection.
- Desktop and mobile composers include `image` and `file` attachment buttons; you can also drag files into the composer or paste clipboard images/files directly, and uploaded files are published as attachment metadata (`imeta`) and shown inline in task views.
- Direct `http/https` image and file URLs typed in content are auto-detected and rendered as embeds/attachment links.
- Links in rendered content are clickable beyond `http/https`: any `scheme://` URL (e.g. `ftp://`, `ssh://`), bare domains (`example.com`), and `mailto:`/`tel:` links — the latter shown without the scheme prefix. Bare international phone numbers (starting with `+` or `00`, E.164 length) become tap-to-call `tel:` links. Filename-like text (`report.zip`, `readme.md`) and unsafe schemes (`javascript:`) are left as plain text.
- Some NIP-96 upload services require NIP-98 authorization; Nodex signs upload requests from the active Nostr signer when needed.
- Profile settings include an experimental opt-in toggle for local on-device image caption inference; when enabled, successful attachment inference can auto-fill image alt text.
- Next to the date picker, choose the date type: `Due`, `Scheduled`, `Start`, `End`, or `Milestone`.
- On mobile, the inline date picker above the bottom bar scrolls horizontally through months (infinite-style strip) without month arrow controls.
- On mobile, tapping the location button captures and attaches current device location directly (when location permission is granted) instead of opening a separate location menu.
- Task location chips now show an approximate coordinate region; tapping a location chip opens the location in your map app/browser.
- When a task status control is disabled, hovering it explains why edits are blocked (for example assigned owner, task owner, sign-in required, or temporary interaction lock).
- Date-typed tasks appear in Calendar view. Tasks with multiple dates appear on each date, and Start/End ranges span every day in the range.
- The calendar's selected-day panel offers both `Create Task` and `Create Event` buttons; `Create Event` opens the composer in Event mode (NIP-52) with explicit Start Date / Start Time / End Date / End Time controls. Times are optional — leaving both sides timeless publishes an all-day event (kind 31922); adding any time promotes it to a timed event (kind 31923).
- Calendar events appear in the feed and on the calendar grid alongside tasks, marked with an `EVENT` label. Their date chip is grey once ended, yellow while active, blue while upcoming. An event without an explicit end counts as active through its start day — and for at least an hour after start, so a timed late-evening event does not grey out at midnight.
- For an all-day event, the End Date you pick is the last day the event runs (inclusive): an event ending `Jun 12` shows on the calendar and stays active through all of Jun 12. On the wire it is published per NIP-52 (the end date is stored exclusively, as the day after), so other Nostr clients show the same range.
- Tree, Kanban, List, and Status cards show a paperclip and attachment count when a post has attachments; Feed and Calendar render attachments inline.
- Tasks with a future `Start` date are shown as not yet doable (greyed out) until that date.
- On mobile, the combined bottom bar's send button creates a message in the timeline and a task in upcoming; the tree view keeps task/comment send options. The timeline's extras button (left of the field) attaches media or an event.

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
- If feed publish fails, the post is queued locally in a failed-publish banner with retry/repost/edit/dismiss actions instead of being treated as a normal published task/comment. Retry and repost rebuild the post from its stored content (not a frozen snapshot), so they reflect the relay set actually targeted. Edit reopens the failed post in the composer to fix and resend, and switches the sidebar's active relays to match the post's original spaces.
- Relays with repeated initial websocket handshake failures are auto-paused and shown with `error` status until explicitly re-enabled.
- Latest feed events are cached locally and rehydrated on app load for better offline/reconnect continuity.
- Task state changes now delay status-driven reorder updates slightly to reduce jarring list/table/kanban jumps during completion transitions.
- Edit profile/setup modal does not open when no feed is connected.
- Current-user profile metadata is cached locally and reused across sidebar/feed/top-right/profile-edit surfaces when live profile fields are temporarily missing.
- Presence status is published with NIP-38 updates (unless disabled in profile settings) and clears on sign-out/tab close.
- Non-feed task views use a shared priority order: due-now/overdue, then in-progress, high priority (`50+`), upcoming due, medium priority (`30-49`), no priority, then low priority (`<30`); Kanban `done` stays chronological.
- Feeds section folding uses measured-height collapse animation for smoother repeated expand/collapse.

## Task Permissions
- Tagged tasks can be modified by tagged users (`p` tags) and the task creator.
- Untagged tasks can be modified by any signed-in user.
- Relay-driven status/date/priority updates from unauthorized users are ignored locally.

### Compose keyboard behavior (desktop)
- `Enter` / `Tab` with autocomplete open: insert the highlighted suggestion into text.
- `Ctrl/Cmd+Enter`: submit as the currently selected kind.
- `Option+Enter` (macOS) / `Alt+Enter` (other platforms) with no autocomplete open: submit as the other kind (Task <-> Comment).
- With hashtag/mention autocomplete open, use `Option+Enter` (macOS) / `Alt+Enter` (other platforms) to add the selected tag/mention as publish metadata only (no token text insertion).
- With hashtag/mention autocomplete open, use `Option+click` (macOS) / `Alt+click` (other platforms) on an option to add publish metadata only (no token text insertion).
- In the mobile combined composer, `Alt+Enter` while typing a hashtag token adds that hashtag as metadata-only, even for new tags.

### Search behavior
- Bottom search matches:
  - task/comment text,
  - hashtag and mention chips,
  - posting user identity (username/display name), including resolved names from cached profile metadata.
- The active search query is mirrored to the URL as `?q=`, so a filtered view is shareable and browser back/forward restore it. Focusing into a sibling/child/unrelated task clears the search; focusing up or unfocusing back to the global view preserves it.
- The browser tab title tracks your context: with a post focused it shows that post's content, otherwise the current view name, always suffixed with the instance host (e.g. `Kanban — talk.nodex.io`) so several open Nodex instances stay easy to tell apart in tabs and history.

## Notes
- Nodex is in beta; behavior can evolve as Nostr integrations mature.
