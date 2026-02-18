# Changelog

All notable changes to Nodex are documented in this file.

The format is inspired by Keep a Changelog and follows Semantic Versioning.

## [Unreleased]

### Changed
- Mobile compose now replaces the Task/Comment mode toggle with dedicated send actions: task send is always available, and comment send appears in feed/tree views.
- Mobile task/comment send actions now share equal visual weight and use clearer icons with consistent action styling for faster recognition.
- Mobile onboarding now uses more precise Manage/filter highlight targets and adds earlier, more detailed guidance for profile properties and filter controls.

### Fixed
- Mobile compose due-date controls are now split into two rows, and the date-type selector only appears after a date is selected, reducing horizontal overflow that could push nearby actions off-screen.
- Mobile send actions now provide immediate feedback when posting text without any selected/typed channel tag, instead of silently doing nothing.
- Mobile Manage view now scrolls correctly within the panel instead of clipping long settings/filter content.
- After mobile sign-in with no cached profile metadata for the signed-in user, the app now redirects to Manage and auto-opens the profile edit pane.
- Mobile sign-in prompt overlay now correctly covers all mobile UI layers, including the bottom compose bar.
- Mobile profile setup/manage editor no longer flickers between setup/edit states due to repeated profile-sync reruns.

## [1.4.1] - 2026-02-18

### Added
- Failed-publish queue for compose submissions: when relay publish fails, the post is now stored in local storage and surfaced in a red retry banner (desktop/mobile) with explicit retry and dismiss actions.

### Changed
- Latest Nostr feed events are now cached locally and rehydrated on load so recent posts remain visible offline or during relay reconnect windows.
- Feed/tree cards now render task priority badges (`P<n>`) so parsed priority is visible outside table editing controls.
- Content link parsing now uses `linkify-it` for more robust URL detection around punctuation/edge cases.
- Nostr feed cache lifecycle now runs through React Query instead of page-local state wiring, reducing cache drift risk.
- Non-feed task views now share a consistent priority order: due-now/overdue first, then in-progress, high priority (`50+`), upcoming due, medium priority (`30-49`), no priority, and low priority (`<30`) with latest modification time as tie-breaker; Kanban `done` remains chronological.

### Fixed
- Failed relay publishes are no longer inserted as normal local tasks/comments, preventing misleading local-only entries after refresh.
- Profile setup/edit modal no longer auto-opens (or opens from menu) when no relay connection is active.
- Newly published tasks now persist due dates reliably after reload by routing initial due-date publish events to the known origin relay during create/retry flows.
- Priority property update notes are now kept in the inbound event pipeline, so edited priorities hydrate correctly after refresh.
- Feed author identity metadata now stays inline on widened desktop layouts (after the sidebar expands), avoiding unnecessary line breaks between display name and secondary identity text.
- Priority property tags are now also hydrated when they arrive on task state/property events (`kind:1630/1631/1632/1633/1639`), matching mostr-cli behavior.

## [1.4.0] - 2026-02-17
Expanded relay-aware task publishing, priority editing, and English/German localization across key task flows.

### Added
- Relay-scoped task lifecycle rules:
  - New root tasks require exactly one selected relay.
  - Subtasks, task-context comments, and task updates now route to the task origin relay.
- Task creation now supports optional priority selection in both desktop composer and mobile unified compose/search bar.
- New Nostr helper for priority property updates (`kind:1` with `priority` tag and `e` `property` marker), plus relay-routing utilities.
- Internationalization foundation with runtime language switching (`en`/`de`) and persisted language preference.

### Changed
- Task priority is now part of the task model and is hydrated from base tags and latest property update events.
- Task due-date update events now use stable `d` identifiers per task/date-type for editable update semantics.
- Table view now supports inline due date/time/date-type editing and inline priority editing with event publishing.
- Key task compose and mobile unified-bar copy/toasts are now translation-key-driven.
- Localized remaining navigation/auth guide surfaces, including German `Hierarchisch` (formerly `Baum`), shortcuts/help copy, onboarding guide content/UI labels, breadcrumb labels (`All Tasks`/`Up`), and sign-in/profile-edit/sign-out flows.
- Due date urgency colors now transition from yellow (near upcoming dates) toward progressively greener tones for farther future dates.
- Compose post-type selector is now styled as a clearer segmented control on desktop/mobile, and remaining Task/Comment/Mentions compose labels/tooltips are fully translation-key-driven.
- German sign-in status wording now distinguishes guest login (`Angemeldet als Gast`) from other methods (`Angemeldet über …`).
- Desktop top navigation no longer scrolls horizontally; on smaller widths the German sign-in CTA is shortened to `Anmelden`.
- Feed author labels now shorten raw pubkey fallbacks on slimmer desktop widths while keeping full pubkeys on wider desktop layouts.
- Kanban columns now expand on wider desktop breakpoints for higher information density and reduced clipping.
- Desktop top navigation tabs now use wider spacing and horizontal hit areas on wide screens for easier targeting.
- Mobile feed cards now use a denser meta layout (short relative time, tighter spacing, truncated author header, and reduced secondary metadata) to cut noisy wrapping on slim screens.

