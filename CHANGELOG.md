# Changelog

All notable changes to Nodex are documented in this file.

The format is inspired by Keep a Changelog and follows Semantic Versioning.

## [Unreleased]

- Noas auth now immediately connects relay URLs returned by sign-in responses, and Noas sign-up submissions now include the app’s currently connected relay URLs in the same array format.

## [2.8.0] - 2026-03-27
Minor release for relay-scope correctness, startup performance, and mobile/task-view polish (1875 production lines changed since `v2.7.6`).

- Breadcrumb labels and task status-update previews now ignore leading blank lines/whitespace before taking the first visible line, and each breadcrumb item is capped at half the available row width so one long ancestor does not crowd out the rest.
- Cold-start app loads now mount immediately while startup relay discovery continues in the background, and host-fallback relay probing now fans out concurrently to reduce first-visit delays.
- Relay-scoped feeds now keep events visible under every relay that actually delivered them, instead of attributing duplicate receipts only to the first relay that saw the event.
- Presence status now publishes only to the currently selected relays, delays relay-switch updates briefly to avoid churn, refreshes unchanged presence less aggressively, and only includes a focused item id on relays where that item is actually present.
- Mobile top navigation view tabs now switch reliably on direct taps again by avoiding drag pointer capture during ordinary tap starts, while preserving slide-across view switching.
- Language selectors now use a consistent dropdown trigger pattern across desktop and mobile, with the chevron grouped inside the same padded control content as the active language label and profile-style desktop topbar alignment.
- Relay Management now lets you reorder relays with inline up/down controls, and the new order persists into the sidebar and future startups.

## [2.7.6] - 2026-03-26
- Automatic Noas sign-in/sign-up now prefill the host as a bare NIP-05 domain (without `https://`) while still internally defaulting submitted hosts to HTTPS.
- Language detection now uses `i18next-browser-languagedetector` with URL query/path support plus persisted browser fallback, replacing the custom language bootstrap logic.
- Mobile Manage now uses a native scroll container (instead of Radix ScrollArea internals) and guest private-key backup rows clamp to container width, preventing horizontal panel stretch.
- Mobile compose autocomplete now opens above the docked composer, restores `#channel` suggestions alongside `@mention` suggestions, and reuses the shared desktop token-matching logic so mobile channel completion no longer disappears below the input.

## [2.7.5] - 2026-03-25
- Noas sign-in now submits `password_hash` (SHA-256) and correctly reads Noas snake_case response keys (`public_key`, `private_key_encrypted`) even when `success` is omitted, preventing false server/key-error failures on valid sign-ins.
- Noas sign-in now shows a dedicated key-mismatch error when the decrypted signer pubkey does not match the server response, instead of showing the generic server/key failure message.
- Noas API-base discovery cache is now session-only (in-memory) and no longer persisted in browser storage, so host-side `noas.api_base` changes are picked up after app restart.
- Private-key auth fields now use non-credential input semantics (text + masked rendering) instead of password-type semantics, so Safari no longer treats Nostr private keys as password autofill/save targets during sign-in and Noas sign-up flows.
- Added deploy-configurable `VITE_NODEX_MOTD` support for a dismissible top-of-app message banner shown across desktop and mobile shells.

## [2.7.4] - 2026-03-25
- Creating a new task directly in the Kanban `To do` column no longer publishes an additional separate status-update event; tasks now keep the default `todo` status without redundant follow-up status publishing.
- Compose now defaults root task/comment/offer/request submissions to the single active connected space when no space is explicitly selected, so posting no longer requires manual space or parent selection in that one-space state.
- Noas sign-up now refreshes the public-key preview immediately when the private-key input changes, instead of updating only after using the generate action.
- Active (focused) feed items now show full text without line truncation, while inactive items keep the existing collapsed preview behavior.
- Breadcrumb labels now use only the first content line, remove `@mentions`, drop hashtag markers, and strip formatting/symbol characters so focus breadcrumbs show plain text labels.

