import { describe, expect, it } from "vitest";
import { isTaskOutsideSelectedRelayScope, resolveChannelRelayScopeIds } from "./relay-scope";

describe("resolveChannelRelayScopeIds", () => {
  it("returns effective active relay ids when at least one feed is selected", () => {
    const result = resolveChannelRelayScopeIds(new Set(["relay-a"]), ["demo", "relay-a", "relay-b"]);

    expect(result).toEqual(new Set(["relay-a"]));
  });

  it("falls back to all available relay ids when no feeds are selected", () => {
    const result = resolveChannelRelayScopeIds(new Set(), ["demo", "relay-a", "relay-b"]);

    expect(result).toEqual(new Set(["demo", "relay-a", "relay-b"]));
  });
});

describe("isTaskOutsideSelectedRelayScope", () => {
  it("returns true when a task loses all selected relay coverage", () => {
    const result = isTaskOutsideSelectedRelayScope(
      { relays: ["relay-one"] },
      new Set(["relay-two"]),
      ["relay-one", "relay-two"]
    );

    expect(result).toBe(true);
  });

  it("returns false when a task still matches one selected relay", () => {
    const result = isTaskOutsideSelectedRelayScope(
      { relays: ["relay-one", "relay-two"] },
      new Set(["relay-two"]),
      ["relay-one", "relay-two"]
    );

    expect(result).toBe(false);
  });

  it("treats an empty explicit selection as all relays selected", () => {
    const result = isTaskOutsideSelectedRelayScope(
      { relays: ["relay-one"] },
      new Set(),
      ["relay-one", "relay-two"]
    );

    expect(result).toBe(false);
  });

  it("keeps context when the task has no relay metadata", () => {
    const result = isTaskOutsideSelectedRelayScope(
      { relays: [] },
      new Set(["relay-two"]),
      ["relay-one", "relay-two"]
    );

    expect(result).toBe(false);
  });
});
