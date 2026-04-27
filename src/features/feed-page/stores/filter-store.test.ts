import { describe, expect, it, beforeEach } from "vitest";
import { useFilterStore } from "./filter-store";

function resetStore() {
  useFilterStore.setState({
    activeRelayIds: new Set(),
    channelFilterStates: new Map(),
    channelMatchMode: "and",
  });
}

describe("filter-store persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
  });

  it("loads relay IDs from localStorage on merge", () => {
    localStorage.setItem("nodex.active-relays.v1", JSON.stringify(["relay-a", "relay-b"]));
    useFilterStore.persist.rehydrate();

    expect(useFilterStore.getState().activeRelayIds).toEqual(new Set(["relay-a", "relay-b"]));
  });

  it("returns empty relay IDs for invalid payload", () => {
    localStorage.setItem("nodex.active-relays.v1", JSON.stringify({ invalid: true }));
    useFilterStore.persist.rehydrate();

    expect(useFilterStore.getState().activeRelayIds).toEqual(new Set());
  });

  it("returns empty relay IDs when nothing is persisted", () => {
    useFilterStore.persist.rehydrate();

    expect(useFilterStore.getState().activeRelayIds).toEqual(new Set());
  });

  it("loads channel filter states from localStorage on merge", () => {
    localStorage.setItem(
      "nodex.channel-filters.v1",
      JSON.stringify({ projectx: "included", spam: "excluded" })
    );
    useFilterStore.persist.rehydrate();

    expect(useFilterStore.getState().channelFilterStates).toEqual(
      new Map([["projectx", "included"], ["spam", "excluded"]])
    );
  });

  it("ignores neutral and invalid channel filter states on load", () => {
    localStorage.setItem(
      "nodex.channel-filters.v1",
      JSON.stringify({ a: "included", b: "neutral", c: "invalid" })
    );
    useFilterStore.persist.rehydrate();

    expect(useFilterStore.getState().channelFilterStates).toEqual(new Map([["a", "included"]]));
  });

  it("loads channel match mode from localStorage on merge", () => {
    localStorage.setItem("nodex.channel-match-mode.v1", JSON.stringify("or"));
    useFilterStore.persist.rehydrate();

    expect(useFilterStore.getState().channelMatchMode).toBe("or");
  });

  it("falls back to 'and' for invalid channel match mode", () => {
    localStorage.setItem("nodex.channel-match-mode.v1", JSON.stringify("invalid"));
    useFilterStore.persist.rehydrate();

    expect(useFilterStore.getState().channelMatchMode).toBe("and");
  });

  it("persists relay IDs to localStorage on setActiveRelayIds", () => {
    useFilterStore.getState().setActiveRelayIds(new Set(["relay-a", "relay-b"]));

    expect(JSON.parse(localStorage.getItem("nodex.active-relays.v1")!)).toEqual(
      expect.arrayContaining(["relay-a", "relay-b"])
    );
  });

  it("persists only non-neutral channel filter states on setChannelFilterStates", () => {
    useFilterStore.getState().setChannelFilterStates(
      new Map([["a", "neutral"], ["b", "included"], ["c", "excluded"]])
    );

    expect(JSON.parse(localStorage.getItem("nodex.channel-filters.v1")!)).toEqual({
      b: "included",
      c: "excluded",
    });
  });

  it("persists channel match mode on setChannelMatchMode", () => {
    useFilterStore.getState().setChannelMatchMode("or");

    expect(JSON.parse(localStorage.getItem("nodex.channel-match-mode.v1")!)).toBe("or");
  });

  it("supports functional updater for setActiveRelayIds", () => {
    useFilterStore.getState().setActiveRelayIds(new Set(["relay-a"]));
    useFilterStore.getState().setActiveRelayIds((prev) => new Set([...prev, "relay-b"]));

    expect(useFilterStore.getState().activeRelayIds).toEqual(new Set(["relay-a", "relay-b"]));
  });

  it("supports functional updater for setChannelFilterStates", () => {
    useFilterStore.getState().setChannelFilterStates(new Map([["a", "included"]]));
    useFilterStore.getState().setChannelFilterStates((prev) => {
      const next = new Map(prev);
      next.set("b", "excluded");
      return next;
    });

    expect(useFilterStore.getState().channelFilterStates).toEqual(
      new Map([["a", "included"], ["b", "excluded"]])
    );
  });
});
