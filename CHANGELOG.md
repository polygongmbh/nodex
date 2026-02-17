# Changelog

All notable changes to Nodex are documented in this file.

The format is inspired by Keep a Changelog and follows Semantic Versioning.

## [Unreleased]
Upcoming improvements in progress.

### Changed
- Calendar view now uses vertically stacked months with dynamic month loading while scrolling (desktop and mobile), shows ISO week numbers, widens the right-side day detail panel on widescreen layouts, and smooths month transitions by removing duplicated boundary weeks.
- Calendar stacked-month styling is now flatter and continuous (without boxed month cards), with slower, non-staggered wheel scrolling for smoother month-to-month flow.
- Calendar month-stack scrolling now uses native continuous scroll behavior to avoid month-by-month stagger effects.
- Onboarding section picker performance and layout were improved with lighter guide targets, reduced overlap, and view-specific guidance (Kanban/Calendar now show dedicated guides instead of compose guidance where compose is not present).

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
