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
      blurhash: attachment.blurhash?.trim(),
      dimensions: attachment.dimensions?.trim(),
      alt: attachment.alt?.trim(),
      name: attachment.name?.trim(),
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
  let size: number | undefined;
  let dimensions: string | undefined;
  let blurhash: string | undefined;
  let alt: string | undefined;
  let name: string | undefined;

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
    if (key === "size") {
      const parsed = Number.parseInt(payload, 10);
      if (Number.isFinite(parsed)) size = parsed;
    }
    if (key === "dim") dimensions = payload;
    if (key === "blurhash") blurhash = payload;
    if (key === "alt") alt = payload;
    if (key === "name") name = payload;
  }

  if (!url || !isSafeHttpUrl(url)) return null;
  return {
    url,
    mimeType,
    sha256,
    size,
    dimensions,
    blurhash,
    alt,
    name,
  };
}

export function buildImetaTag(attachment: PublishedAttachment): string[] {
  const tag = ["imeta", `url ${attachment.url}`];
  if (attachment.mimeType) tag.push(`m ${attachment.mimeType}`);
  if (attachment.sha256) tag.push(`x ${attachment.sha256}`);
  if (typeof attachment.size === "number" && Number.isFinite(attachment.size)) {
    tag.push(`size ${Math.max(0, Math.round(attachment.size))}`);
  }
  if (attachment.dimensions) tag.push(`dim ${attachment.dimensions}`);
  if (attachment.blurhash) tag.push(`blurhash ${attachment.blurhash}`);
  if (attachment.alt) tag.push(`alt ${attachment.alt}`);
  if (attachment.name) tag.push(`name ${attachment.name}`);
  return tag;
}
