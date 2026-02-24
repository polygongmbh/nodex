import { describe, expect, it } from "vitest";
import {
  buildImetaTag,
  extractEmbeddableAttachmentsFromContent,
  extractUrlsFromContent,
  guessMimeTypeFromUrl,
  isImageAttachment,
  isSafeHttpUrl,
  normalizePublishedAttachments,
  parseImetaTag,
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
      "size 123",
      "alt Cat",
    ]);
    expect(parsed).toEqual({
      url: "https://a.com/cat.jpg",
      mimeType: "image/jpeg",
      sha256: "hash",
      size: 123,
      alt: "Cat",
      dimensions: undefined,
      blurhash: undefined,
      name: undefined,
    });
    expect(buildImetaTag(parsed || { url: "https://a.com/cat.jpg" })).toContain("url https://a.com/cat.jpg");
  });

  it("detects image attachments", () => {
    expect(isImageAttachment({ url: "https://a.com/cat.png" })).toBe(true);
    expect(isImageAttachment({ url: "https://a.com/file.pdf", mimeType: "application/pdf" })).toBe(false);
  });
});
