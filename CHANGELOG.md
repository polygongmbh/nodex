# Changelog

All notable changes to Nodex are documented in this file.

The format is inspired by Keep a Changelog and follows Semantic Versioning.

## [Unreleased]

### Changed
- Sidebar footer utilities now use flatter controls with always-visible labels; on narrow sidebars only the Guide control remains visible to reduce crowding.
- Manually launched onboarding sections now jump into the global all-steps sequence (preserving original step numbers), allow backward navigation across prior steps, and remove skip/next delay gating.
- Selecting the Compose onboarding section now immediately reports compose context so the compose window is forced open as soon as guide guidance starts.
- Filter onboarding now includes a dedicated search bar step, with consistent search-bar targeting across desktop views.

## [1.0.0] - 2026-02-16

### Added
- Interactive onboarding improvements across desktop and mobile, including guided navigation/composition flows with clearer highlights and better step progression.
- Mobile unified compose/search flow updates, including shared content behavior, keyboard submission parity, and tighter hashtag/person/relay quick-filter interactions.
- Author mention and reference improvements for compose/search flows with Nostr-compatible mention publishing.
- Semantic version tracking in-app via a top-left Nodex hover version hint.

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
