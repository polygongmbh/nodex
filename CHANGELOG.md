# Changelog

All notable changes to Nodex are documented in this file.

The format is inspired by Keep a Changelog and follows Semantic Versioning.

## [Unreleased]
- Relay status indicators now distinguish `read only` from `connecting`, explain that `read only` relays can still receive data but not publish, and use a distinct icon for read-rejected relays.
- Profile setup now auto-opens only once per required-setup cycle and remains dismissible if saving the profile fails.
- Newly added relays now use a short connection-attempt grace window instead of lingering in `connecting`, are immediately activated in feed filters, and no longer trigger feed-section fold animations while relay lists update.
- Broad relay backfill subscriptions now clamp their message limits to device-class caps, reducing the chance of browser overload on lower-end systems while preserving targeted lookups.
- Relay and event-cache persistence now handles browser storage quota pressure without crashing the app, keeps only recent event-cache entries (7-day window with per-scope caps), and evicts least-recently-used stale scopes first when recovery is needed.
- First-run host-derived relay detection now retries probe misses, safely handles storage-cache failures, and falls back to optimistic host candidates so discovered feeds still appear reliably (including Safari startup cases); after onboarding is finished or dismissed, signed-out users are now prompted to sign in when all detected relays require authentication for reading.

## [1.17.2] - 2026-03-13
- Added a runtime persistence guard that can be enabled via `?nodexNoStorage=1` (or `VITE_DISABLE_CLIENT_PERSISTENCE=true`) to disable browser local/session storage, cookie writes, and browser cache APIs for the active session.
- Desktop onboarding now starts with task focus and keeps navigation guidance ordered as task focus -> breadcrumbs -> view switching.
- Breadcrumb onboarding flow is now stable across first pass and revisits: task auto-focus runs once when needed, breadcrumb interaction advances the step, revisits auto-advance only after breadcrumb context disappears, and the channels step no longer gets skipped.
- Breadcrumb auto-activation now works consistently across views (including non-feed layouts) by targeting focusable task descendants when row wrappers are not directly clickable.
- Guide popup/backdrop positioning now keeps anchor stability while breadcrumb targets unmount and uses synchronized motion timing to reduce transition jank.
- Starting the onboarding tour with no available tasks now auto-loads the demo feed for the session so navigation steps have usable target data.
- Demo relay bootstrap now seeds reusable fixture events and stable demo `kind:0` profile metadata so People filters populate correctly and metadata is not overwritten after relay activation.

## [1.17.1] - 2026-03-08
- Added an in-app legal dialog with German Impressum and Datenschutzerklärung content, linked from the desktop bottom-right dock next to the version hint, including a compact contact mail icon.
- Added dedicated mobile legal actions in the Manage guide section with separate `Impressum`, `Datenschutz`, and `Kontakt` buttons.

## [1.17.0] - 2026-03-06
Promoted Feed-first navigation defaults, improved publish/filter ergonomics, and refined breadcrumb/status presentation across locales.
- Feed is now the first/default task view across routing, desktop/mobile view switchers, swipe order, and numeric view shortcuts (`1` now opens Feed).
- Host-fallback relay discovery was hardened with deterministic probe ordering, short-term probe caching, more robust persisted relay recovery, and cleaner runtime diagnostics.
- Clicking an already-sole active feed now toggles it off, and state-update cards now avoid localized duplicate labels while formatting custom status text as `State: detail`.
- Subtask/subitem posting now falls back to parent hashtags when no explicit tags are provided, including mobile compose parity for parent-focused sends.
- Focused breadcrumb rows no longer stretch short task labels across available width, while long labels continue truncating safely.

