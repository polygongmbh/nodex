import { describe, expect, it } from "vitest";
import {
  buildImetaTag,
  extractSha256FromUrl,
  extractEmbeddableAttachmentsFromContent,
  extractUrlsFromContent,
  guessMimeTypeFromUrl,
  isImageAttachment,
  isSafeHttpUrl,
  normalizePublishedAttachments,
  parseImetaTag,
  parseNip94AttachmentMetadataTags,
} from "@/lib/attachments";

describe("attachments helpers", () => {
  it("extracts only safe http(s) urls from content", () => {
    const urls = extractUrlsFromContent("See https://a.com and http://b.com and file:///tmp/test");
    expect(urls).toEqual(["https://a.com", "http://b.com"]);
  });

  it("rejects non-http protocols", () => {
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("https://example.com")).toBe(true);
  });

  it("guesses mime type from extension", () => {
    expect(guessMimeTypeFromUrl("https://a.com/cat.png")).toBe("image/png");
    expect(guessMimeTypeFromUrl("https://a.com/file.unknown")).toBeUndefined();
  });

  it("normalizes and deduplicates attachment urls", () => {
    expect(
      normalizePublishedAttachments([
        { url: "https://a.com/file.pdf" },
        { url: "https://a.com/file.pdf", mimeType: "application/pdf" },
      ])
    ).toEqual([{ url: "https://a.com/file.pdf" }]);
  });

  it("extracts embeddable attachments from content", () => {
    expect(extractEmbeddableAttachmentsFromContent("See https://a.com/cat.jpg")).toEqual([
      { url: "https://a.com/cat.jpg", mimeType: "image/jpeg" },
    ]);
  });

  it("parses and rebuilds imeta tags", () => {
    const parsed = parseImetaTag([
      "imeta",
      "url https://a.com/cat.jpg",
      "m image/jpeg",
      "x hash",
      "ox oldhash",
      "size 123",
      "alt Cat",
      "thumb https://a.com/thumb.jpg",
      "image https://a.com/preview.jpg",
      "summary Nice cat",
      "service blossom",
      "magnet magnet:?xt=urn:btih:abc",
      "i abc",
      "fallback https://cdn.a.com/cat.jpg",
    ]);
    expect(parsed).toEqual({
      url: "https://a.com/cat.jpg",
      mimeType: "image/jpeg",
      sha256: "hash",
      originalSha256: "oldhash",
      size: 123,
      alt: "Cat",
      dimensions: undefined,
      blurhash: undefined,
      name: undefined,
      thumbnailUrl: "https://a.com/thumb.jpg",
      previewImageUrl: "https://a.com/preview.jpg",
      summary: "Nice cat",
      service: "blossom",
      magnet: "magnet:?xt=urn:btih:abc",
      infohash: "abc",
      fallbackUrls: ["https://cdn.a.com/cat.jpg"],
      extra: undefined,
    });
    expect(buildImetaTag(parsed || { url: "https://a.com/cat.jpg" })).toContain("url https://a.com/cat.jpg");
  });

  it("omits imeta tags that only contain url", () => {
    expect(buildImetaTag({ url: "https://a.com/cat.jpg" })).toEqual([]);
  });

  it("detects image attachments", () => {
    expect(isImageAttachment({ url: "https://a.com/cat.png" })).toBe(true);
    expect(isImageAttachment({ url: "https://a.com/file.pdf", mimeType: "application/pdf" })).toBe(false);
  });

  it("extracts blossom-style sha256 from URL path", () => {
    const sha = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    expect(extractSha256FromUrl(`https://blossom.example/${sha}`)).toBe(sha);
    expect(extractSha256FromUrl("https://a.com/file.png")).toBeUndefined();
  });

  it("parses NIP-94/BUD top-level attachment metadata tags", () => {
    expect(
      parseNip94AttachmentMetadataTags([
        ["x", "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"],
        ["m", "image/png"],
        ["size", "512"],
        ["url", "https://cdn.example.com/cat.png"],
        ["alt", "Cat"],
      ])
    ).toEqual([
      {
        sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        mimeType: "image/png",
        size: 512,
      },
      {
        url: "https://cdn.example.com/cat.png",
        alt: "Cat",
      },
    ]);
  });
});
