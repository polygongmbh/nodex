import { describe, expect, it } from "vitest";
import {
  buildKind0Content,
  hasRequiredProfileFields,
  isNip05CompatibleName,
  mergeKind0Profiles,
  parseKind0Content,
} from "./profile-metadata";

describe("profile metadata helpers", () => {
  it("requires a non-empty name", () => {
    expect(hasRequiredProfileFields({ name: "  " })).toBe(false);
    expect(hasRequiredProfileFields({ name: "alice" })).toBe(true);
  });

  it("validates nip05-compatible profile names", () => {
    expect(isNip05CompatibleName("alice_1")).toBe(true);
    expect(isNip05CompatibleName("alice.test-user")).toBe(true);
    expect(isNip05CompatibleName("Alice")).toBe(false);
    expect(isNip05CompatibleName("alice test")).toBe(false);
    expect(isNip05CompatibleName("alice@home")).toBe(false);
  });

  it("builds kind 0 json with trimmed fields", () => {
    const content = buildKind0Content({
      name: " Alice ",
      displayName: " Alice A ",
      about: " hi ",
    });
    expect(content).toBe(JSON.stringify({ name: "Alice", displayName: "Alice A", about: "hi" }));
  });

  it("parses kind 0 json fields", () => {
    const parsed = parseKind0Content(
      JSON.stringify({ name: "alice", displayName: "Alice", nip05: "alice@example.com" })
    );
    expect(parsed.name).toBe("alice");
    expect(parsed.displayName).toBe("Alice");
    expect(parsed.nip05).toBe("alice@example.com");
  });

  it("merges all kind:0 events, preferring newer values and backfilling missing fields", () => {
    const merged = mergeKind0Profiles([
      { createdAt: 200, content: JSON.stringify({ name: "alice-new", about: "new about" }) },
      { createdAt: 100, content: JSON.stringify({ displayName: "Alice", picture: "https://img", nip05: "alice@example.com" }) },
    ]);

    expect(merged).toEqual({
      name: "alice-new",
      about: "new about",
      displayName: "Alice",
      picture: "https://img",
      nip05: "alice@example.com",
    });
  });
});