## [1.16.5] - 2026-03-06
- Relay connections now auto-attempt reconnect when returning to a previously inactive tab (visibility/focus/online resume), improving recovery after idle background periods.
- Startup host fallback relay discovery now probes host-derived relay candidates in deterministic order (`nostr.`, `feed.`, `tasks.`, `base.`), while still auto-connecting only to reachable relays.
- Successful host-fallback probe results are now cached for 30 minutes per host/protocol so discovered relays reconnect quickly on repeat loads.
- Host-fallback WebSocket probe timeout handling no longer force-closes in-flight sockets, reducing Firefox "connection interrupted while page was loading" console noise during fallback discovery.
- Host-fallback cache now ignores stale cached relay URLs that no longer match current host-derived candidates, preventing empty relay lists when valid probes should run.
- Feed filter state now auto-initializes to currently available relays when persisted relay IDs do not match discovered relays, so newly discovered feeds are immediately active and usable.
- NDK provider now mirrors resolved default/discovered relay URLs into relay state immediately, so discovered feeds show in the sidebar even before relay-pool status events arrive.
- Successful host-fallback relay discoveries are now persisted into relay storage and automatically reused on subsequent app loads.
- Feed view now renders task state changes as standalone compact timeline items with the referenced task shown as breadcrumb context.
- Desktop search now shows an inline clear (`x`) control whenever a query is present, allowing one-click reset.
- Desktop bottom search dock now keeps spacing in a single responsive padding layer and places the version hint inline in the dock row to avoid overlap.
- Breadcrumb labels no longer pre-abbreviate task text, now stay left-aligned on a single line, share available width evenly in constrained page breadcrumbs, and use compact capped widths in task-card breadcrumbs before truncating.

## [1.16.4] - 2026-03-06
- Task/comment location chips now resolve geohashes to rough coordinates in-chip and open the mapped location directly in a map app/browser when tapped.
- Disabled task status controls now explain why editing is unavailable via hover title text and include richer assignee/owner identity details when known.

## [1.16.3] - 2026-03-05
Refined relay bootstrapping defaults and mobile compose location flow while reducing default demo noise.
- When no default relays are configured via env and no relay list is persisted, startup now probes host-derived relay candidates (`base.`, `feed.`, `nostr.`, `tasks.`) based on the current domain and auto-connects only to reachable relays.
- After sign-in, complementary relay enrichment now prefers NIP-65 (`kind:10002`) relay lists and only falls back to verified NIP-05 relay hints when no NIP-65 relay list is available.
- The demo feed relay and seeded demo tasks are now hidden by default and can be explicitly enabled with `VITE_ENABLE_DEMO_FEED=true`.
- Mobile composer location now captures and attaches device geolocation directly from the location button instead of opening a separate location selector panel.
- Undo-send delay now defaults to off for new installs until explicitly enabled in preferences.

## [1.16.2] - 2026-03-04
- Top-level comments/offers/requests now preserve selected relay targets, and published post metadata records only relays that actually acknowledged publish while root tasks/threaded comments remain single-origin routed.
- Multi-relay publish now runs per-target relay attempts (instead of first-ack short-circuiting) with a longer per-relay timeout, improving delivery reliability.
- Relay-scoped visibility now preserves multi-relay attribution for the same event ID (including root comments during local+fetched merge), so relay filters no longer collapse items to a single acknowledged relay.
- Relay write rejections now mark affected relays `read only` only for explicit publish denials (including NIP-01 `OK false`), and partial publish success now warns when only a subset of selected relays accepted the event.
- Selecting disconnected feeds now consistently triggers reconnect attempts across toggle, exclusive-select, and select-all actions.
- Clearing feed selection now keeps sidebar channels populated using all feeds for channel derivation, matching all-feeds scope instead of showing an empty channel list.
- Feed deduplication for NIP-99 listings now falls back to event ID when `d` is missing, preventing duplicate active/sold entries during status updates.
- Load/resize performance improved via sorting-path optimizations, batched task-author profile lookups, debounced Nostr cache persistence, and desktop lazy-loading/vendor chunk splitting for task views.

