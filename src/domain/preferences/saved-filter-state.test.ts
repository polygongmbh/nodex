import { describe, expect, it } from "vitest";
import {
  EMPTY_SAVED_FILTER_STATE,
  findSavedFilterConfiguration,
  normalizeSavedFilterState,
} from "@/domain/preferences/saved-filter-state";

describe("saved-filter-state", () => {
  it("exposes an empty default state", () => {
    expect(EMPTY_SAVED_FILTER_STATE).toEqual({
      activeConfigurationId: null,
      configurations: [],
    });
  });

  it("clears stale active configuration ids", () => {
    expect(
      normalizeSavedFilterState({
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
    ).toEqual({
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

  it("finds a saved filter configuration by id", () => {
    const configuration = findSavedFilterConfiguration(
      {
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
      },
      "preset-1"
    );

    expect(configuration?.name).toBe("My preset");
  });
});