## [2.7.3] - 2026-03-23
Patch release for markdown rendering stability, relay-scoped mention suggestions, and feed rerender suppression.
- Task content markdown now keeps bullet and numbered lists in a single rendered block with proper markers and tighter spacing, and long inline Nostr identifiers such as `npub` references wrap more cleanly instead of disturbing card layout.
- Desktop mention autocomplete now only suggests authors/profile metadata from the current relay scope, while existing mention chips still resolve labels from the broader cached people list.
- Feed/task surfaces now avoid no-op rerenders from periodic relay-status reconciliation when relay state has not actually changed.
- Task markdown blocks now render inside a `whitespace-normal` boundary so container-level `whitespace-pre-wrap` no longer introduces extra blank lines between list/paragraph blocks, and feed surface relay snapshots now ignore connection-status churn to reduce periodic post rerenders.

## [2.7.2] - 2026-03-22
- Onboarding navigation guidance now uses the actual view order and labels (`Timeline`, `Tree`, `Kanban`, `Table`, `Calendar`) in English, German, and Spanish, and the task-focus step now clearly explains post interactions (view subitems, comment, create subtasks) without breadcrumb jargon.

## [2.7.1] - 2026-03-22
- Compose preview chips that are part of the current message (and therefore not removable) now focus the composer and flash the existing input highlight guidance when clicked, while removable chips continue to remove tags/mentions.
- Noas auth now keeps server messages to a single inline alert inside the Noas panel and uses clearer username/password/private-key field semantics so password managers target the actual password field instead of the private-key input.
- Desktop kanban now uses the wider auto scrollbar on the board itself while preventing stray horizontal scrollbars inside individual columns, including the Firefox first-column case.
- People sidebar suggestions now use the same frecency-backed persistence model as channels, so manually interacted people stay visible longer instead of disappearing as soon as they are deselected.
- People can now be pinned in the sidebar with the same relay-scoped behavior as channels, and pinned people stay visible at the top of the People list for the current view.
- Mobile fallback hints now use a single scope-aware contract across mobile views with strict precedence, and the outdated exclusive-mode helper note is no longer shown.

## [2.7.0] - 2026-03-22
Minor release for mobile manage polish, sidebar/feed scope fixes, terminology cleanup, and Noas UX updates (6041 lines changed since `v2.6.2`).

- Sidebar space rows now truncate long space names so relay status dots remain visible, active space icons now tint to match each relay's current connection state instead of always staying blue, and relay rows no longer show the extra left-side active dot.
- Sidebar channel pins now sit in a separate far-left gutter so the hashtag column stays fixed instead of shifting right.
- Chip-added and newly posted channels now stay scoped to the relay/feed they were created from instead of appearing in unrelated relay scopes.
- When no Noas server is preconfigured, Nodex now tries the current site's matching Noas server automatically and reuses it on later visits.
- Noas sign-up now surfaces the server-returned success message as the toast source of truth, keeps auto-sign-in only for `status: active`, and otherwise switches back to sign-in while keeping the returned message visible in the dialog.
- Guest guest-identity private-key backup UI now uses one shared single-row compact layout on desktop and mobile, with unified `Backup Private Key` copy and matching action buttons on both surfaces.
- Mobile Manage app preferences now use the same primary labels as the desktop profile menu, keep desktop help copy as inline subtitles on mobile, flatten the nested preference-card treatment, and remove the local image captions toggle from mobile Manage.
- Mobile Manage relay add now accepts bare relay hosts more gracefully, supports Enter-to-add, shows a larger language switcher, removes the mute/completion toggle, and moves the version hint into the `Impressum`/`Datenschutz`/`Kontakt` row with a `Changelog` label; legal/contact button labels and desktop legal hint text are now localized.
- User-facing `Feed(s)` terminology is now standardized to `Space(s)` across English, German, and Spanish, relay display names are now shorter and more readable, and startup relay discovery is easier to adapt to different host setups.
- Mobile fallback hints now use a single scope-aware contract across mobile views (including upcoming), with consistent centered shell-level notice rendering and strict precedence so scope-empty fallback replaces quick-filter fallback when both conditions apply.

