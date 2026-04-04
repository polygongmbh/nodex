# Consolidate Auth Storage And Restore

## Goal

Make persisted auth state internally consistent by:

- adding session restore coverage for `privateKey` and `noas`
- consolidating auth storage reads/writes into shared provider helpers
- removing the unused `STORAGE_KEY_NOAS_USERNAME`

## Current Findings

### `privateKey`

Current behavior:

- login sets `authMethod` to `privateKey`
- login persists `nostr_auth_method=privateKey`
- login explicitly does **not** persist the private key
- startup restore does not have a `privateKey` branch

Consequence:

- there is no recoverable material for a restore flow
- a real restore path would require storing the user-provided private key or an equivalent decryptable credential locally

Recommendation:

- do **not** add a restore flow for `privateKey`
- centralize auth persistence so `privateKey` is treated as intentionally non-restorable and does not persist `nostr_auth_method`

### `noas`

Current behavior:

- login posts username plus password hash to `/auth/signin`
- successful response returns `publicKey` plus `encryptedPrivateKey`
- the app decrypts `encryptedPrivateKey` using the plaintext password supplied in the form
- login persists only `nostr_auth_method=noas` and `nostr_noas_username`
- startup restore does not have a `noas` branch

Consequence:

- the persisted username is not sufficient to recreate the signer
- the app has no persisted password, no persisted encrypted key, and no `NoasClient` method to fetch current-user signer material from an existing cookie-backed session
- `credentials: "include"` is used on Noas requests, but the client exposes only `/auth/signin`, `/auth/register`, `/picture/:pubkey`, and `/health`; there is no current-session restore endpoint in the codebase

Recommendation:

- do **not** add a restore flow for `noas` unless the server/API contract first grows a dedicated session-rehydration endpoint or the product deliberately chooses to store recoverable Noas credentials locally
- remove `STORAGE_KEY_NOAS_USERNAME`
- centralize auth persistence so `noas` is treated as intentionally non-restorable and does not persist `nostr_auth_method`

## Opinionated Direction

Persist only data that participates in an actual restore flow.

- `guest` continues to restore from persisted guest nsec
- `extension` continues to restore by probing NIP-07 availability
- `nostrConnect` continues to restore from persisted bunker metadata
- `privateKey` becomes explicitly non-restorable
- `noas` becomes explicitly non-restorable until the upstream auth contract supports secure rehydration

The practical implementation is therefore not “add restore flows for both methods” but “consolidate auth persistence and stop writing stale auth state for non-restorable methods.”

## Steps

1. Introduce shared auth-storage helpers in the provider layer.
   - Centralize `setItem`/`removeItem` logic for auth method and related keys.
   - Eliminate duplicated persistence logic between `ndk-provider.tsx` and `use-auth-actions.ts`.

2. Align persistence with restorable behavior.
   - Remove `STORAGE_KEY_NOAS_USERNAME`.
   - Stop persisting `STORAGE_KEY_AUTH=privateKey`.
   - Stop persisting `STORAGE_KEY_AUTH=noas`.
   - Keep cleanup on boot/logout for stale legacy values.

3. Add/update tests around auth restore behavior.
   - Cover startup restore for each supported persisted auth mode.
   - Cover stale auth-method cleanup for legacy `privateKey` and `noas` values.
   - Cover removal of dead Noas username persistence.

4. Verify and commit.
   - Run focused tests for provider/storage behavior.
   - Run broader checks if the final change scope expands across the provider significantly.

## Expected Outcome

After the change, every persisted auth key should satisfy one of two rules:

- it is required for a working restore path
- it is removed as dead state

That leaves storage behavior smaller, more predictable, and easier to reason about during future auth work.
