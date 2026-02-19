# Changelog

All notable changes to Nodex are documented in this file.

The format is inspired by Keep a Changelog and follows Semantic Versioning.

## [Unreleased]

## [1.8.1] - 2026-02-19
- Sidebar footer no longer shows redundant hover popovers for Guide and Shortcuts actions.

## [1.8.0] - 2026-02-19
Improved guest identity defaults and live profile-name validation for NIP-05 compatibility.
- Guest sign-in no longer pre-fills the profile display name.
- Profile username validation now enforces live NIP-05 local-part rules (`a-z`, `0-9`, `.`, `_`, `-`) while typing in desktop and mobile profile editors.
- Guest usernames are now deterministic, gender-neutral placeholders generated from pubkey (`guest_<word>_<word>`).

## [1.7.3] - 2026-02-19
- Entire task area is now clickable to focus in Feed, Kanban, and Calendar views.
- Clicking a hashtag not present in the sidebar now adds it and filters exclusively for it.

## [1.7.2] - 2026-02-19
### Changed
- Refined table view responsive layout to prioritize task-text readability by reducing metadata pressure across desktop breakpoints.
- Composer date/time and priority controls now use tighter sizing for denser desktop composition.
- Table tags column now scales more smoothly with viewport width and gets an immediate larger allocation at `2xl` while continuing to grow on wider screens.

### Fixed
- Table date-type labels in the date column now use localized strings instead of hardcoded English labels.
- Theme token and sizing-unit consistency was improved across UI surfaces by reducing hardcoded color and measurement drift.

## [1.7.1] - 2026-02-18
- Mobile quick-filter search now falls back to showing all tasks when there are no matches, with an inline indicator.
- Guide auto-start is now suppressed when opening the app directly into a focused subtask URL.

## [1.7.0] - 2026-02-18
Stabilized task ordering, expanded event/profile sync, and unified mobile compose behavior.
### Added
- Toasts can now be dismissed by tapping them.

### Changed
- Task state transitions now use smoother reorder behavior in Tree view.
- Event synchronization now fetches feed history and kind:0 profile metadata exhaustively.
- Mobile compose now uses a unified send flow with clearer inline posting guidance.

### Fixed
- Sending now requires meaningful message text beyond hashtags and mentions in desktop and mobile composers.
- Mobile Manage now includes language selection controls.
- Mobile compose/search input handling is more stable during focus and clear interactions.
- iOS browser chrome coloring now stays aligned with the active app theme while typing.
- Desktop profile editor now behaves correctly at low viewport heights.

## [1.6.0] - 2026-02-18
Introduced completion feedback, Spanish localization, and broad UX/i18n refinements.
### Added
- Gentle task-completion feedback with celebratory animation and optional completion sound.
- Spanish (`es`) language support with runtime language switching.

### Changed
- Popup and selector enter motion is smoother with reduced-motion fallbacks.
- Localization coverage expanded across key task, calendar, relay, and accessibility surfaces.
- Default language resolution now respects browser/system language order.

### Fixed
- Status-driven task reorder timing was improved to reduce abrupt jumps.

## [1.5.1] - 2026-02-18
- Mobile compose priority/date controls were improved for touch use, and the inline date picker now supports full-width horizontal month scrolling.

## [1.5.0] - 2026-02-18
Expanded presence publishing and compose metadata controls across desktop and mobile.
### Added
- Presence publishing now supports NIP-38 `kind:30315` active/offline status updates with privacy control.
- Desktop composer now supports chip-based priority/date metadata controls.

### Changed
- Mobile compose moved to dedicated task/comment send actions.
- Mobile onboarding guidance for Manage/filter flows is more targeted.
- Table and desktop search layouts were updated for clearer high-density usage.
- Compose mention previews now prefer known usernames over raw identifiers.

### Fixed
- Mobile compose due-date/date-type controls now avoid overflow and hidden actions.
- Mobile Manage scroll/profile setup flows and sign-in overlay layering were stabilized.
- Table view now shares compose draft state with Feed/Tree.
- Task status interaction behavior was stabilized for done-state reopening and hints.
- Presence and current-user profile metadata handling were hardened across reload/sign-out.

## [1.4.1] - 2026-02-18
### Added
- Failed publish queue with retry/dismiss actions for relay publish failures.

### Changed
- Recent feed events are cached and rehydrated on startup.
- Priority badges are shown in feed/tree cards.
- Content URL parsing now uses `linkify-it`.
- Feed cache lifecycle is managed through React Query.
- Non-feed task views share a consistent priority ordering strategy.

