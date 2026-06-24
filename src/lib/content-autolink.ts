import LinkifyIt from "linkify-it";
import { DANGEROUS_SCHEMES, schemeOf } from "@/lib/content-url-safety";

/**
 * Autolinking that complements `remark-gfm`. gfm already turns `http(s)://`,
 * `www.`, and bare emails into links during parsing; this module adds the cases
 * gfm misses, operating on the leftover mdast text nodes:
 *
 * - any other `scheme://…` URL (ftp, ssh, ws, custom app schemes, …)
 * - explicit `mailto:`/`tel:` links, rendered without the scheme prefix
 * - bare phone numbers in international form (`+…` / `00…`, E.164)
 * - bare domains (`example.com`), excluding common file extensions
 *
 * It is intentionally React-free: it produces plain mdast nodes and is wired
 * into `react-markdown` from `linkify.tsx`. URL scheme safety lives in
 * `content-url-safety.ts`.
 */

// ---------------------------------------------------------------------------
// Minimal mdast shapes (we only touch what we read/write).
// ---------------------------------------------------------------------------

interface MdastText {
  type: "text";
  value: string;
}

interface MdastLink {
  type: "link";
  url: string;
  title: null;
  children: MdastText[];
}

type MdastNode =
  | MdastText
  | MdastLink
  | { type: string; value?: string; children?: MdastNode[]; url?: string };

// mdast node types whose text descendants must NOT be re-linkified.
const SKIP_NODE_TYPES = new Set([
  "link",
  "linkReference",
  "inlineCode",
  "code",
  "image",
  "imageReference",
  "html",
]);

// ---------------------------------------------------------------------------
// Detectors. Each yields candidate intervals over a text node's value.
// ---------------------------------------------------------------------------

// Bare-domain detection only; gfm owns http/www/email and our regexes own the
// explicit schemes, so we read just the fuzzy (`schema === ""`) matches.
const bareDomainLinkifier = new LinkifyIt({
  fuzzyLink: true,
  fuzzyEmail: false,
  fuzzyIP: false,
});

// Extensions that are also valid TLDs, so linkify-it's TLD gate lets them
// through as "domains". Treat `report.zip` / `readme.md` as filenames, not URLs.
// Every other common extension (.txt, .pdf, .png, .csv, …) is not a TLD and is
// already excluded by linkify-it.
const FILENAME_LIKE_TLDS = new Set(["zip", "mov", "md", "sh"]);

// Any `scheme://…` URL. gfm has already consumed http/https in practice; this
// catches ftp/ssh/ws/custom schemes left in the text.
const SCHEME_URL_REGEX = /(?<![\w@.+-])[a-z][a-z0-9+.-]*:\/\/[^\s<>]+/gi;
// Explicit mailto: / tel: links (no `//`, so SCHEME_URL_REGEX won't see them).
const MAILTO_REGEX = /(?<![\w.+-])mailto:[^\s<>]+/gi;
const TEL_REGEX = /(?<![\w.+-])tel:\+?\d[\d\s()./-]{5,18}\d/gi;
// Bare international phone numbers: leading + or 00, validated for digit count.
const PHONE_REGEX = /(?<![\w.+])(?:\+|00)\d[\d\s()./-]{5,16}\d(?!\w)/g;

interface Candidate {
  start: number;
  end: number;
  url: string;
  display: string;
}

/** Strip trailing sentence punctuation and unbalanced closers from a URL. */
function trimTrailingPunctuation(url: string): string {
  let end = url.length;
  while (end > 0) {
    const ch = url[end - 1];
    if (".,;:!?…\"'".includes(ch)) {
      end -= 1;
      continue;
    }
    if (ch === ")" || ch === "]" || ch === "}") {
      const open = ch === ")" ? "(" : ch === "]" ? "[" : "{";
      const slice = url.slice(0, end);
      const opens = slice.split(open).length - 1;
      const closes = slice.split(ch).length - 1;
      if (closes > opens) {
        end -= 1;
        continue;
      }
    }
    break;
  }
  return url.slice(0, end);
}

/** Convert a phone string to a normalized `tel:+<digits>` URI (00 → +). */
function toTelUrl(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  return `tel:+${digits}`;
}

/** Count of E.164-significant digits, or 0 if outside the 8–15 range. */
function significantPhoneDigits(raw: string): number {
  let digits = raw.replace(/\D/g, "");
  if (raw.trim().startsWith("00")) digits = digits.slice(2);
  return digits.length >= 8 && digits.length <= 15 ? digits.length : 0;
}

