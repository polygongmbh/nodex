import LinkifyIt from "linkify-it";
import type { PublishedAttachment } from "@/types";

const linkify = new LinkifyIt();

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "svg"]);
const FILE_MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  zip: "application/zip",
  gz: "application/gzip",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  mov: "video/quicktime",
};

const SHA256_HEX_REGEX = /([a-fA-F0-9]{64})(?:$|[^a-fA-F0-9])/;

type AttachmentMetadataCandidate = Omit<PublishedAttachment, "url"> & { url?: string };
const SUPPORTED_NIP94_KEYS = new Set([
  "url",
  "m",
  "x",
  "ox",
  "size",
  "dim",
  "blurhash",
  "alt",
  "name",
  "thumb",
  "image",
  "summary",
  "service",
  "magnet",
  "i",
  "fallback",
]);

export function isSafeHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function extractUrlsFromContent(content: string): string[] {
  const matches = linkify.match(content) || [];
  return Array.from(
    new Set(
      matches
        .map((match) => match.url)
        .filter((url): url is string => Boolean(url) && isSafeHttpUrl(url))
    )
  );
}

function getUrlPathExtension(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const lastSegment = parsed.pathname.split("/").pop() || "";
    const dotIndex = lastSegment.lastIndexOf(".");
    if (dotIndex <= 0 || dotIndex === lastSegment.length - 1) return undefined;
    return lastSegment.slice(dotIndex + 1).toLowerCase();
  } catch {
    return undefined;
  }
}

export function guessMimeTypeFromUrl(url: string): string | undefined {
  const ext = getUrlPathExtension(url);
  if (!ext) return undefined;
  return FILE_MIME_BY_EXTENSION[ext];
}

export function extractSha256FromUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname;
    const withSentinel = `${pathname}/`;
    const match = withSentinel.match(SHA256_HEX_REGEX);
    if (!match?.[1]) return undefined;
    return match[1].toLowerCase();
  } catch {
    return undefined;
  }
}

export function isImageAttachment(attachment: Pick<PublishedAttachment, "url" | "mimeType">): boolean {
  const mimeType = attachment.mimeType?.toLowerCase();
  if (mimeType?.startsWith("image/")) return true;
  const ext = getUrlPathExtension(attachment.url);
  return Boolean(ext && IMAGE_EXTENSIONS.has(ext));
}

export function normalizePublishedAttachments(attachments: PublishedAttachment[]): PublishedAttachment[] {
  const seen = new Set<string>();
  const normalized: PublishedAttachment[] = [];
  for (const attachment of attachments) {
    const url = attachment.url?.trim();
    if (!url || !isSafeHttpUrl(url)) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({
      ...attachment,
      url,
      mimeType: attachment.mimeType?.trim(),
      sha256: attachment.sha256?.trim(),
      originalSha256: attachment.originalSha256?.trim(),
      blurhash: attachment.blurhash?.trim(),
      dimensions: attachment.dimensions?.trim(),
      alt: attachment.alt?.trim(),
      name: attachment.name?.trim(),
      thumbnailUrl: attachment.thumbnailUrl?.trim(),
      previewImageUrl: attachment.previewImageUrl?.trim(),
      summary: attachment.summary?.trim(),
      service: attachment.service?.trim(),
      magnet: attachment.magnet?.trim(),
      infohash: attachment.infohash?.trim(),
      fallbackUrls: attachment.fallbackUrls?.map((value) => value.trim()).filter(Boolean),
      extra: attachment.extra,
    });
  }
  return normalized;
}

export function extractEmbeddableAttachmentsFromContent(content: string): PublishedAttachment[] {
  const urls = extractUrlsFromContent(content);
  return normalizePublishedAttachments(
    urls.map((url) => ({
      url,
      mimeType: guessMimeTypeFromUrl(url),
    }))
  );
}

export function parseImetaTag(tag: string[]): PublishedAttachment | null {
  if (tag[0]?.toLowerCase() !== "imeta") return null;

  let url = "";
  let mimeType: string | undefined;
  let sha256: string | undefined;
  let originalSha256: string | undefined;
  let size: number | undefined;
  let dimensions: string | undefined;
  let blurhash: string | undefined;
  let alt: string | undefined;
  let name: string | undefined;
  let thumbnailUrl: string | undefined;
  let previewImageUrl: string | undefined;
  let summary: string | undefined;
  let service: string | undefined;
  let magnet: string | undefined;
  let infohash: string | undefined;
  const fallbackUrls: string[] = [];
  const extra: Record<string, string> = {};

  for (let index = 1; index < tag.length; index += 1) {
    const value = (tag[index] || "").trim();
    if (!value) continue;

    if (isSafeHttpUrl(value) && !url) {
      url = value;
      continue;
    }

    const spaceIndex = value.indexOf(" ");
    if (spaceIndex <= 0) continue;
    const key = value.slice(0, spaceIndex).toLowerCase();
    const payload = value.slice(spaceIndex + 1).trim();
    if (!payload) continue;

    if (key === "url") url = payload;
    if (key === "m") mimeType = payload;
    if (key === "x") sha256 = payload;
    if (key === "ox") originalSha256 = payload;
    if (key === "size") {
      const parsed = Number.parseInt(payload, 10);
      if (Number.isFinite(parsed)) size = parsed;
    }
    if (key === "dim") dimensions = payload;
    if (key === "blurhash") blurhash = payload;
    if (key === "alt") alt = payload;
    if (key === "name") name = payload;
    if (key === "thumb" && isSafeHttpUrl(payload)) thumbnailUrl = payload;
    if (key === "image" && isSafeHttpUrl(payload)) previewImageUrl = payload;
    if (key === "summary") summary = payload;
    if (key === "service") service = payload;
    if (key === "magnet") magnet = payload;
    if (key === "i") infohash = payload;
    if (key === "fallback" && isSafeHttpUrl(payload)) fallbackUrls.push(payload);
    if (!SUPPORTED_NIP94_KEYS.has(key)) extra[key] = payload;
  }

  if (!url || !isSafeHttpUrl(url)) return null;
  return {
    url,
    mimeType,
    sha256,
    originalSha256,
    size,
    dimensions,
    blurhash,
    alt,
    name,
    thumbnailUrl,
    previewImageUrl,
    summary,
    service,
    magnet,
    infohash,
    fallbackUrls: fallbackUrls.length > 0 ? fallbackUrls : undefined,
    extra: Object.keys(extra).length > 0 ? extra : undefined,
  };
}