## [2.6.2] - 2026-03-21
- Auth dialogs now use consistently rounded corners across the app, and the sign-in chooser now has a tighter layout with Noas emphasized first, clearer Signer/Extension and Guest/Private options, renamed `Remote Signer` copy, and a simpler `username @ host` Noas field.
- Dialog scrollable content now uses a shared `DialogScrollBody` wrapper (including clipping-safe inner padding), and auth/profile/legal/changelog/shortcuts dialogs now consume the shared pattern instead of duplicating per-modal scroll-shell markup.
- Dialog close affordances and scroll gutters now reserve consistent right-side space so modal close buttons and scrollbars no longer overlap field edges in compact auth/profile forms.
- Profile dropdown now uses a tuned compact layout with an icon-only pencil `Edit profile` affordance beside the profile preview, flatter denser app-preference toggles (no nested card wrappers), and clearer preference labels with explanatory hover tooltips.

## [2.6.1] - 2026-03-21
- Noas sign-in now falls back to the correct API base more reliably when automatic server discovery is unavailable.
- Noas sign-up now works again with current Noas account registration requirements.
- Noas sign-in and sign-up now surface server HTTP status plus reason text (for example `403 Forbidden`) together with Noas error details, instead of collapsing these failures into generic modal server-error copy.

## [2.6.0] - 2026-03-20
Minor release for Noas auth endpoint routing, relay auth/subscription recovery (NIP-42), and feed hydration loading clarity (1028 lines changed since `v2.5.0`).

### Changed
- Sign-in now re-runs NIP-42 relay auth preflight for known auth-capable relays, then replays the active subscription set after successful re-auth so normal feed kinds resume immediately.

### Fixed
- Noas auth discovery now follows advertised server endpoints correctly, avoiding broken sign-in and sign-up routes.
- Feed/list/tree hydration now keeps loading copy visible while relay backfill is active, preventing early fallback to empty-state text before hydration completes.
- Relay subscriptions now keep stable provider callback wiring across relay status and feed-scope updates, removing repeated `REQ`/`CLOSED` churn on strict relays.
- Relay rejection/status handling now better maps explicit rejection reasons plus websocket `OK false` and `CLOSED ... auth-required` responses, while preserving rejection state across reconnect attempts and avoiding stale `connecting` UI state.
- Kind-0 profile reads now use centralized provider caching with in-flight dedupe/cooldown, reducing auth-closed retry loops and noisy author-lookup subscription churn.

## [2.5.0] - 2026-03-20
Minor release for relay/feed state-update resilience and NIP-19 `npub` identity label upgrades (2467 lines changed since `v2.4.1`).

### Changed
- Relay reconnect now defaults to a soft reconnect path (preserving live relay/subscription continuity) while keeping hard reconnect available when explicitly requested; auto-retries continue using progressive backoff with unlimited retry count, capped cooldown length, and focus-reset recovery.
- Feed now keeps state-update entries (including close events) visible even when the underlying task is closed and hidden from the main task rows.
- User-facing identity fallback labels and key hints now prefer NIP-19 `npub` identifiers instead of raw hex pubkeys across feed/mention/auth surfaces, while internal relay/tag logic continues using hex pubkeys.
- Feed task-card identity labels now render `npub` as first-8/last-3 by default, show full `npub` on `2xl` screens, and hide slim-layout fallback `npub` text from inline rows while keeping username metadata inline and full identifiers available via hover title.

### Fixed
- Relay write-rejection detection now also handles relay-specific NDK publish-error map payloads more reliably (including string-keyed map entries and generic relay errors with top-level fallback parsing), improving status transitions when relays reject writes with authorization/policy reasons such as `write rejected`.
- Restored live feed updates after initial relay hydration, fixing a regression where updates stalled until reload.
- Feed now keeps an explicitly focused closed task visible in its own focused thread view while still hiding non-focused closed tasks in normal feed listings.
- Feed merge now preserves relay-delivered state update messages instead of dropping them behind local task copies, while task status itself updates optimistically in local UI without synthesizing a separate local state-event row.
- List view tables now use the full content width again instead of reserving a permanent scrollbar gutter that left a visible right-side gap.
- Kanban drag-and-drop now keeps dropped cards in their destination column immediately (instead of briefly snapping back) while upstream status state settles.

## [2.4.1] - 2026-03-19

