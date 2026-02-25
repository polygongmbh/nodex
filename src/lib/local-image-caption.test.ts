import { describe, expect, it } from "vitest";
import { extractCaptionFromInference } from "./local-image-caption";

describe("local-image-caption helpers", () => {
  it("extracts and normalizes caption text from pipeline output", () => {
    const result = extractCaptionFromInference([{ generated_text: "  a small cat on a desk. " }]);
    expect(result).toBe("A small cat on a desk");
  });

  it("supports non-array inference shapes", () => {
    expect(extractCaptionFromInference({ generated_text: "a person smiling" })).toBe("A person smiling");
    expect(extractCaptionFromInference("a bright sunset")).toBe("A bright sunset");
  });

  it("returns null when inference output has no generated text", () => {
    expect(extractCaptionFromInference([])).toBeNull();
    expect(extractCaptionFromInference([{ score: 0.9 }])).toBeNull();
  });
});