## [1.16.1] - 2026-03-04
Stabilized relay failure handling and publish feedback, while improving relay controls and profile hint visibility.
- Relay Management now includes a per-relay `Reconnect` action to force a fresh connection attempt without removing and re-adding the relay.
- Relay status no longer sticks in `read only` on generic publish failures; that state is now reserved for explicit write rejection/auth-required outcomes.
- Relay list edits are now persisted locally, and manually removed relays no longer reappear as disconnected entries after background relay reconciliation.
- Enabling a non-green relay from sidebar feed filters now triggers an automatic reconnect attempt.
- Auth-required publish rejections now mark the affected relay `read only` again (including single-target fallback when relay URL is omitted) and retry toasts now include relay rejection reason text when available.
- Failed-publish queue actions are now scope-aware (`Retry` only when selected feeds include an original relay target, `Repost` only when a different selected feed exists) and show in-progress action state while retry/repost runs.
- Queued post failure toasts now include relay rejection detail when available, including single-relay URL context for clearer publish diagnostics.
- Relay rejection reason extraction now reads nested NDK publish error payloads (including inner `OK` tuples), fixing missing reason text in queued publish toasts.
- Relay rejection parsing now explicitly handles NDK `NDKPublishError.errors` map payloads (including non-enumerable class fields), fixing missing relay URL/reason in single-relay publish failures.
- Top-right profile dropdown trigger now shows a hover hint with account name and full pubkey when signed in.
- Nostr publish timeout for post submission is now explicitly capped at 1s, reducing delayed error surfacing when relays reject immediately (for example auth-required rejections).

## [1.16.0] - 2026-03-04
Expanded NIP-99 feed support, strengthened relay/auth reliability, and improved failed-publish recovery and channel predictability.
- Feed now supports NIP-99 listings end to end: `Offer`/`Request` type publishing (`kind:30402`), feed labeling, common listing metadata fields, active/sold status toggles, and auto-filled title/summary defaults with metadata normalization.
- Relay auth/reliability was overhauled around NIP-42 and NIP-11: standards-compliant auth events (`kind:22242`), improved signed-out/session-restore behavior (including restore-before-connect startup ordering), auth-required recovery/retry flows, and reduced false-positive verification errors.
- Relay status now reflects capabilities and outcomes more precisely: NIP-11 capability details in Relay Management, read-rejected vs read-only state differentiation, stable connecting behavior, and post-sign-in/auth success status healing.
- Relay write/read state now updates from real outcomes: publish failures/partials mark write rejection, later confirms clear it, and read rejection only applies on explicit read denial.
- Failed publish handling now supports both feed focus and recovery flexibility: scoped visibility by selected feeds, an all-failures scope with hidden-count indicator, original-target `Retry`, selected-feed `Repost`, and explicit hover hints for both actions.
- Sidebar channel seeding now uses feed-scoped frecency to select visible channels while keeping the visible set alphabetically ordered for stable scanning.
- Updated page title branding from `Collaboration Platform` to `Organic Collaboration`.
- Refactored Nostr internals to remove the unused custom relay pool and rely on NDK-native relay/auth handling.

