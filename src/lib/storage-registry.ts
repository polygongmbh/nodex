/**
 * Central registry of all localStorage keys used by the app.
 *
 * Categories:
 *   preference — explicit user choices; preserve under storage pressure
 *   state      — recoverable app state; preserve (failed-publish-drafts especially)
 *   cache      — reconstructable data; prune first when storage is tight
 *
 * Auth keys (nostr_auth_method, nostr_guest_nsec, nostr_nip46_*) are managed
 * separately in src/lib/nostr/provider/storage.ts and are never pruned.
 */

// ── Preferences ──────────────────────────────────────────────────────────────
export const STORAGE_KEY_THEME_MODE = "nodex.theme.mode";
export const STORAGE_KEY_LANGUAGE = "nodex.language";
export const STORAGE_KEY_PRESENCE_ENABLED = "nodex.presence.v1";
export const STORAGE_KEY_AUTO_CAPTION_ENABLED = "nodex.auto-caption.v1";
export const STORAGE_KEY_PUBLISH_DELAY_ENABLED = "nodex.publish-delay.v1";
export const STORAGE_KEY_COMPLETION_SOUND_ENABLED = "nodex.completion-sound.v1";
export const STORAGE_KEY_ACTIVE_RELAYS = "nodex.active-relays.v1";
export const STORAGE_KEY_CHANNEL_FILTERS = "nodex.channel-filters.v1";
export const STORAGE_KEY_CHANNEL_MATCH_MODE = "nodex.channel-match-mode.v1";
export const STORAGE_KEY_SAVED_FILTER_CONFIGS = "nodex.saved-filter-configurations.v1";
/** Per-user key: append `.${pubkey}` */
export const STORAGE_KEY_PINNED_CHANNELS_PREFIX = "nodex.pinned-channels";

// ── State ────────────────────────────────────────────────────────────────────
export const STORAGE_KEY_ONBOARDING_STATE = "nodex.onboarding.v1";
export const STORAGE_KEY_LOGIN_HISTORY = "nodex.identity.login-history.v1";
export const STORAGE_KEY_FAILED_PUBLISH_DRAFTS = "nodex.failed-publish-drafts.v1";

// ── Cache ────────────────────────────────────────────────────────────────────
export const STORAGE_KEY_NOSTR_EVENT_CACHE = "nodex.nostr-events.cache.v1";
export const STORAGE_KEY_KIND0_CACHE = "nodex.kind0.cache.v2:local";
/** Legacy kind0 cache key kept for one-time migration reads */
export const STORAGE_KEY_KIND0_CACHE_LEGACY = "nodex.kind0.cache.v1";
export const STORAGE_KEY_NIP05_CACHE = "nodex.nip05-resolver.cache.v1";
export const STORAGE_KEY_CHANNEL_FRECENCY = "nodex.channel-frecency.v1";
export const STORAGE_KEY_COMPOSE_DRAFT = "nodex.compose-draft.feed-tree";
/** Prefix for per-relay host fallback cache: append `.${hostname}` */
export const STORAGE_KEY_DEFAULT_RELAY_FALLBACK_PREFIX = "nodex.default-relay-fallback.v1";