function applyAttachmentMetadataField(candidate: AttachmentMetadataCandidate, key: string, value: string): void {
  if (key === "url" && isSafeHttpUrl(value)) candidate.url = value;
  if (key === "m") candidate.mimeType = value;
  if (key === "x") candidate.sha256 = value.toLowerCase();
  if (key === "ox") candidate.originalSha256 = value.toLowerCase();
  if (key === "size") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) candidate.size = parsed;
  }
  if (key === "dim") candidate.dimensions = value;
  if (key === "blurhash") candidate.blurhash = value;
  if (key === "alt") candidate.alt = value;
  if (key === "name") candidate.name = value;
  if (key === "thumb" && isSafeHttpUrl(value)) candidate.thumbnailUrl = value;
  if (key === "image" && isSafeHttpUrl(value)) candidate.previewImageUrl = value;
  if (key === "summary") candidate.summary = value;
  if (key === "service") candidate.service = value;
  if (key === "magnet") candidate.magnet = value;
  if (key === "i") candidate.infohash = value;
  if (key === "fallback" && isSafeHttpUrl(value)) {
    const previous = candidate.fallbackUrls || [];
    candidate.fallbackUrls = [...previous, value];
  }
}

export function parseNip94AttachmentMetadataTags(tags: string[][]): AttachmentMetadataCandidate[] {
  const candidates: AttachmentMetadataCandidate[] = [];
  let current: AttachmentMetadataCandidate | null = null;

  const ensureCurrent = (): AttachmentMetadataCandidate => {
    if (!current) {
      current = {};
      candidates.push(current);
    }
    return current;
  };

  for (const tag of tags) {
    const key = tag[0]?.toLowerCase();
    const rawValue = tag[1];
    const value = typeof rawValue === "string" ? rawValue.trim() : "";
    if (!key || !value) continue;
    if (!SUPPORTED_NIP94_KEYS.has(key)) continue;

    if (key === "url") {
      current = {};
      candidates.push(current);
      applyAttachmentMetadataField(current, key, value);
      continue;
    }

    if (key === "x") {
      const normalized = value.toLowerCase();
      const isHex64 = /^[a-f0-9]{64}$/.test(normalized);
      if (!isHex64) continue;
      if (!current || current.sha256) {
        current = {};
        candidates.push(current);
      }
      applyAttachmentMetadataField(current, key, normalized);
      continue;
    }

    const target = ensureCurrent();
    applyAttachmentMetadataField(target, key, value);
  }

  return candidates;
}

export function buildImetaTag(attachment: PublishedAttachment): string[] {
  const tag = ["imeta", `url ${attachment.url}`];
  if (attachment.mimeType) tag.push(`m ${attachment.mimeType}`);
  if (attachment.sha256) tag.push(`x ${attachment.sha256}`);
  if (attachment.originalSha256) tag.push(`ox ${attachment.originalSha256}`);
  if (typeof attachment.size === "number" && Number.isFinite(attachment.size)) {
    tag.push(`size ${Math.max(0, Math.round(attachment.size))}`);
  }
  if (attachment.dimensions) tag.push(`dim ${attachment.dimensions}`);
  if (attachment.blurhash) tag.push(`blurhash ${attachment.blurhash}`);
  if (attachment.alt) tag.push(`alt ${attachment.alt}`);
  if (attachment.name) tag.push(`name ${attachment.name}`);
  if (attachment.thumbnailUrl) tag.push(`thumb ${attachment.thumbnailUrl}`);
  if (attachment.previewImageUrl) tag.push(`image ${attachment.previewImageUrl}`);
  if (attachment.summary) tag.push(`summary ${attachment.summary}`);
  if (attachment.service) tag.push(`service ${attachment.service}`);
  if (attachment.magnet) tag.push(`magnet ${attachment.magnet}`);
  if (attachment.infohash) tag.push(`i ${attachment.infohash}`);
  (attachment.fallbackUrls || []).forEach((fallbackUrl) => {
    if (isSafeHttpUrl(fallbackUrl)) {
      tag.push(`fallback ${fallbackUrl}`);
    }
  });
  if (attachment.extra) {
    Object.entries(attachment.extra).forEach(([key, value]) => {
      const normalizedKey = key.trim().toLowerCase();
      const normalizedValue = value.trim();
      if (!normalizedKey || !normalizedValue) return;
      if (SUPPORTED_NIP94_KEYS.has(normalizedKey)) return;
      tag.push(`${normalizedKey} ${normalizedValue}`);
    });
  }
  // NIP-92 requires url plus at least one additional field.
  return tag.length > 2 ? tag : [];
}