### Fixed
- Root task creation now blocks invalid multi-relay submissions with clear guidance: `Select one relay or a parent task`.
- Task creation is now failure-safe across desktop and mobile compose flows: failed submissions no longer clear drafts or close contextual composers, and critical submit failures are explicitly surfaced instead of silently dropping.
- Compose metadata-only channel selections now publish explicit Nostr `t` tags, so events remain discoverable and visible after reload even when hashtags were not inserted into content.
- Relay filtering now keeps events visible when relay metadata is missing on inbound NDK events, avoiding false negatives in filtered task lists.
- Table-view priority `<select>` controls now stay open and keyboard-usable by suspending global task-navigation hotkeys while native select elements are focused.
- Table-view priority `<select>` controls now also remain stable during background list rerenders, preventing abrupt auto-close while open.
- Task publish kind resolution now normalizes malformed submit `taskType` values and safely defaults to `task`, preventing fresh task posts from reloading as comments.

## [1.3.0] - 2026-02-17
Introduced major calendar, table, and onboarding upgrades with view-specific guide flows and cleaner filter/compose behavior.

### Added
- Dedicated desktop Kanban and Calendar guide flows with section-local numbering.
- Kanban guide includes status behavior and creating tasks directly in specific columns.

### Changed
- Calendar now supports continuous stacked-month scrolling with dynamic month loading across desktop/mobile, ISO week numbers, a wider day-details panel on widescreens, smoother upward loading, and synced month indicator updates in the day panel.
- Table view now prioritizes task text on smaller screens, gives more space to tags on larger screens (including full chip display on wide layouts), and uses compact status/priority columns on smaller screens.
- Tag/mention chip overflow behavior is now shared between Kanban and Table via a reusable chip-row component, reducing UI inconsistency.
- In *Feeds* sidebar controls, icon clicks now toggle relays while relay name clicks switch to solo/exclusive relay view, matching People/Channels semantics.

### Fixed
- Comment creation is now limited to Feed and Tree views; all other views create tasks only.

## [1.2.2] - 2026-02-17
Maintenance release for version alignment and tagging.

### Changed
- Version bump and release tagging housekeeping.

## [1.2.1] - 2026-02-17
Added focused guide updates for compose keyboard flows.

### Changed
- In-app and markdown guides now document current compose shortcut behavior, including `Alt+Enter` submit-vs-metadata rules and metadata-only tag/mention autocomplete usage.
- Task compose now supports date type selection (`Due`, `Scheduled`, `Start`, `End`, `Milestone`) alongside the date picker, and future `Start` tasks render as not-yet-doable across task views.

## [1.2.0] - 2026-02-17
Introduced robust `@` user mentions and smarter cross-view search, with faster compose/autocomplete and a more useful sidebar people list.

### Changed
- Mention autocomplete now shows human-friendly usernames while inserting NIP-05 identifiers when available (falling back to pubkeys), and compose preview chips render person mentions before hashtag/channel chips.
- Browser-extension sign-in now completes immediately after identity resolution, while profile/NIP-05 hydration continues in the background.

