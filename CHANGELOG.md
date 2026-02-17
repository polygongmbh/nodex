# Changelog

All notable changes to Nodex are documented in this file.

The format is inspired by Keep a Changelog and follows Semantic Versioning.

## [Unreleased]

### Changed
- Mention autocomplete now shows human-friendly usernames while inserting NIP-05 identifiers when available (falling back to pubkeys), and compose preview chips render person mentions before hashtag/channel chips.

### Fixed
- Publishing now resolves `@` mentions from NIP-05/user aliases to pubkeys more reliably and includes corresponding Nostr `p` tags in posted events.
- Retrieved mention tags now parse case-insensitively (`p`/`P`), and modifier+Enter in `@` autocomplete can add mention pubkey tags without inserting mention text.
- Enabling people filters no longer crashes on malformed mention/author payloads, and uncaught runtime errors now render a recoverable error screen instead of a blank app.

## [1.1.0] - 2026-02-16

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
