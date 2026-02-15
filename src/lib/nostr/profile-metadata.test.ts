import { describe, expect, it } from "vitest";
import { buildKind0Content, hasRequiredProfileFields, parseKind0Content } from "./profile-metadata";

describe("profile metadata helpers", () => {
  it("requires a non-empty name", () => {
    expect(hasRequiredProfileFields({ name: "  " })).toBe(false);
    expect(hasRequiredProfileFields({ name: "alice" })).toBe(true);
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
});
