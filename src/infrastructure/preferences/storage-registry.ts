/**
 * Central registry of all localStorage keys used by the app.
 *
 * Categories:
 *   preference — explicit user choices; preserve under storage pressure
 *   state      — recoverable app state; preserve (failed-publish-drafts especially)
 *   cache      — reconstructable data; prune first when storage is tight
 *
 * Auth keys (nostr_auth_method, nostr_guest_nsec, nostr_nip46_*) are managed
 * separately in src/infrastructure/nostr/provider/storage.ts and are never pruned.
 */

// ── Preferences ──────────────────────────────────────────────────────────────
export const THEME_MODE_STORAGE_KEY = "nodex.theme.mode";
export const LANGUAGE_STORAGE_KEY = "nodex.language";
export const PRESENCE_ENABLED_STORAGE_KEY = "nodex.presence.v1";
export const AUTO_CAPTION_ENABLED_STORAGE_KEY = "nodex.auto-caption.v1";
export const REDUCED_DATA_MODE_STORAGE_KEY = "nodex.reduced-data-mode.v1";
export const PUBLISH_DELAY_ENABLED_STORAGE_KEY = "nodex.publish-delay.v1";
export const COMPLETION_SOUND_ENABLED_STORAGE_KEY = "nodex.completion-sound.v1";
export const ACTIVE_RELAYS_STORAGE_KEY = "nodex.active-relays.v1";
export const CHANNEL_FILTERS_STORAGE_KEY = "nodex.channel-filters.v1";
export const CHANNEL_MATCH_MODE_STORAGE_KEY = "nodex.channel-match-mode.v1";
export const SAVED_FILTER_CONFIGS_STORAGE_KEY = "nodex.saved-filter-configurations.v1";
/** Per-user key: append `.${pubkey}` */
export const PINNED_CHANNELS_STORAGE_KEY_PREFIX = "nodex.pinned-channels";

// ── State ────────────────────────────────────────────────────────────────────
export const ONBOARDING_STATE_STORAGE_KEY = "nodex.onboarding.v1";
export const LOGIN_HISTORY_STORAGE_KEY = "nodex.identity.login-history.v1";
export const FAILED_PUBLISH_DRAFTS_STORAGE_KEY = "nodex.failed-publish-drafts.v1";

// ── Cache ────────────────────────────────────────────────────────────────────
export const NOSTR_EVENT_CACHE_STORAGE_KEY = "nodex.nostr-events.cache.v1";
export const KIND0_CACHE_STORAGE_KEY = "nodex.kind0.cache.v2:local";
/** Legacy kind0 cache key kept for one-time migration reads */
export const KIND0_CACHE_LEGACY_STORAGE_KEY = "nodex.kind0.cache.v1";
export const NIP05_CACHE_STORAGE_KEY = "nodex.nip05-resolver.cache.v1";
export const RELAY_STATUS_CACHE_STORAGE_KEY = "nodex.relay-status-cache.v1";
export const CHANNEL_FRECENCY_STORAGE_KEY = "nodex.channel-frecency.v1";
export const COMPOSE_DRAFT_STORAGE_KEY = "nodex.compose-draft.feed-tree";
/** Prefix for per-relay host fallback cache: append `.${hostname}` */
export const DEFAULT_RELAY_FALLBACK_STORAGE_KEY_PREFIX = "nodex.default-relay-fallback.v1";
