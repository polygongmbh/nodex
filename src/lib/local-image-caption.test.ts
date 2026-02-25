import { describe, expect, it } from "vitest";
import { extractCaptionFromInference } from "./local-image-caption";

describe("local-image-caption helpers", () => {
  it("extracts and normalizes caption text from pipeline output", () => {
    const result = extractCaptionFromInference([{ generated_text: "  a small cat on a desk. " }]);
    expect(result).toBe("A small cat on a desk");
  });

  it("returns null when inference output has no generated text", () => {
    expect(extractCaptionFromInference([])).toBeNull();
    expect(extractCaptionFromInference([{ score: 0.9 }])).toBeNull();
  });
});
