## Onboarding copy overhaul — revision 3

Final pass incorporating all feedback. Only locale files and the intro popover header alignment change.

### Intro popover (app intro, centered title)

- title: "Welcome to Nodex"
- description: "Nodex turns Nostr into a shared workspace — tasks, comments, and threaded discussions that live across relays instead of any single server."
- features: "Organize work with channels, spaces, and people filters; capture ideas as tasks or comments with #tags and @mentions; and switch between Timeline, Tree, Kanban, Table, and Calendar to see the same content from any angle."
- Layout: add `text-center` to the `<h2>` only; description/features and buttons stay as-is.

### Title Case for all step titles

Capitalize content words; keep articles/short prepositions/conjunctions lowercase unless first/last.

### Navigation

- **navigationSwitcher** — "Switch Views"  
"Timeline, Tree, Kanban, Table, and Calendar each show the same tasks from a different angle."  
action: "Switch to any view to continue."
- **navigationFocus** — "Open a Thread"
"Click a post to drill into its subitems, comment on it, or add subtasks."
action: "Click a post to continue."
- **navigationBreadcrumb** — "Step Back Up"
"Each item in the breadcrumb row jumps directly to that level in the hierarchy."
action: "Click your way back to the root to continue."

### Sidebar (purposeful section framing kept)

- **filtersRelays** — "Pick Your Spaces"
"Use the *Spaces* section to choose which spaces are visible. Click the icon of a space to toggle visibility of its posts, or click the name to show its posts exclusively. Colored dots reflect connection status, and the + button opens relay management."
action: "Toggle a space to continue."
- **filtersChannels** — "Filter by Channel"
"Use the *Channels* section to narrow posts by topic. Click a channel name to focus on it, or click the # icon to cycle neutral → include → exclude. The hashtag icon to the left of *Channels* clears all channel filters."
- **filtersPeople** — "Filter by Person"
"Use the *People* section to focus on who's involved. Click a name to show only content involving that person, or click the avatar to toggle content involving them on or off. The icon to the left of *People* clears all people filters."
- **filtersSearch** — "Search Across Views"
"The bar at the bottom narrows visible tasks by text in every view."
- **filtersHashtagContent** — "Hashtags Inside Posts"
"Click a hashtag chip in any post to focus on that tag. Clear the tag filter to return to the full list."
action: "Click a hashtag chip in a post."

### Compose

- **composeKind** — "Task or Comment"
"The kind selector decides whether what you post is a standalone task or a comment on the parent."
action: "Open the kind selector to continue."
- **composeInput** — "Write with #Tags and @Mentions"
"Use #tags to organize and @mentions to reference people. Included channels are added automatically. Setting a date type makes a task appear on the Calendar; future Start dates are shown as not yet doable."
action: "Tip: {{alternateModifier}}+Enter submits as the other kind. With autocomplete open, {{alternateModifier}}+Enter or {{alternateModifier}}+click attaches the suggestion as metadata without inserting its text."

### Mobile

- **mobile.navigationNav** — "Switch Views"
"Use the top navigation to move between Timeline, Tree, Upcoming, and Calendar."
action: "Tap a view to continue."
- **mobile.navigationFocus.action**: "Tap a post to continue."
- **mobile.navigationBreadcrumb.action**: "Tap your way back to the root to continue."
- **mobile.filtersOpen** — "Open the Menu"
"Use the menu to manage spaces, fine-tune filters, and update your profile and settings."
action: "Tap the top-left menu icon to continue."
- **mobile.filtersProperties** — "Edit Your Profile"
"Open the profile editor to update your username, display name, picture, verified address, and about text."
- **mobile.filtersUse** — "Tune Your Filters"
"Tap space chips to pick spaces, channel chips to cycle neutral → include → exclude, and people chips to toggle individuals. Combine them to focus the timeline."
- **mobile.composeCombobox** — "Search and Compose"
"The bottom bar searches as you type and turns the same text into a task or comment with the submit button."
action: "Tap the bar to continue."

### Kanban / Calendar

- **kanbanColumnsStatus** — "Status by Column"
"To Do, In Progress, Done, and Closed track status. Dragging a card across columns updates its status."
action: "Move or open a card to continue."
- **kanbanCreateInColumn** — "Create in Place"
"The + in a column header creates a task directly with that column's status."
action: "Use a column's + to continue."
- **kanbanDepth** — "Choose What to See"
"Levels (next to search) toggles between root tasks, limited subtask depths, and leaves-only — tasks with no subtasks of their own."
action: "Try Top-level, then Leaves only."
- **calendarMonths** — "Scroll Through Months"
"Months stack vertically — scroll continuously to move through time."
- **calendarPickDay** — "Pick a Day"
"Click any day to load it in the detail panel."
action: "Click a day to continue."
- **calendarDayPanel** — "The Day Panel"
"Review tasks for the selected date, change their status, and create a new task or event for that day."

### Files touched

- `src/locales/en/onboarding.json` — all of the above
- `src/locales/de/onboarding.json` — translated equivalents
- `src/locales/es/onboarding.json` — translated equivalents
- `src/components/onboarding/OnboardingIntroPopover.tsx` — add `text-center` to the title `<h2>`
- Onboarding tests asserting removed substrings (e.g. "In *Manage*", old titles) — update strings; prefer semantic queries where feasible

### Verification

- `npx vitest run src/components/onboarding`
- `npm run build` (type-check)
- Visual spot-check at 625×1153 and desktop: confirm popovers wrap cleanly without truncation

### Out of scope

- Step ordering, targets, requiredAction logic, scrim/timing work — unchanged
- Pre-existing unrelated build errors (auth tests, MotdBanner, mobile fixtures) — not addressed here