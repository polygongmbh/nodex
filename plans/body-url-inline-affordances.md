# Render Body URLs As Inferred Inline Affordances

## Problem

Body content can contain URLs that point at media or files but
arrive without any nostr-side metadata to identify them. After the
read-side scrape was removed in `0704eb19`, these URLs render as
plain inline hyperlinks regardless of what they actually point at,
which loses useful affordances the old (overly broad) "URL chip"
path used to provide.

Two distinct gaps to close, both at the render layer only — neither
should touch `task.attachments`:

1. **Extension-less media URLs.** Some CDNs serve images at paths
   that don't include a file extension (e.g.
   `https://cat.melonion.me/d/CM38cTqjpXcXZfzzYNwqru`). Linkify's
   `getEmbeddableMediaKind` relies on `guessMimeTypeFromUrl` (which
   reads the URL extension), so these never become standalone
   embeds. Today they render as bare text links even when they
   really are images.

2. **Non-media file URLs with recognisable extensions.** A foreign
   post containing `https://files.example.com/report.pdf` and no
   imeta/nip-94 tags now renders as a plain hyperlink. The URL has
   a clearly inferable mime type (`application/pdf`) and used to
   surface as a `FileText` chip in `TaskAttachmentList`, but that
   path went away with the converter scrape — and re-introducing it
   via attachments is the wrong shape because it would also bring
   back the URL-chip pollution the cleanup removed.

The remaining cases work and should stay untouched:

- Authored-by-Nodex `.pdf` / `.jpg` URLs get an imeta tag at publish
  time (the publish-side scrape that survived the cleanup, see
  memory `publish-auto-imeta-for-body-urls`), so on read they
  arrive as proper attachments via `imetaAttachments`.
- Blossom-style URLs whose path embeds a sha256 matched by a
  top-level `x`/`m`/`size` tag group are paired up by the narrow
  enrichment path restored in `42a212e6`.
- Standalone URLs with recognisable media extensions
  (`.jpg`, `.mp4`, etc.) already render inline via linkify's
  existing standalone-embed path.

## Opinionated Approach

Solve both gaps in `src/lib/linkify.tsx` at the URL-rendering
boundary. Nothing about the converter, `task.attachments`, or the
attachment-list rendering layer changes.

Add two new fallback nodes that linkify can emit when it would
otherwise produce a plain `<a>` text link for a standalone URL on
its own line:

- **Speculative `<img>` with `onError` fallback** for URLs that
  yield no media kind from extension alone. Render an `<img>`; on
  load failure, swap the node to the plain `<a>` text link the
  current code would emit. The browser performs one GET either way,
  so there is no extra network cost vs the existing inline-image
  path. Restrict to standalone-line URLs only — mid-sentence URLs
  must stay text to avoid hijacking incidental links.

- **Inline file chip** for URLs whose extension yields a non-media
  mime type (`application/pdf`, `application/zip`, etc.). Render a
  small inline `FileText`-style chip with the inferred mime icon
  and the URL's last path segment as a label. Open the URL in a
  new tab on click, matching the existing standalone-link behavior.
  This is a render-layer reuse of the same visual treatment that
  used to live in `TaskAttachmentList`'s `linkItems` branch — just
  emitted inline, in flow, from linkify rather than from a separate
  attachment-list area.

Both fallbacks are render-only. Neither contributes to
`task.attachments`, `getStandaloneEmbeddableUrls`, the paperclip
indicator count, the media gallery, or any persisted store. The
paperclip indicator continues to mean "files explicitly attached
via imeta or nip-94 tags."

Standalone-line scope for both is important: any URL embedded
mid-sentence stays a plain text link. The intent signal in Nodex
("paste a URL on its own line, expect rich treatment") is what
distinguishes a media share from an inline reference.

## Implementation Steps

1. **Image speculation node** in `src/lib/linkify.tsx`:
   - Extend `renderStandaloneEmbed` so a standalone URL with no
     resolvable media kind (`getEmbeddableMediaKind` returns `null`)
     and no inferable file mime (i.e. truly extension-less) falls
     through to a `SpeculativeImageEmbed` component.
   - `SpeculativeImageEmbed` is a small inline component using
     `useState` for the load-failed flag: renders `<img src={url}>`
     until `onError` fires, then renders the plain `<a>` link node
     the previous code would have produced.
   - No global cache for the first cut. Same-session re-renders of
     the same post reuse the local component state.

2. **File chip node** in `src/lib/linkify.tsx`:
   - For a standalone URL whose extension yields a non-media mime
     via `guessMimeTypeFromUrl`, emit an `InlineFileChip` node.
     Reuse the visual style and `FileText` icon currently in
     `TaskAttachmentList`'s `linkItems` branch.
   - Use `getUrlExtension` + the URL's last path segment to derive
     a label. No async work.

3. **Decide which fallback fires when both could apply.**
   Extension-less → image speculation. Non-media extension → file
   chip. Recognised-media extension → existing standalone embed.
   Document the precedence inline near `renderStandaloneEmbed`.

4. **Tests** in `src/lib/linkify.test.tsx`:
   - Standalone extension-less URL renders an `<img>`; on simulated
     `onError`, collapses to an `<a>`.
   - Mid-sentence extension-less URL stays a plain `<a>` (no
     speculation, no chip).
   - Standalone `.pdf` URL renders a `FileText` chip with the
     filename as label.
   - Standalone `.jpg` URL still renders the existing image embed
     unchanged.
   - Standalone `application/zip` URL renders a chip; mid-sentence
     `.zip` URL stays a plain `<a>`.

5. **Verify downstream consumers stay clean.** Re-read
   `useTaskMediaAttachments` (paperclip indicator source),
   `collectTaskMediaItems` (media gallery), and
   `TaskAttachmentList`. None should observe the new nodes; they
   key off `task.attachments` and `getStandaloneEmbeddableUrls`,
   neither of which the new render nodes feed into.

6. **Manual verification**:
   - `npm run dev`. Post a body with each of these on its own line:
     `https://cat.melonion.me/d/CM38cTqjpXcXZfzzYNwqru`,
     `https://files.example.com/report.pdf`,
     `https://example.com/not-an-image`.
     Confirm: image embed, file chip, plain hyperlink (after
     the speculative `<img>` errors out).
   - Confirm the paperclip indicator does not count any of these.

## Expected Outcome

Foreign-client body URLs render appropriately without re-introducing
URL-chip pollution into `task.attachments`:

- Extension-less media → inline image.
- Non-media files → inline file chip.
- Plain hyperlinks (no extension hint, fails image speculation) →
  text link.

`task.attachments` remains strictly tag-derived. The cleanup from
`0704eb19` and `42a212e6` stays intact; the paperclip indicator
and attachment-list rendering continue to mean "what the author
explicitly tagged."

## Out of Scope

- Persistent Content-Type cache across reloads.
- HEAD-probe-based detection (extra round trip; speculative `<img>`
  already gets the answer for free).
- Re-introducing the `TaskAttachmentList` URL-chip branch as a
  separate listing area — the inline chip replaces it in flow.
- Speculative video/audio rendering (extension-less). `<video>` /
  `<audio>` autoplay semantics make failure noisier; defer until a
  real need surfaces.
- Mid-sentence URL rewriting of any kind.