- Composer attachments can now be added by dragging files into the composer or pasting clipboard images/files, and dropped plain text now lands in the composer body instead of being ignored.
- Feed/list/calendar/kanban channel filters now remain authoritative inside the selected feed scope instead of being dropped when the current relay slice does not already contain a matching channel.
- Feed/list/tree end-of-scroll scope notes now stay visible for relay-only selections as well, so scoped feeds consistently end with summaries like `This is all on feed.example.com`.
- Noas sign-in and sign-up now pick up the correct server settings automatically from the submitted Noas domain and remember them for later attempts.
- Main app views now use a shared higher-contrast scrollbar with a reserved track, while compact surfaces keep gutter-free scrollbars and compose fields avoid clipping against rounded corners as they grow up to about half the viewport height.
- Clearing feed filters now falls back to the initial incremental feed window before revealing more posts, reducing lag when broadening back out to large feeds.
- Feed and tree views now avoid several repeated task/person scans during render, and search filtering is deferred slightly so large task sets feel more responsive while typing and expanding nested work.

## [2.4.0] - 2026-03-19
Minor release for markdown rendering and content-reference parsing upgrades, plus task-card metadata interaction polish (3258 lines changed since `v2.3.0`).

- Tree/feed priority chips now open the priority dropdown directly on click instead of opening an intermediate popover first.
- Content rendering now uses a markdown parser pipeline (`react-markdown` with GFM) while preserving clickable `#channel` and `@mention` behavior, and publish/ingest parsing now uses shared extraction so NIP-19/NIP-27 references in content are recognized more exhaustively for Nostr tag/mention handling.
- Markdown heading syntax now renders with subtle heading emphasis in task content instead of appearing identical to body text.
- Kanban and table cards now clamp content to two display lines, while feed/tree/calendar cards now clamp collapsed content to three display lines and show localized show-more/show-less toggles when posts exceed four lines or 500 characters.
- Task hover treatment now uses a subtler card-surface highlight (soft background + light shadow) instead of emphasizing the task text color directly.
- Startup onboarding now uses current relay callback references consistently, preventing stale relay state from persisting in the onboarding controller.

## [2.3.0] - 2026-03-18
Minor release for broad feed/task interaction upgrades, filtering reliability fixes, and kanban drag-and-drop usability improvements (3241 lines changed since `origin/main`).

- Kanban columns now accept drag-and-drop across the full column body (including sparse or empty columns) instead of only near the top task stack.
- Table view now shows only the first line of task content as plain text (no inline link/media rendering), and Kanban/Calendar metadata rows now consistently show due-date above chips with shared `P{priority}` chip treatment.
- Tree view item cards now let you click due-date and priority chips to edit date, date type, time, and priority inline (matching list-view quick editing).
- Feed view item cards now let you click due-date and priority chips to edit date, date type, time, and priority inline.
- Sidebar frequent-people derivation now follows the currently active relay scope (matching channel scoping), so non-selected people from hidden feeds no longer appear in the People sidebar list.
- Clicking a task from an empty focused composer now activates the task on the first click instead of losing the activation while the composer collapses.
- Sidebar saved filters now include two permanent compact quick filters (`Recent` and `Important`) with text toggles, inline number controls, defaults of `7` days and `P50+`, and recency matching based on latest task/state-update activity.
- URL-initialized people filters now hydrate once and remain user-controllable, fixing a regression where startup `p=` selections could not be deselected after profiles loaded.
- Feed/person filters now keep URL-selected channels and people during initial relay hydration, clicked authors can stay visible as active sidebar people filters, cold scopes load more smoothly, and all task views now show the same loading row in place of breadcrumbs while hydrating.
- Sidebar filter toasts now use clearer natural-language phrasing (including relay domains instead of relay display names), and people filters now include posts authored by selected people as well as posts tagging them even when assignee metadata is also present.
- Feed switches now ignore selected channel filters that have no posts in the newly active feed, restoring the original feed-local filtering behavior instead of leaving the new feed empty.
- Relay-load failure empty states now show feed-only source hints (`Could not load posts from ...`) and use status-aware informational subtitles that distinguish read rejection from connection failures.
- Startup relay fallback discovery now runs again when no relays are preconfigured, fixing a regression that could leave the app booting with an empty relay list.
- Loading empty-state microcopy now rotates through a larger set of wellness-style waiting prompts with updated localization tone in English, German, and Spanish.
- Feed/tree/table scope hints now show a true end-of-content footer (`This is all ...`) when filtered results are visible, while `No post yet ...` remains reserved for actual zero-result states.
- Unfiltered collection empty states now rotate through poetic localized variants, with new curated copy for English, German, and Spanish.
- Clearing filters now consistently deactivates all feeds (including saved-filter toggle-off and onboarding reset flows) instead of reactivating every feed.
- Compose submissions now scope due date fields to tasks only, and root offers/requests now follow comment posting rules by requiring a selected feed while parented offers/requests inherit parent tags and parent-origin feed routing.
- Clearing a selected task date via the compose-row `x` control no longer collapses the adaptive composer unexpectedly.
- `Shift+Alt/Option+Click` on a post now opens a raw Nostr event JSON modal with quick actions to copy the event JSON or event id.

