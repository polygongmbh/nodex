import { describe, expect, it } from "vitest";
import {
  parseAttachmentAspectRatio,
  resolveTaskImageSourceDecision,
} from "./task-image-source";

describe("resolveTaskImageSourceDecision", () => {
  it("uses the full image when no preview metadata exists", () => {
    expect(resolveTaskImageSourceDecision({
      src: "https://example.com/full.jpg",
      reducedDataMode: false,
      renderMode: "lightbox",
      fullImageRequested: false,
    })).toEqual({
      initialSrc: "https://example.com/full.jpg",
      previewSrc: undefined,
      shouldPreloadFullImage: false,
      fullImageBlockedByReducedData: false,
    });
  });

  it("keeps inline previews on preview metadata instead of preloading full images", () => {
    expect(resolveTaskImageSourceDecision({
      src: "https://example.com/full.jpg",
      previewImageUrl: "https://example.com/preview.jpg",
      reducedDataMode: false,
      renderMode: "inline",
      fullImageRequested: false,
    })).toEqual({
      initialSrc: "https://example.com/preview.jpg",
      previewSrc: "https://example.com/preview.jpg",
      shouldPreloadFullImage: false,
      fullImageBlockedByReducedData: false,
    });
  });

  it("blocks full-image preload in reduced-data mode until the user requests it", () => {
    expect(resolveTaskImageSourceDecision({
      src: "https://example.com/full.jpg",
      previewImageUrl: "https://example.com/preview.jpg",
      reducedDataMode: true,
      renderMode: "lightbox",
      fullImageRequested: false,
    })).toEqual({
      initialSrc: "https://example.com/preview.jpg",
      previewSrc: "https://example.com/preview.jpg",
      shouldPreloadFullImage: false,
      fullImageBlockedByReducedData: true,
    });
  });

  it("preloads the full image after explicit request in reduced-data mode", () => {
    expect(resolveTaskImageSourceDecision({
      src: "https://example.com/full.jpg",
      previewImageUrl: "https://example.com/preview.jpg",
      reducedDataMode: true,
      renderMode: "lightbox",
      fullImageRequested: true,
    })).toEqual({
      initialSrc: "https://example.com/preview.jpg",
      previewSrc: "https://example.com/preview.jpg",
      shouldPreloadFullImage: true,
      fullImageBlockedByReducedData: false,
    });
  });
});

describe("parseAttachmentAspectRatio", () => {
  it("parses width and height metadata", () => {
    expect(parseAttachmentAspectRatio("1152x864")).toBeCloseTo(1.333333, 5);
  });

  it("returns undefined for malformed metadata", () => {
    expect(parseAttachmentAspectRatio("wide")).toBeUndefined();
  });
});
