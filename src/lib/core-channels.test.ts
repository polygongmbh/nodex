import { describe, expect, it } from "vitest";
import { makeIsCore, resolveCoreChannels } from "./core-channels";

describe("resolveCoreChannels", () => {
  it("returns empty set when env key is missing", () => {
    expect(resolveCoreChannels({})).toEqual(new Set());
  });

  it("returns empty set when env key is blank", () => {
    expect(resolveCoreChannels({ VITE_CORE_CHANNELS: "" })).toEqual(new Set());
    expect(resolveCoreChannels({ VITE_CORE_CHANNELS: "   " })).toEqual(new Set());
    expect(resolveCoreChannels({ VITE_CORE_CHANNELS: ",,," })).toEqual(new Set());
  });

  it("parses comma-separated tags", () => {
    expect(resolveCoreChannels({ VITE_CORE_CHANNELS: "work,ops" })).toEqual(
      new Set(["work", "ops"])
    );
  });

  it("trims whitespace and lowercases entries", () => {
    expect(resolveCoreChannels({ VITE_CORE_CHANNELS: " Work , OPS , " })).toEqual(
      new Set(["work", "ops"])
    );
  });

  it("ignores non-string values", () => {
    expect(resolveCoreChannels({ VITE_CORE_CHANNELS: 42 })).toEqual(new Set());
    expect(resolveCoreChannels({ VITE_CORE_CHANNELS: undefined })).toEqual(new Set());
  });
});

describe("makeIsCore", () => {
  it("returns false for empty set", () => {
    const isCore = makeIsCore(new Set());
    expect(isCore("work")).toBe(false);
  });

  it("matches case-insensitively", () => {
    const isCore = makeIsCore(new Set(["work", "ops"]));
    expect(isCore("work")).toBe(true);
    expect(isCore("WORK")).toBe(true);
    expect(isCore("Work")).toBe(true);
    expect(isCore("ops")).toBe(true);
    expect(isCore("random")).toBe(false);
  });
});