## [2.2.0] - 2026-03-18
Minor release for broader user-facing compose/filter/feed UX updates and relay stability fixes (4545 lines changed since `v2.1.0`).

- Compose now shows a prominent blocked-post panel with specific next-step guidance, uses clearer "green feed" wording for relay selection, moves in-progress publishing feedback to a toast instead of a warning banner, and blocked post buttons steer users toward fixing missing channels, relay selection, or attachment issues instead of silently failing.
- Task creation now keeps the composer open after submit, preserves selected date and priority values for follow-up tasks, and uses button hover text instead of separate empty-state warning copy.
- Root-level comments can be posted again from the main composer when they include a channel tag and at least one writable relay is selected.
- Clicking a task hashtag now ensures that channel appears in the Channels list when its filter is activated, so the active tag filter stays visible and can be adjusted or cleared from the sidebar.
- Feed relay selection now restores as none selected when no valid persisted selection exists, instead of re-selecting all feeds after reload.
- Closed tasks are now hidden from the feed and calendar views while remaining available in views that explicitly manage closed work.
- Removing a relay no longer forces healthy remaining relays to reconnect, and relay reconnect handling now keeps a single live socket per relay URL instead of leaking duplicate WebSocket connections.
- Sidebar channels and people now start folded by default, scale their folded previews with available height, prioritize selected and pinned items in the preview, and always keep pinned channels visible while folded.
- Feed, tree, and list empty states now describe the current relay/channel/person scope in natural language, place desktop scope-only hints at the end of the scroll area when broader content exists, keep mobile views showing broader results with a compact fallback hint, and switch to relay-aware loading/error copy with small loading easter eggs when selected feeds are still connecting.
- Filter-backed compose chips now sit in a dedicated footer tray, stay visible when an empty adaptive composer collapses, and clear their linked channel/person filters when removed.

## [2.1.0] - 2026-03-17
- Hashtags are no longer parsed when `#` appears inside a word, so embedded text like `email#ops` no longer creates channels, chips, or submit tags by mistake.
- Compose channel tags now follow the active relay scope, so switching to a relay that does not have a previously selected channel no longer keeps that hidden channel attached in compose.
- Media previews now use attachment preview metadata and blurhash placeholders more consistently, fixing oversized lightbox image positioning and showing preview-first images in reduced-data mode until full media is requested.

