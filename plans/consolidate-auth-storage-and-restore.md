# Consolidate Auth Storage And Restore

## Goal

Make auth state restoration internally consistent by:

- adding tab-session restore coverage for `privateKey` and `noas`
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

- there is no recoverable material for a restore flow today
- reload restore becomes feasible if the normalized private key is stored in `sessionStorage`

Recommendation:

- add a `sessionStorage`-backed restore flow for `privateKey`
- keep it non-durable across tab close by avoiding `localStorage`
- centralize auth persistence so `privateKey` stores its key in session scope only

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
- reload restore becomes feasible if the derived signer key is stored in `sessionStorage` after successful auth

Recommendation:

- add a `sessionStorage`-backed restore flow for `noas` using the normalized signer key already derived after successful auth
- remove `STORAGE_KEY_NOAS_USERNAME`
- keep it non-durable across tab close by avoiding `localStorage`
- centralize auth persistence so `noas` stores only the session-scoped signer key plus any minimal metadata needed to rebuild the signed-in user profile

## Opinionated Direction

Persist only data that matches the intended lifetime of the auth mode.

- `guest` continues to restore from persisted guest nsec
- `extension` continues to restore by probing NIP-07 availability
- `nostrConnect` continues to restore from persisted bunker metadata
- `privateKey` restores from `sessionStorage` only
- `noas` restores from `sessionStorage` only, using the signer key already available after auth
- `localStorage` remains reserved for auth modes intentionally durable across browser restarts

The practical implementation is therefore:

- keep durable auth persistence where it already exists and is intentional
- add non-durable reload persistence for `privateKey` and `noas`
- remove stale or redundant auth keys
- centralize storage decisions so auth mode and key lifetime stay aligned

## Steps

1. Introduce shared auth-storage helpers in the provider layer.
   - Centralize `localStorage`/`sessionStorage` reads, writes, and cleanup for auth method and related keys.
   - Eliminate duplicated persistence logic between `ndk-provider.tsx` and `use-auth-actions.ts`.

2. Align persistence with restorable behavior.
   - Remove `STORAGE_KEY_NOAS_USERNAME`.
   - Add session-scoped key storage for `privateKey`.
   - Add session-scoped key storage for `noas` after successful key derivation.
   - Persist `STORAGE_KEY_AUTH` only when a matching restore path exists for the selected storage lifetime.
   - Keep cleanup on boot/logout for stale legacy values and old `nostr_noas_username` data.

3. Add/update tests around auth restore behavior.
   - Cover startup restore for each supported persisted auth mode.
   - Cover reload restore for `privateKey` and `noas` from `sessionStorage`.
   - Cover stale auth-method cleanup for incomplete or legacy persisted state.
   - Cover removal of dead Noas username persistence.

4. Verify and commit.
   - Run focused tests for provider/storage behavior.
   - Run broader checks if the final change scope expands across the provider significantly.

## Expected Outcome

After the change, every auth storage key should satisfy one of two rules:

- it is required for a working restore path with an explicit lifetime (`localStorage` or `sessionStorage`)
- it is removed as dead state

That leaves storage behavior smaller, more predictable, and aligned with the product’s durability policy for each auth method.
