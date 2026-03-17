# Split NIP-78 Preference Sync Plan

## Objective
Introduce a narrow, low-noise preference sync model using NIP-78 that avoids syncing high-churn and device-local settings.

## Scope Decision Summary
- Sync now:
  - Saved filter configurations (named snapshots users intentionally create)
- Sync later (when implemented):
  - Pinned channels
- Keep local-only:
  - Dynamic filter state and frequently toggled UI/runtime settings
  - Caches, drafts, and auth/session secrets

## Classification Matrix

### A) Syncable via NIP-78 (plaintext acceptable)
- `nodex.saved-filter-configurations.v1`
  - Reason: explicit user artifacts with durable cross-device value.
  - Source: `src/lib/saved-filter-configurations.ts`
- Future: pinned channels (new model once feature exists)
  - Reason: explicit durable personalization and low write frequency.

### B) Local-only (device-specific and/or high-frequency)
- `nodex.active-relays.v1`
- `nodex.channel-filters.v1`
- `nodex.channel-match-mode.v1`
  - Reason: interaction-level state changes frequently; syncing causes write churn/conflicts and noisy UX.
  - Source: `src/lib/filter-preferences.ts`

- `nodex.theme.mode`
- `nodex.language`
- `nodex_publish_delay_enabled`
- `nodex_auto_caption_enabled`
- `nodex_presence_enabled`
- `nodex_completion_sound_enabled`
  - Reason: generally device-contextual (display/audio/input/network habits) and often intentionally different per device.
  - Sources:
    - `src/lib/theme-preferences.ts`
    - `src/lib/i18n/config.ts`
    - `src/lib/publish-delay-preferences.ts`
    - `src/lib/auto-caption-preferences.ts`
    - `src/lib/presence-preferences.ts`
    - `src/lib/completion-feedback-preferences.ts`

### C) Always local-only (non-preference data)
- Caches: event cache, kind0 cache, NIP-05 resolver cache, channel frecency
- Draft/recovery: compose drafts, failed publish drafts
- Secrets/session: auth method + guest/NIP-46 local keys
  - Sources:
    - `src/lib/nostr/event-cache.ts`
    - `src/lib/nostr/people-from-kind0.ts`
    - `src/lib/nostr/nip05-resolver.ts`
    - `src/lib/channel-frecency.ts`
    - `src/components/tasks/TaskComposer.tsx`
    - `src/lib/failed-publish-drafts.ts`
    - `src/lib/nostr/provider/storage.ts`

## NIP-78 Event Split Design
Use separate parameterized replaceable events (`kind:30078`) per domain to avoid merge contention.

- Event A: saved filters
  - `kind`: 30078
  - tags:
    - `['d', 'nodex.saved-filters.v1']`
    - `['client', 'nodex']`
  - content: JSON payload with versioned schema and timestamps.

- Event B: pinned channels (future)
  - `kind`: 30078
  - tags:
    - `['d', 'nodex.pinned-channels.v1']`
    - `['client', 'nodex']`
  - content: JSON payload with ordered channel IDs and metadata.

## Data Contracts (Draft)

### Saved Filters Payload
```json
{
  "version": 1,
  "updatedAt": "ISO-8601",
  "activeConfigurationId": "string|null",
  "configurations": [
    {
      "id": "string",
      "name": "string",
      "relayIds": ["string"],
      "channelStates": {"channel-id": "included|excluded"},
      "selectedPeopleIds": ["string"],
      "channelMatchMode": "and|or",
      "createdAt": "ISO-8601",
      "updatedAt": "ISO-8601"
    }
  ]
}
```

### Pinned Channels Payload (future)
```json
{
  "version": 1,
  "updatedAt": "ISO-8601",
  "pinned": [
    { "channelId": "string", "pinnedAt": "ISO-8601" }
  ]
}
```

## Implementation Steps
1. Add constants/types for app-data events.
   - Introduce app-data identifiers and payload schemas (zod).
   - Keep NIP-78 kind constants separate from existing task kinds.

2. Build a generic NIP-78 app-data module.
   - `loadAppDataByDTag(dTag)` and `saveAppDataByDTag(dTag, payload)` helpers.
   - Reuse existing NDK provider publish/subscribe path.

3. Add `saved-filter-sync` adapter.
   - Map between existing `SavedFilterState` and NIP-78 payload.
   - Merge policy: latest `updatedAt` wins at object level; preserve local fallback when remote missing/invalid.

4. Hydration/write flow.
   - On sign-in: load local first for instant UI, then fetch remote and reconcile.
   - On local saved-filter changes: debounce publish (e.g. 800-1500ms), publish only when signed-in.
   - Prevent loops via in-memory last-applied signature/hash.

5. Leave non-syncable preferences untouched.
   - No NIP-78 wiring for filter-preferences, theme/language, presence, publish delay, auto-caption, completion sound.

6. Add future extension point for pinned channels.
   - Define interface and placeholder store hooks without enabling writes until feature lands.

## Validation Plan
- Unit tests:
  - Payload parsing/validation and migration fallback.
  - Local-vs-remote reconcile behavior.
  - Debounced publish and loop prevention.
- Integration tests:
  - Signed-out: local saved filters still work.
  - Signed-in: saved filters hydrate from NIP-78 and persist back.
  - Corrupt/missing remote payload does not break local behavior.

## Rollout Notes
- No migration is required for local keys; keep local state as baseline.
- Remote sync is additive and only for saved filters initially.
- If remote fetch fails, app continues with local saved filters.
