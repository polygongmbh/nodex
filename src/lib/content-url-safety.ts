/**
 * URL scheme safety for rendered content. Shared by the autolink detectors
 * (which must not create links for dangerous schemes) and by react-markdown's
 * `urlTransform` (which sanitizes every link/image URL it renders).
 *
 * React-free and pure.
 */

export const DANGEROUS_SCHEMES = new Set([
  "javascript",
  "vbscript",
  "data",
  "file",
]);

const SAFE_SCHEMES = new Set([
  "http",
  "https",
  "mailto",
  "tel",
  "sms",
  "ftp",
  "ftps",
  "sftp",
  "ssh",
  "irc",
  "ircs",
  "xmpp",
  "magnet",
  "bitcoin",
  "lightning",
  "nostr",
  "geo",
  "matrix",
  "tg",
  "spotify",
]);

/** The lowercased scheme of a URL, or "" when it has no protocol. */
export function schemeOf(url: string): string {
  const colon = url.indexOf(":");
  return colon === -1 ? "" : url.slice(0, colon).toLowerCase();
}

/**
 * URL sanitizer for `react-markdown`'s `urlTransform`. Mirrors the relative-vs-
 * protocol colon logic of react-markdown's `defaultUrlTransform`, then allows a
 * broad set of safe schemes plus any `scheme://` URL, while blocking the
 * dangerous ones. Without this, react-markdown strips `tel:` and custom schemes
 * even from links we generate ourselves.
 */
export function transformContentUrl(url: string): string {
  const colon = url.indexOf(":");
  const slash = url.indexOf("/");
  const questionMark = url.indexOf("?");
  const numberSign = url.indexOf("#");

  if (
    colon === -1 ||
    (slash !== -1 && colon > slash) ||
    (questionMark !== -1 && colon > questionMark) ||
    (numberSign !== -1 && colon > numberSign)
  ) {
    return url; // no protocol → relative URL, safe
  }

  const scheme = url.slice(0, colon).toLowerCase();
  if (DANGEROUS_SCHEMES.has(scheme)) return "";
  if (SAFE_SCHEMES.has(scheme)) return url;
  if (url.slice(colon + 1).startsWith("//")) return url; // any other scheme://
  return "";
}
