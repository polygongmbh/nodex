import { describe, expect, it } from "vitest";
import {
  extractCaptionFromInference,
  resolveLocalCaptionPolicy,
  resolveLocalCaptionSupport,
} from "./local-image-caption";

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

  it("resolves caption policy flags and timeouts from environment values", () => {
    const policy = resolveLocalCaptionPolicy({
      VITE_LOCAL_CAPTION_EXPERIMENTAL: "false",
      VITE_LOCAL_CAPTION_REQUIRE_WEBGPU: "true",
      VITE_LOCAL_CAPTION_INIT_TIMEOUT_MS: "18000",
      VITE_LOCAL_CAPTION_INFER_TIMEOUT_MS: "9000",
    });
    expect(policy).toEqual({
      experimentalEnabled: false,
      requireWebGpu: true,
      modelInitTimeoutMs: 18000,
      inferenceTimeoutMs: 9000,
    });
  });

  it("marks support as unsupported with an explicit reason when webgpu is required but unavailable", () => {
    const support = resolveLocalCaptionSupport(
      {
        experimentalEnabled: true,
        requireWebGpu: true,
        modelInitTimeoutMs: 25000,
        inferenceTimeoutMs: 20000,
      },
      {
        hasWindow: true,
        hasFileReader: true,
        hasWebAssembly: true,
        hasWebGpu: false,
        isSecureContext: true,
      }
    );
    expect(support).toEqual({
      supported: false,
      reason: "webgpu_required",
    });
  });
});
