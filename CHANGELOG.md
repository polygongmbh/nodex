# Changelog

All notable changes to Nodex are documented in this file.

The format is inspired by Keep a Changelog and follows Semantic Versioning.

## [Unreleased]

### Changed
- Sidebar footer utilities now use flatter controls with always-visible labels; on narrow sidebars only the Guide control remains visible to reduce crowding.
- Manually launched onboarding sections now jump into the global all-steps sequence (preserving original step numbers), allow backward navigation across prior steps, and remove skip/next delay gating.
- Filter onboarding now includes a dedicated search bar step, with consistent search-bar targeting across desktop views.
- Desktop search input is now centralized in a single shared dock outside individual view components, with Kanban level controls preserved in the same dock.
- Compose guide selection now uses a stable activation signal plus section-context preservation and desktop feed coercion, ensuring compose force-open works on first and repeated manual starts.
- Compose guidance steps now use collision-scored panel placement with target clearance, minimizing overlap and keeping the highlighted compose target unobstructed.
- Guide section picker now dismisses when clicking outside the highlighted selection panes.
- Desktop area-picker guidance text now lives in a bottom helper/action bar with Close, avoiding overlap with the top navigation target area.
- Onboarding guide cards now cap desktop width and prioritize non-blocking placement for hashtag-content guidance; mobile area-picker guidance is pinned to a bottom helper/action bar with Close.
- The hashtag-content onboarding step now anchors guide placement directly below the highlighted hashtag target and uses shorter filtering guidance text.
- Desktop onboarding no longer force-opens compose during the hashtag-content step; compose now opens when entering the compose step.
- Desktop onboarding pre-opens compose on the hashtag-content step so the compose-step guide appears after layout has settled.

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
