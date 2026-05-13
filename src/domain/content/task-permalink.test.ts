import { describe, expect, it } from "vitest";
import { buildTaskPermalink } from "./task-permalink";

describe("buildTaskPermalink", () => {
  it("prefers a relay the user has active", () => {
    expect(
      buildTaskPermalink({
        origin: "https://nodex.example",
        eventId: "abc123",
        taskRelayUrls: ["wss://relay-a.example", "wss://relay-b.example"],
        activeRelayUrls: ["wss://relay-b.example"],
      })
    ).toBe("https://nodex.example/relay-b.example/abc123");
  });

  it("falls back to the first task relay when none are active", () => {
    expect(
      buildTaskPermalink({
        origin: "https://nodex.example",
        eventId: "abc123",
        taskRelayUrls: ["wss://relay-a.example"],
        activeRelayUrls: [],
      })
    ).toBe("https://nodex.example/relay-a.example/abc123");
  });

  it("strips trailing slashes from origin", () => {
    expect(
      buildTaskPermalink({
        origin: "https://nodex.example/",
        eventId: "abc",
        taskRelayUrls: ["wss://relay-a.example/"],
      })
    ).toBe("https://nodex.example/relay-a.example/abc");
  });

  it("omits the relay segment when no relay is known", () => {
    expect(
      buildTaskPermalink({
        origin: "https://nodex.example",
        eventId: "abc",
        taskRelayUrls: [],
      })
    ).toBe("https://nodex.example/abc");
  });

  it("returns the origin when the event id is empty", () => {
    expect(
      buildTaskPermalink({
        origin: "https://nodex.example",
        eventId: "  ",
        taskRelayUrls: ["wss://relay-a.example"],
      })
    ).toBe("https://nodex.example");
  });

  it("encodes relay hosts with reserved characters", () => {
    expect(
      buildTaskPermalink({
        origin: "https://nodex.example",
        eventId: "abc",
        taskRelayUrls: ["wss://relay.example:8443"],
      })
    ).toBe("https://nodex.example/relay.example%3A8443/abc");
  });

  it("handles bare host strings without scheme", () => {
    expect(
      buildTaskPermalink({
        origin: "https://nodex.example",
        eventId: "abc",
        taskRelayUrls: ["relay-a.example"],
      })
    ).toBe("https://nodex.example/relay-a.example/abc");
  });
});
