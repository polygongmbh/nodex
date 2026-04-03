# Respect Mobile Data Saver Mode

## Goal

Make Nodex reduce network and media usage on mobile when the browser exposes a reduced-data signal, while still giving users a reliable manual override because browser support is incomplete.

## Current Status

The groundwork is already partially landed:
- reduced-data preference persistence exists in `src/infrastructure/preferences/user-preferences-storage.ts`
- the browser-signal hook exists in `src/hooks/use-reduced-data-mode.ts`
- image/lightbox media gating exists through `TaskProgressiveImage` and `TaskMediaLightbox`
- reduced-data tests already exist around media behavior

What is still missing:
- a user-facing setting in mobile UI
- avatar gating in `UserAvatar`
- richer inline embed deferral
- any meaningful subscription/network-throttling rollout
- explicit reduced-data handling for local caption-model downloads

## Feasibility

This is possible from a browser application, but only partially via automatic detection.

- `navigator.connection.saveData` can expose a user-enabled reduced-data preference in some browsers.
- `navigator.connection.effectiveType` can provide a weak network-quality hint and should only be used to soften defaults, not to imply user intent.
- `prefers-reduced-data` is not reliable enough to use as the primary trigger across mobile browsers.
- A manual in-app toggle is required for consistent behavior across Safari/iOS and other browsers that do not expose a usable signal.

## Product Decision

Introduce a single app preference with three modes:

1. `auto`
2. `on`
3. `off`

Behavior:

- `auto`: respect `navigator.connection.saveData === true` when available.
- `on`: always run the app in reduced-data mode.
- `off`: never reduce data beyond the current default behavior.

This should be presented in mobile-accessible settings as "Reduce data usage" with `Auto`, `On`, and `Off`.

## Likely Impact Areas

Based on the current codebase, the main wins are here:

- Remote avatars in [src/components/ui/user-avatar.tsx](/Users/tj/IT/nodex/src/components/ui/user-avatar.tsx)
- Inline/preview media and the lightbox in [src/components/tasks/TaskMediaLightbox.tsx](/Users/tj/IT/nodex/src/components/tasks/TaskMediaLightbox.tsx)
- Attachment embedding from links in [src/lib/linkify.tsx](/Users/tj/IT/nodex/src/lib/linkify.tsx)
- Profile/event subscription pressure in [src/hooks/use-nostr-profiles.tsx](/Users/tj/IT/nodex/src/hooks/use-nostr-profiles.tsx), [src/hooks/use-nostr-event-cache.tsx](/Users/tj/IT/nodex/src/hooks/use-nostr-event-cache.tsx), and [src/lib/nostr/provider/ndk-provider.tsx](/Users/tj/IT/nodex/src/lib/nostr/provider/ndk-provider.tsx)
- Optional local caption-model downloads in [src/lib/local-image-caption.ts](/Users/tj/IT/nodex/src/lib/local-image-caption.ts)

## Implementation Plan

### 1. Add a reduced-data preference layer

This is already landed:
- persistence in `src/infrastructure/preferences/user-preferences-storage.ts`
- state resolution in `src/hooks/use-reduced-data-mode.ts`

Remaining refinement:
- decide whether `effectiveType` should stay out entirely, or be used only for non-blocking messaging

### 2. Expose the setting in the mobile UI

- Add the control to the existing mobile-accessible settings or management surface rather than burying it in desktop-only UI.
- Show a short description:
  - `Auto` follows browser/system signal when available.
  - `On` always reduces media/network usage.
  - `Off` disables the optimization.
- Add a success toast when the user changes the mode.

### 3. Gate expensive media by default

- Suppress eager remote avatar image loading in reduced-data mode and prefer the existing beam/avatar fallback unless the user explicitly opens a profile or task that needs the image.
- Disable autoplay for video in the media lightbox when reduced-data mode is active.
- Ensure media elements keep `preload="metadata"` or stricter behavior; do not upgrade preload behavior under reduced-data mode.
- For inline linked media previews, show a lightweight placeholder with a tap-to-load action instead of auto-fetching rich embeds.

Current state:
- video autoplay gating is already landed in `TaskMediaLightbox`
- progressive full-image deferral is already landed in `TaskProgressiveImage`
- avatar and link-preview gating still remain

### 4. Reduce background network pressure

- Review subscription bootstrap paths and lower initial limits or defer secondary subscriptions in reduced-data mode.
- Favor loading visible/active task data first before fetching secondary profile enrichment.
- Avoid speculative or duplicate profile fetches while scrolling mobile feeds.

### 5. Block large optional downloads

- In reduced-data mode, do not automatically preload the local image caption model.
- Require explicit user confirmation before model download and include the reason in the toast/copy.

### 6. Add debug logging for the feature

- In dev/debug builds, log:
  - detected browser signal
  - stored mode
  - final effective reduced-data state
  - any major gating decisions such as skipped avatar/media/subscription work
- Keep production logging quiet unless debug flags are enabled.

## Testing Plan

This is a cross-view behavior change, so treat it as major verification work.

- Unit tests for preference resolution:
  - `auto` + `saveData=true`
  - `auto` + no browser support
  - forced `on`
  - forced `off`
- Component tests proving:
  - avatars fall back instead of loading remote image in reduced-data mode
  - video lightbox does not autoplay in reduced-data mode
  - inline media requires explicit user action before loading
- Focused tests around subscription throttling if limits or sequencing change
- Verification commands:
  - `npm run lint`
  - `npx vitest run`
  - `npm run build`

## Rollout Notes

- Default to `auto` for existing users.
- Treat this as a user-visible feature and add an `Unreleased` changelog entry if implemented.
- If protocol behavior is unaffected, no NIP note is needed; if relay subscription behavior changes materially, note the scope in commit/review text.