## [1.15.0] - 2026-02-27
Expanded media preview workflows and refined toast behavior with native Sonner styling.
- Local image auto-caption now checks device capability up front, times out more cleanly on slow/unsupported devices, and keeps manual alt-text entry available when auto-caption is unavailable.
- Enabling local auto-caption now preloads the on-device model with a progress toast, and caption generation now shows in-flight progress feedback with duration-aware debug logs.
- App behavior toggles (live presence, undo-send delay, and local auto-caption) were moved from profile identity editing into app preferences in the desktop user menu and mobile Manage.
- Inline media now shows attachment alt/caption on hover and opens a cross-post preview with non-wrapping navigation, per-post media indexing, and a direct link to the source post.
- Media preview now supports keyboard navigation (`←/→` and `h/l` for media, `↑/↓` and `k/j` for previous/next post, and `Enter` to jump to the current media's post).
- Toasts now use Sonner-native styling with rich color variants, filter confirmations use neutral default toasts, and publish undo cancellation uses an informational toast.
- Comment submissions from the desktop composer now preserve `comment` kind on button click instead of falling back to task publish.

## [1.14.0] - 2026-02-25
Added local image captioning support and an in-app changelog viewer, while improving relay status reliability.
- Added an opt-in profile setting for local on-device image captions, including a one-time model download data-usage hint.
- Clicking the in-app version label now opens a formatted changelog dialog with release summaries and grouped bullets.
- Improved relay connection status reliability so feeds are less likely to appear disconnected until a page reload.
- When enabled, image attachments can now auto-fill alt text from on-device caption inference.

## [1.13.1] - 2026-02-25
- Fixed mobile tab/swipe view syncing so top-bar switches stay consistent when opening and closing Manage.
- Improved incoming Blossom/NIP-94 attachment handling, including hash-metadata matching for Blossom URLs.
- Reduced iOS Safari extra-scroll issues by using dynamic viewport sizing with safe-area handling.
- Unified composer attachments into a single `Attach` action and added a client-side per-file upload limit (default 100 MB, configurable).
- Mobile composer draft state (including attachment chips) now persists when toggling Manage.
- Tree view now only allows comment posting when a parent task is focused.

## [1.13.0] - 2026-02-25
Expanded attachment publishing and embed behavior, with managed/self-hosted upload options and NIP-98 auth for protected NIP-96 servers.
- When depth mode is set to `Projects only` and no project containers match, Kanban/Table now fall back to showing all levels instead of an empty result.
- Standalone embeddable URLs on their own line now render as embeds (replacing the raw URL text) without duplicate attachment chips, and task/comment content preserves multiline formatting with basic markdown rendering and tighter spacing around embeds.
- Added image/file attachment controls in desktop and mobile composers with NIP-92 `imeta` publish tags, plus automatic inline rendering for direct image/file URLs in task content across views.
- Switched default managed upload endpoint to `nostr.build`, passed `VITE_NIP96_UPLOAD_URL` into Docker build args, and added an optional `docker-compose.upload.yml` Route96 stack for self-hosted uploads.
- Added NIP-98 HTTP auth signing for attachment uploads so NIP-96 servers that require authenticated `Authorization: Nostr ...` requests can accept composer image/file uploads.
- Fixed attachment uploads being marked `Failed` when providers returned successful responses with URLs in alternate NIP-96 payload shapes (such as stringified `nip94_event` or nested `data` URLs).

## [1.12.2] - 2026-02-24
Refined onboarding availability for signed-out users and unified compose/sign-in iconography.
- Added an onboarding intro popover before auto-start guide sessions for signed-out users, with direct actions to either start the tour or sign in.
- Signed-in users no longer see onboarding guide flows.
- Standardized task/comment and sign-in icons across desktop and mobile compose/sign-in controls.

## [1.12.1] - 2026-02-22
Improved relay failure handling and refined sidebar fold animation smoothness.
- Relays that repeatedly fail initial websocket handshakes are now auto-paused in the NDK pool and marked `error` in feed status, reducing repeated Firefox console spam (including repeated `__cf_bm` invalid-domain warnings) from unreachable relays.
- Feeds sidebar folding now uses measured-height collapse motion (instead of large max-height scaling), reducing jank during repeated expand/collapse.

## [1.12.0] - 2026-02-22
Improved mobile routing persistence, refined interaction motion, and added reusable saved filter presets in the sidebar.
- Mobile Manage now uses a dedicated `/manage` route on phone layouts, so reloading preserves the active Manage screen instead of dropping back to task views.
- Added a playful motion pass across toasts, filters, onboarding focus, composer interactions, autocomplete highlights, sidebar folds, and completion confetti-lite, with reduced-motion safeguards.
- Added saved filter presets in the desktop sidebar so current relay/channel/people selections (including Channels `AND/OR` mode) can be saved, re-applied, renamed, and deleted.

## [1.11.0] - 2026-02-22
Expanded channel filtering controls with global include match mode and improved collapsed sidebar visibility.
- Added a global Channels include mode toggle (`AND`/`OR`) in desktop and mobile filters; excluded channels still always hide matching tasks.
- Collapsed Channels and People sidebar sections now keep selected filters visible and show a small preview of top entries.

## [1.10.4] - 2026-02-22
- Clarified and standardized compose shortcut behavior so metadata-only autocomplete uses `Alt/Option` only, while `Cmd/Ctrl+Enter` consistently submits.
- Refactored mobile and desktop composer shortcut/modifier handling into a shared library for consistent behavior and easier maintenance.
- Increased Sonner toast contrast (default plus success/info/warning/error variants and action buttons) so countdown/undo toasts are easier to read.

## [1.10.3] - 2026-02-22
### Changed
- Sidebar Channels and People headers now share the same foldout behavior: full-row click to expand/collapse with matching "Click to filter" hover hints.
- Toast surfaces now use higher opacity (including success/info/warning/error variants) for better readability.
- Mobile onboarding automation now opens Manage profile setup at step 5 and returns to Feed at step 7, with spotlight targeting delayed until UI transitions settle.
- Mobile manual guide starts now keep `Skip` and `Next` controls available immediately, including all-steps mode.
- Autocomplete metadata-only selection now supports `Alt/Option+Click` in addition to `Alt/Option+Enter`.

### Fixed
- Sidebar exclusive channel/person label clicks now toggle off when that filter is already the only active selection.
- Composer autocomplete `Alt/Option+Click` handling now resolves on click to avoid token text insertion on browsers that do not preserve modifier state during `mousedown`.
- Relay reconnect retries now use Fibonacci backoff and `NDKProvider` relay initialization no longer recreates relay connections on rerenders, reducing websocket churn.

## [1.10.2] - 2026-02-20
- Removed recurring development warning noise across tests/build (invalid test worker Node flags, missing relay dialog description warning, and known third-party build warning noise) while keeping existing behavior unchanged.

## [1.10.1] - 2026-02-20
- Selected feeds now show live connection state in sidebar/mobile feed lists, including a not-active indicator.
- Posting and task mutations are blocked while any selected non-demo feed is disconnected, with warning toasts on blocked attempts.
- Toast styling now distinguishes `info`, `warning`, and `error` variants more clearly.
- Relay Management now includes debug utilities to copy relay diagnostics JSON and configured relay URLs.

## [1.10.0] - 2026-02-19
Added containerized local relay runtime setup and consolidated internal compose/relay state handling.

### Added
- Added Docker support (`Dockerfile` + `docker-compose.yml`) to run Nodex alongside an `rnostr` relay with env-configurable relay defaults.

### Changed
- Default Nostr relays are now env-driven (`VITE_DEFAULT_RELAYS` and/or `VITE_DEFAULT_RELAY_DOMAIN` + protocol/port), replacing hardcoded app relay defaults.

## [1.9.0] - 2026-02-19
Improved compose safety and metadata ergonomics, and expanded cross-view task depth controls.

### Added
- New relay-backed posts can be delayed briefly with an undo action before publish, and undo now restores the full compose draft state.
- Kanban/Table depth controls now include a `Projects only` mode for root tasks that contain subtasks.

### Changed
- Included channel filters and selected people filters now populate compose as metadata-only chips instead of injecting hashtag/mention text into the message body.
- Desktop view order now places Table before Calendar.

### Fixed
- Metadata-only compose chips now expose a clear hover remove affordance.
- Table task-edit controls (status/date/priority) are now blocked when signed out, with signed-in guards on publish update handlers.

## [1.8.3] - 2026-02-19
- Profile username validation now blocks names that match already-known usernames.
- Hashtag metadata-only shortcut handling now accepts newly typed tags (desktop and mobile), and mobile `Alt+Enter` applies metadata-only tag insertion while typing hashtag tokens.
- Hashtag autocomplete now prefers closer matches by ranking exact/prefix and shorter results ahead of broader substring matches.

## [1.8.2] - 2026-02-19
- Onboarding guide spotlight now keeps the current arrow-target area undimmed instead of greying it out.
- Kanban guide and user guide now explain tree/leaf depth filtering, and the Kanban Levels dropdown/options now include hover hints.

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
