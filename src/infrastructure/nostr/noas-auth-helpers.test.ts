import { describe, expect, it } from "vitest";
import { buildNoasSignupOptions, resolveNoasAuthRelayUrls } from "./noas-auth-helpers";

describe("buildNoasSignupOptions", () => {
  it("keeps only valid connected relay urls in normalized form", () => {
    expect(
      buildNoasSignupOptions(
        ["wss://relay.one/", "wss://relay.one", "https://not-a-relay", "ws://relay.two"],
        "https://nodex.example"
      )
    ).toEqual({
      redirect: "https://nodex.example",
      relays: ["wss://relay.one", "ws://relay.two"],
    });
  });

  it("omits relays when no connected relay urls are valid", () => {
    expect(buildNoasSignupOptions(["https://not-a-relay"], "https://nodex.example")).toEqual({
      redirect: "https://nodex.example",
      relays: undefined,
    });
  });
});

describe("resolveNoasAuthRelayUrls", () => {
  it("extracts valid relay urls from auth responses", () => {
    expect(
      resolveNoasAuthRelayUrls({
        relays: ["wss://relay.one/", "wss://relay.one", "", "https://not-a-relay", "ws://relay.two"],
      })
    ).toEqual(["wss://relay.one", "ws://relay.two"]);
  });

  it("returns an empty list when the response has no relay array", () => {
    expect(resolveNoasAuthRelayUrls(undefined)).toEqual([]);
  });
});