### Fixed
- Failed relay publishes are no longer shown as normal local posts.
- Profile setup/edit modal no longer auto-opens without an active relay.
- Due-date and priority property updates now hydrate reliably after reload.
- Feed author metadata layout remains stable on wider desktop widths.

## [1.4.0] - 2026-02-17
Expanded relay-aware publishing, priority editing, and localization foundations.
### Added
- Relay-scoped task lifecycle rules for root tasks, subtasks/comments, and updates.
- Optional task priority selection in desktop and mobile compose flows.
- Priority property update helper and relay-routing utilities.
- Runtime language switching foundation (`en`/`de`) with persisted preference.

### Changed
- Task priority and due-date update semantics were integrated into the task model and editors.
- Table view now supports inline priority and date editing with event publishing.
- Compose and navigation/auth copy moved to translation-key-driven localization.
- Task/date urgency and desktop layout behavior were improved across views.

### Fixed
- Root task creation now blocks invalid multi-relay submission.
- Compose failure handling now preserves drafts and surfaces errors on desktop/mobile.
- Metadata-only channel selections now publish explicit `t` tags.
- Relay filtering now handles missing inbound relay metadata safely.
- Table priority select focus/open behavior was stabilized.
- Task publish kind resolution now safely defaults malformed values to `task`.

## [1.3.0] - 2026-02-17
Improved calendar/table workflows and introduced dedicated view-specific onboarding guidance.
### Added
- Dedicated desktop Kanban and Calendar onboarding guides.

### Changed
- Calendar supports stacked-month infinite scrolling with improved day panel behavior.
- Table layout and chip overflow behavior were unified and improved for varying widths.
- Feed sidebar relay controls now follow consistent toggle/exclusive behavior.

### Fixed
- Comment creation is now limited to Feed and Tree; other views create tasks.

## [1.2.2] - 2026-02-17
- Version bump and release tagging housekeeping.

## [1.2.1] - 2026-02-17
- Guides now document current compose shortcut behavior.
- Task compose now supports date type selection (`Due`, `Scheduled`, `Start`, `End`, `Milestone`), and future-start tasks are treated as not yet doable.

## [1.2.0] - 2026-02-17
Strengthened mention handling, compose/search behavior, and people-filter reliability.
### Changed
- Mention autocomplete now prefers human-friendly identifiers and improved preview chips.
- Browser-extension sign-in now completes immediately while profile hydration continues in background.

### Fixed
- Mention resolution/publishing to Nostr `p` tags is more reliable.
- Hashtag and mention autocomplete modifier flows now support metadata-only insertion.
- Alt+Enter behavior now respects autocomplete context before alternate-submit behavior.
- Autocomplete dropdown sizing and truncation behavior were improved for long entries.
- Task text search now includes chips and author identity metadata.
- Sidebar people filtering/listing and online presence heuristics were stabilized.
- Mention/tag parsing and rendering edge cases were fixed across feeds and chips.
- Malformed people-filter payloads no longer crash the app.

## [1.1.0] - 2026-02-16
Introduced guided onboarding and unified bottom search/compose workflows.
### Added
- Onboarding now includes dedicated search/compose guidance improvements.

### Changed
- Desktop search moved to a shared bottom dock across views.
- Manual guide starts now integrate with global step sequencing and back navigation.
- Onboarding and sidebar footer copy/layout were streamlined.

### Fixed
- Guide activation/auto-advance timing was stabilized across repeated starts and URL/view transitions.
- Overlay targeting and section picker dismissal behavior were improved.
- Sidebar clipping/scroll edge cases were resolved.

## [1.0.0] - 2026-02-16
Launched the 1.0 baseline with Nostr-native tasks/comments, onboarding, and CI validation.
### Added
- Guided onboarding improvements across desktop and mobile.
- Unified mobile search/compose flow upgrades with stronger keyboard and filter integration.
- Improved mention/reference handling for compose and search.
- In-app semantic version visibility and CI validation on push/PR.

### Changed
- Sidebar channel/people filter interaction model was clarified and standardized.
- Feed identity rendering now consistently prefers kind:0 profile metadata.
- Top-left Nodex brand now links to `/`.

### Fixed
- Onboarding step progression and interaction gating edge cases across view transitions.
- Mobile profile/setup and unified compose/filter synchronization edge cases.
- Cross-view task/status interaction consistency and lint/a11y reliability issues.