## [2.0.0] - 2026-03-17
Major release focused on auth/onboarding refinement, broader localization coverage, stricter task-state semantics, and faster large-relay feed hydration.
- Feed hydration is now significantly faster on large relays: event conversion is deferred until after EOSE (one conversion pass instead of dozens), the flush debounce scales up to 500 ms during high-volume bursts, and a "Loading events…" indicator is shown while the initial backfill is in progress.
- Onboarding `Create account` now opens Noas sign-up directly again, and standalone `/signin` plus `/signup` URLs now open the matching auth modal entry points.
- Standardized the desktop top-right auth/profile controls so signed-out and signed-in states now use matching button treatment and height, and profile dropdown actions show pointer cursor affordance again.
- Reordered profile editor identity fields to show display name before username, fixed clipped profile inputs in the desktop editor, removed the stray divider above save actions, and auto-generate a sanitized username from display name while the username field is still blank.
- Completed an i18n sweep across auth, compose, media preview, theme toggle, and attachment flows so user-facing strings now come from locale bundles in English, German, and Spanish, while the legal dialog remains intentionally German-only.
- Split the startup onboarding dialog into separate `Create account` and `Sign in` actions, with `Create account` shown only when Noas sign-up is available.
- Noas sign-in/sign-up now accept full custom host URLs, normalize bare hosts to `https://`, and show clearer host/connection/server errors instead of collapsing failures into generic invalid-credential messages.
- The Noas host field now uses a flexible layout so long custom URLs no longer clip in the sign-in/sign-up forms.
- Kept Noas sign-in and sign-up available even without preset server configuration by showing the method chooser first and leaving the host field editable.
- Updated the Nostr sign-in dialog copy across English, Spanish, and German so the username/password option no longer refers to a "Noas account" in its description text.
- Added a distinct `Closed` task state with separate Nostr status-event mapping, explicit task status menu selection, and a fourth Kanban column to the right of `Done` without adding `Closed` to the normal click cycle.
- Fixed a feed startup crash caused by task status sorting state initializing before the main Index task data graph was ready.
- Reworked task update permissions so untagged tasks can be updated by any signed-in user, tagged tasks remain editable by tagged assignees and the creator, and unauthorized relay-driven status/date/priority updates no longer override tasks locally.
- Refined the Noas auth flow so sign-up stays focused, sign-in alternatives show distinct icons again, and the username suffix host can be edited in place behind a guarded pencil control.
- Task status changes no longer enter tasks from dropdown selection, `Option`/`Alt` clicks no longer open tasks while using the status picker, table-view status changes stay in place instead of entering the task, and direct-selection status pickers open more quickly.

## [1.17.3] - 2026-03-14
- Stabilized Relay connection and status handling with cleaner reconnect behavior, clearer `read only` / `read rejected` states, and better startup relay detection.
- Limit and scope cached data appropriately.
- Feed loading is more resilient under heavier relay backfills through capped backfill limits and incremental hydration.
- Fixed a number of small usability issues and errors.

## [1.17.2] - 2026-03-13
- Added a runtime privacy mode that can disable browser local/session storage, cookie writes, and browser cache APIs for the active session.
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
- Startup relay fallback discovery is now more reliable when deriving likely relay hosts from the current site.
- Successfully discovered relay hosts are now reused on repeat loads so reconnects feel faster.
- Host-fallback WebSocket probe timeout handling no longer force-closes in-flight sockets, reducing Firefox "connection interrupted while page was loading" console noise during fallback discovery.
- Cached relay discoveries now ignore stale results that no longer match the current site, preventing empty relay lists.
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
- When no relays are preconfigured and none are saved locally, Nodex now tries likely relay hosts based on the current domain and connects only to the ones that respond.
- After sign-in, complementary relay enrichment now prefers NIP-65 (`kind:10002`) relay lists and only falls back to verified NIP-05 relay hints when no NIP-65 relay list is available.
- The demo feed relay and seeded demo tasks are now hidden by default unless demo content is explicitly enabled.
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
- Unified composer attachments into a single `Attach` action and added a per-file upload size limit.
- Mobile composer draft state (including attachment chips) now persists when toggling Manage.
- Tree view now only allows comment posting when a parent task is focused.

## [1.13.0] - 2026-02-25
Expanded attachment publishing and embed behavior, with managed/self-hosted upload options and NIP-98 auth for protected NIP-96 servers.
- When depth mode is set to `Projects only` and no project containers match, Kanban/Table now fall back to showing all levels instead of an empty result.
- Standalone embeddable URLs on their own line now render as embeds (replacing the raw URL text) without duplicate attachment chips, and task/comment content preserves multiline formatting with basic markdown rendering and tighter spacing around embeds.
- Added image/file attachment controls in desktop and mobile composers with NIP-92 `imeta` publish tags, plus automatic inline rendering for direct image/file URLs in task content across views.
- Attachment uploads now default to `nostr.build`, and Docker users can swap in a self-hosted upload service more easily.
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
- Added Docker support (`Dockerfile` + `docker-compose.yml`) to run Nodex alongside an `rnostr` relay.

### Changed
- Default Nostr relays are now configurable instead of being hardcoded in the app.

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
