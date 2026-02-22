import { describe, expect, it, beforeEach } from "vitest";
import {
  getEffectiveActiveRelayIds,
  loadPersistedChannelMatchMode,
  loadPersistedChannelFilters,
  loadPersistedRelayIds,
  savePersistedChannelMatchMode,
  savePersistedChannelFilters,
  savePersistedRelayIds,
} from "./filter-preferences";

describe("filter preferences persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("loads persisted relay ids", () => {
    localStorage.setItem("nodex.active-relays.v1", JSON.stringify(["demo", "relay-a"]));

    expect(loadPersistedRelayIds(["demo"])).toEqual(new Set(["demo", "relay-a"]));
  });

  it("falls back to defaults for invalid relay payloads", () => {
    localStorage.setItem("nodex.active-relays.v1", JSON.stringify({ invalid: true }));

    expect(loadPersistedRelayIds(["demo"])).toEqual(new Set(["demo"]));
  });

  it("saves relay ids", () => {
    savePersistedRelayIds(new Set(["demo", "relay-a"]));

    expect(localStorage.getItem("nodex.active-relays.v1")).toBe(
      JSON.stringify(["demo", "relay-a"])
    );
  });

  it("loads persisted channel filter states", () => {
    localStorage.setItem(
      "nodex.channel-filters.v1",
      JSON.stringify({
        projectx: "included",
        spam: "excluded",
      })
    );

    expect(loadPersistedChannelFilters()).toEqual(
      new Map([
        ["projectx", "included"],
        ["spam", "excluded"],
      ])
    );
  });

  it("ignores invalid channel filter states", () => {
    localStorage.setItem(
      "nodex.channel-filters.v1",
      JSON.stringify({
        a: "included",
        b: "neutral",
        c: "invalid",
      })
    );

    expect(loadPersistedChannelFilters()).toEqual(
      new Map([["a", "included"]])
    );
  });

  it("saves only non-neutral channel filter states", () => {
    savePersistedChannelFilters(
      new Map([
        ["a", "neutral"],
        ["b", "included"],
        ["c", "excluded"],
      ])
    );

    expect(localStorage.getItem("nodex.channel-filters.v1")).toBe(
      JSON.stringify({
        b: "included",
        c: "excluded",
      })
    );
  });

  it("keeps only active relay ids that are currently available", () => {
    const activeRelayIds = new Set(["demo", "relay-a", "relay-b"]);
    const availableRelayIds = ["demo", "relay-b"];

    expect(getEffectiveActiveRelayIds(activeRelayIds, availableRelayIds)).toEqual(
      new Set(["demo", "relay-b"])
    );
  });

  it("loads persisted channel match mode", () => {
    localStorage.setItem("nodex.channel-match-mode.v1", JSON.stringify("or"));

    expect(loadPersistedChannelMatchMode()).toBe("or");
  });

  it("falls back to and for invalid channel match mode payloads", () => {
    localStorage.setItem("nodex.channel-match-mode.v1", JSON.stringify("invalid"));

    expect(loadPersistedChannelMatchMode()).toBe("and");
  });

  it("saves channel match mode", () => {
    savePersistedChannelMatchMode("or");

    expect(localStorage.getItem("nodex.channel-match-mode.v1")).toBe(JSON.stringify("or"));
  });
});
