import { beforeEach, describe, expect, it } from "vitest";
import { loadSavedFilterState, saveSavedFilterState } from "@/infrastructure/preferences/saved-filter-configurations";

describe("saved filter configurations persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("loads saved filter state from storage", () => {
    localStorage.setItem(
      "nodex.saved-filter-configurations.v1",
      JSON.stringify({
        activeConfigurationId: "preset-1",
        configurations: [
          {
            id: "preset-1",
            name: "My preset",
            relayIds: ["demo"],
            channelStates: { project: "included" },
            selectedPeopleIds: ["pubkey-1"],
            channelMatchMode: "or",
            createdAt: "2026-02-22T00:00:00.000Z",
            updatedAt: "2026-02-22T00:00:00.000Z",
          },
        ],
      })
    );

    expect(loadSavedFilterState()).toEqual({
      activeConfigurationId: "preset-1",
      configurations: [
        {
          id: "preset-1",
          name: "My preset",
          relayIds: ["demo"],
          channelStates: { project: "included" },
          selectedPeopleIds: ["pubkey-1"],
          channelMatchMode: "or",
          createdAt: "2026-02-22T00:00:00.000Z",
          updatedAt: "2026-02-22T00:00:00.000Z",
        },
      ],
    });
  });

  it("falls back to empty state on invalid payloads", () => {
    localStorage.setItem(
      "nodex.saved-filter-configurations.v1",
      JSON.stringify({
        activeConfigurationId: "missing",
        configurations: [{ bad: "payload" }],
      })
    );

    expect(loadSavedFilterState()).toEqual({
      activeConfigurationId: null,
      configurations: [],
    });
  });

  it("clears stale active configuration ids", () => {
    localStorage.setItem(
      "nodex.saved-filter-configurations.v1",
      JSON.stringify({
        activeConfigurationId: "missing",
        configurations: [
          {
            id: "preset-1",
            name: "My preset",
            relayIds: [],
            channelStates: {},
            selectedPeopleIds: [],
            channelMatchMode: "and",
            createdAt: "2026-02-22T00:00:00.000Z",
            updatedAt: "2026-02-22T00:00:00.000Z",
          },
        ],
      })
    );

    expect(loadSavedFilterState()).toEqual({
      activeConfigurationId: null,
      configurations: [
        {
          id: "preset-1",
          name: "My preset",
          relayIds: [],
          channelStates: {},
          selectedPeopleIds: [],
          channelMatchMode: "and",
          createdAt: "2026-02-22T00:00:00.000Z",
          updatedAt: "2026-02-22T00:00:00.000Z",
        },
      ],
    });
  });

  it("saves saved filter state to storage", () => {
    saveSavedFilterState({
      activeConfigurationId: null,
      configurations: [],
    });

    expect(localStorage.getItem("nodex.saved-filter-configurations.v1")).toBe(
      JSON.stringify({
        activeConfigurationId: null,
        configurations: [],
      })
    );
  });
});