interface DetectedLink {
  /** Length of source text consumed (may be < raw match after trimming). */
  consumed: number;
  url: string;
  display: string;
}

function collectCandidates(text: string): Candidate[] {
  const candidates: Candidate[] = [];

  const pushRegex = (
    regex: RegExp,
    build: (raw: string) => DetectedLink | null
  ) => {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const built = build(match[0]);
      if (built) {
        candidates.push({
          start: match.index,
          end: match.index + built.consumed,
          url: built.url,
          display: built.display,
        });
      }
    }
  };

  // scheme:// URLs (any scheme, dangerous ones dropped)
  pushRegex(SCHEME_URL_REGEX, (raw) => {
    const url = trimTrailingPunctuation(raw);
    if (DANGEROUS_SCHEMES.has(schemeOf(url))) return null;
    return { consumed: url.length, url, display: url };
  });

  // mailto:
  pushRegex(MAILTO_REGEX, (raw) => {
    const url = trimTrailingPunctuation(raw);
    if (!url.includes("@")) return null;
    return { consumed: url.length, url, display: url.replace(/^mailto:/i, "") };
  });

  // tel: (rendered without the scheme prefix)
  pushRegex(TEL_REGEX, (raw) => {
    const number = raw.replace(/^tel:/i, "");
    if (significantPhoneDigits(number) === 0) return null;
    return { consumed: raw.length, url: toTelUrl(number), display: number };
  });

  // bare phone numbers
  pushRegex(PHONE_REGEX, (raw) => {
    if (significantPhoneDigits(raw) === 0) return null;
    return { consumed: raw.length, url: toTelUrl(raw), display: raw };
  });

  // bare domains (linkify-it fuzzy matches only)
  const matches = bareDomainLinkifier.match(text) || [];
  for (const match of matches) {
    if (match.schema !== "" || !match.url || !match.text) continue;
    const hasPath = match.text.includes("/");
    if (!hasPath) {
      const lastLabel = match.text.split(".").pop()?.toLowerCase() ?? "";
      if (FILENAME_LIKE_TLDS.has(lastLabel)) continue;
    }
    candidates.push({
      start: match.index,
      end: match.lastIndex,
      url: match.url,
      display: match.text,
    });
  }

  return candidates;
}

/**
 * Split a plain text string into mdast text/link nodes, autolinking the URLs,
 * emails, phone numbers, and bare domains gfm doesn't handle. Returns a single
 * text node (unchanged) when nothing matches.
 */
export function splitTextIntoAutolinkNodes(text: string): MdastNode[] {
  const candidates = collectCandidates(text);
  if (candidates.length === 0) return [{ type: "text", value: text }];

  // Earliest start first, longest on tie, then accept greedily without overlap.
  candidates.sort((a, b) => a.start - b.start || b.end - a.end);

  const nodes: MdastNode[] = [];
  let cursor = 0;
  for (const candidate of candidates) {
    if (candidate.start < cursor) continue; // overlaps an accepted candidate
    if (candidate.start > cursor) {
      nodes.push({ type: "text", value: text.slice(cursor, candidate.start) });
    }
    nodes.push({
      type: "link",
      url: candidate.url,
      title: null,
      children: [{ type: "text", value: candidate.display }],
    });
    cursor = candidate.end;
  }
  if (cursor < text.length) {
    nodes.push({ type: "text", value: text.slice(cursor) });
  }

  return nodes;
}

/** Recursively replace text nodes outside of links/code with autolinked nodes. */
function walk(node: MdastNode): void {
  const children = (node as { children?: MdastNode[] }).children;
  if (!Array.isArray(children)) return;

  const next: MdastNode[] = [];
  let changed = false;
  for (const child of children) {
    if (child.type === "text" && typeof child.value === "string") {
      const replacement = splitTextIntoAutolinkNodes(child.value);
      if (replacement.length === 1) {
        next.push(child);
      } else {
        next.push(...replacement);
        changed = true;
      }
    } else {
      if (!SKIP_NODE_TYPES.has(child.type)) walk(child);
      next.push(child);
    }
  }
  if (changed) (node as { children?: MdastNode[] }).children = next;
}

/**
 * remark plugin that autolinks the schemes/patterns `remark-gfm` doesn't cover.
 * Runs as a tree transformer after parsing, so gfm's own links and code spans
 * are already separate nodes we skip.
 */
export function remarkAutolinkExtras() {
  return (tree: MdastNode): void => {
    walk(tree);
  };
}
