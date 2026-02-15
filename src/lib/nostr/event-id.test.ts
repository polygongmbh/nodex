import { describe, expect, it } from "vitest";
import { isNostrEventId } from "./event-id";

describe("isNostrEventId", () => {
  it("accepts 64-char hex ids", () => {
    expect(isNostrEventId("a".repeat(64))).toBe(true);
  });

  it("rejects short ids", () => {
    expect(isNostrEventId("123")).toBe(false);
  });

  it("rejects non-hex ids", () => {
    expect(isNostrEventId("z".repeat(64))).toBe(false);
  });
});