### Fixed
- Publishing now resolves `@` mentions from NIP-05/user aliases to pubkeys more reliably and includes corresponding Nostr `p` tags in posted events.
- Retrieved mention tags now parse case-insensitively (`p`/`P`), and modifier+Enter in `@` autocomplete can add mention pubkey tags without inserting mention text.
- Modifier+Enter in hashtag autocomplete now adds the selected hashtag as a publish tag without inserting hashtag text into the compose message.
- Alt+Enter now follows autocomplete context: with open hashtag/mention suggestions it applies tag-only selection, and alternate submit only triggers when no autocomplete dropdown is open.
- Compose autocomplete dropdowns now cap height, scroll internally, and truncate long labels (including compact pubkey mention labels), with slightly taller suggestion lists for easier scanning.
- Task text search now also matches task chips (hashtags/mentions) and posting-user identity fields (username/display name), including names resolved from cached people metadata when task events only include pubkeys.
- Sidebar people list now shows identities with at least three posts, sorts them by most recent post first, and marks users online only when they posted within the last three minutes.
- Retrieved indexed Nostr person references (`#[n]`) now resolve into mention tokens, and uppercase `T` hashtag tags are parsed consistently in filters/channels.
- Feed and shared task content now render resolved `@mentions` as user-linked labels (for example `@alice` instead of raw pubkeys when profile data is known).
- Task assignment authority now prefers explicit assignee pubkeys (`p` tags), with task creation defaulting unassigned tasks to the author pubkey.
- Mobile compose now forwards explicit mention-tag selections in the correct publish payload field, so non-text person mentions persist as Nostr `p` tags.
- Desktop task views now surface non-text mention tags as person chips, and compose drafts preserve explicit mention-tag-only selections until submit.
- Task filtering no longer hides tasks just because they contain many hashtags.
- Kanban task cards now let you click the `+x` chip overflow indicator to expand and reveal all chips.
- Sidebar channels now stay focused on most-used tags, while compose hashtag autocomplete can suggest all known tags.
- Desktop sidebar people now show only identities with at least six known posts, while `@` autocomplete continues to include everyone.
- Enabling people filters no longer crashes on malformed mention/author payloads, and uncaught runtime errors now render a recoverable error screen instead of a blank app.

## [1.1.0] - 2026-02-16
Introduced guided onboarding and a unified bottom search/compose workflow across views.

### Added
- Onboarding now includes a dedicated search-bar guidance step and improved compose guidance flow with explicit task/comment compose controls.

### Changed
- Desktop search is now centralized in a shared bottom dock across views, with Kanban depth controls aligned in the same dock.
- Manual guide starts now enter the global step sequence, preserve original step numbering, and support back navigation.
- Onboarding copy and helper text were clarified for section selection, search scope, hashtag filtering, and compose tags/mentions guidance.
- Sidebar footer controls were redesigned to flat, labeled controls with improved spacing and responsive behavior.

### Fixed
- Compose guide activation is deterministic across repeated manual starts, with compose pre-open timing aligned to stable guide positioning.
- Guide overlays now avoid blocking highlighted targets more reliably (including hashtag-content steps), with improved target measurement after layout shifts.
- Section picker can be dismissed by clicking outside highlighted panes, and step side effects are gated by step IDs.
- Back-navigation in onboarding no longer reintroduces next-step delay on revisited required-action steps.
- Sidebar list clipping and scroll behavior were adjusted so trailing entries remain reachable.

## [1.0.0] - 2026-02-16
Launched Nodex 1.0 with Nostr-native tasks/comments, cross-view workflows, and a production-ready baseline.

### Added
- Interactive onboarding improvements across desktop and mobile, including guided navigation/composition flows with clearer highlights and better step progression.
- Mobile unified compose/search flow updates, including shared content behavior, keyboard submission parity, and tighter hashtag/person/relay quick-filter interactions.
- Author mention and reference improvements for compose/search flows with Nostr-compatible mention publishing.
- Semantic version tracking in-app via a top-left Nodex hover version hint.
- GitHub Actions CI validation now runs lint, tests, and build on push/PR.

### Changed
- Sidebar channel and people filters now use distinct exclusive-vs-toggle click targets (text vs icon/avatar), with updated guide copy to match behavior.
- Feed identity rendering now consistently prefers kind:0 profile metadata and improved fallback handling for pubkeys.
- Hover hints were expanded across navigation, filter, and task-focus controls for clearer affordance.
- The top-left Nodex brand text now links to the start page (`/`).

### Fixed
- Onboarding auto-advance edge cases across URL/view transitions, including step sequencing and interaction gating.
- Mobile profile setup and manage interactions, including reduced layout breakage from long pubkeys.
- Filter and compose synchronization edge cases in the unified bottom bar, including hashtag removal and neutral-state handling.
- Status and task interaction behavior consistency across views (feed/tree/kanban/calendar) during recent refinement passes.
- Lint pipeline reliability by excluding generated artifacts and resolving blocking lint rule violations in runtime and tests.
- Accessibility refinements for muted-text contrast and view position indicator semantics.
