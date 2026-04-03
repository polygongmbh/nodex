import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useMemo, useState } from "react";
import { useSavedFilterConfigs } from "./use-saved-filter-configs";
import { buildFilterSnapshot } from "@/domain/content/filter-snapshot";
import { mapPeopleSelection } from "@/domain/content/filter-state-utils";
import { makePerson, makeRelay } from "@/test/fixtures";
import type { Channel, ChannelMatchMode, Relay } from "@/types";
import type { Person } from "@/types/person";

const relays: Relay[] = [
  makeRelay({ id: "relay-one", name: "Relay One" }),
  makeRelay({ id: "relay-two", name: "Relay Two" }),
];

const peopleSeed: Person[] = [
  makePerson({ id: "alice", name: "alice", displayName: "Alice" }),
  makePerson({ id: "bob", name: "bob", displayName: "Bob" }),
];

function Harness() {
  const [activeRelayIds, setActiveRelayIds] = useState<Set<string>>(new Set(["relay-one"]));
  const [channelFilterStates, setChannelFilterStates] = useState<Map<string, Channel["filterState"]>>(
    new Map([["general", "included"]])
  );
  const [channelMatchMode, setChannelMatchMode] = useState<ChannelMatchMode>("or");
  const [people, setPeople] = useState<Person[]>(
    mapPeopleSelection(peopleSeed, (person) => person.id === "alice")
  );
  const [quickFilters, setQuickFilters] = useState({
    recentEnabled: true,
    recentDays: 7,
    priorityEnabled: true,
    minPriority: 50,
  });

  const currentFilterSnapshot = useMemo(
    () =>
      buildFilterSnapshot({
        activeRelayIds,
        channelFilterStates,
        people,
        channelMatchMode,
        quickFilters,
      }),
    [activeRelayIds, channelFilterStates, people, channelMatchMode, quickFilters]
  );

  const saved = useSavedFilterConfigs({
    currentFilterSnapshot,
    relays,
    setActiveRelayIds,
    setChannelFilterStates,
    setChannelMatchMode,
    setPeople,
    setQuickFilters,
    resetFiltersToDefault: () => {
      setActiveRelayIds(new Set());
      setChannelFilterStates(new Map());
      setChannelMatchMode("and");
      setPeople((prev) => mapPeopleSelection(prev, () => false));
      setQuickFilters({
        recentEnabled: false,
        recentDays: 7,
        priorityEnabled: false,
        minPriority: 50,
      });
    },
  });

  return (
    <>
      <button onClick={() => saved.savedFilterController.onSaveCurrentConfiguration("My Config")}>Save</button>
      <button onClick={() => saved.savedFilterController.onApplyConfiguration(saved.savedFilterController.configurations[0]?.id || "")}>
        ApplyFirst
      </button>
      <button onClick={() => saved.savedFilterController.onRenameConfiguration(saved.savedFilterController.configurations[0]?.id || "", "Renamed")}>
        RenameFirst
      </button>
      <button onClick={() => saved.savedFilterController.onDeleteConfiguration(saved.savedFilterController.configurations[0]?.id || "")}>
        DeleteFirst
      </button>
      <button onClick={() => setChannelMatchMode("and")}>Drift</button>
      <button
        onClick={() => {
          setActiveRelayIds(new Set(["relay-two"]));
          setChannelFilterStates(new Map([["general", "excluded"]]));
          setChannelMatchMode("and");
          setPeople((prev) => mapPeopleSelection(prev, (person) => person.id === "bob"));
          setQuickFilters({
            recentEnabled: true,
            recentDays: 21,
            priorityEnabled: true,
            minPriority: 80,
          });
        }}
      >
        Mutate
      </button>
      <output data-testid="active-config">{saved.savedFilterController.activeConfigurationId || ""}</output>
      <output data-testid="config-count">{saved.savedFilterController.configurations.length}</output>
      <output data-testid="config-name">{saved.savedFilterController.configurations[0]?.name || ""}</output>
      <output data-testid="relay-ids">{Array.from(activeRelayIds).sort().join(",")}</output>
      <output data-testid="channel-state">{channelFilterStates.get("general") || "neutral"}</output>
      <output data-testid="match-mode">{channelMatchMode}</output>
      <output data-testid="selected-people">
        {people.filter((person) => person.isSelected).map((person) => person.id).join(",")}
      </output>
      <output data-testid="quick-filters">
        {[
          quickFilters.recentEnabled ? `recent:${quickFilters.recentDays}` : "recent:off",
          quickFilters.priorityEnabled ? `priority:${quickFilters.minPriority}` : "priority:off",
        ].join(",")}
      </output>
    </>
  );
}

describe("useSavedFilterConfigs", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("saves the current snapshot and reapplies it later", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(screen.getByRole("button", { name: "Mutate" }));
    fireEvent.click(screen.getByRole("button", { name: "ApplyFirst" }));

    expect(screen.getByTestId("relay-ids")).toHaveTextContent("relay-one");
    expect(screen.getByTestId("channel-state")).toHaveTextContent("included");
    expect(screen.getByTestId("match-mode")).toHaveTextContent("or");
    expect(screen.getByTestId("selected-people")).toHaveTextContent("alice");
    expect(screen.getByTestId("quick-filters")).toHaveTextContent("recent:7,priority:50");
  });

  it("clears the active configuration id when the current snapshot drifts", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByTestId("active-config").textContent).not.toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Drift" }));
    expect(screen.getByTestId("active-config")).toHaveTextContent("");
  });

  it("renames and deletes saved configurations", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(screen.getByRole("button", { name: "RenameFirst" }));
    expect(screen.getByTestId("config-name")).toHaveTextContent("Renamed");

    fireEvent.click(screen.getByRole("button", { name: "DeleteFirst" }));
    expect(screen.getByTestId("config-count")).toHaveTextContent("0");
  });

  it("deactivates all relays when toggling off the active saved configuration", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByTestId("relay-ids")).toHaveTextContent("relay-one");

    fireEvent.click(screen.getByRole("button", { name: "ApplyFirst" }));
    expect(screen.getByTestId("relay-ids")).toHaveTextContent("");
  });

  it("keeps all relays deactivated when applying a configuration with stale relay ids", () => {
    window.localStorage.setItem("nodex.saved-filter-configurations.v1", JSON.stringify({
      activeConfigurationId: null,
      configurations: [
        {
          id: "stale-config",
          name: "Stale",
          relayIds: ["missing-relay"],
          channelStates: {},
          selectedPeopleIds: [],
          channelMatchMode: "and",
          quickFilters: {
            recentEnabled: false,
            recentDays: 7,
            priorityEnabled: false,
            minPriority: 50,
          },
          createdAt: "2026-03-18T00:00:00.000Z",
          updatedAt: "2026-03-18T00:00:00.000Z",
        },
      ],
    }));

    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "ApplyFirst" }));
    expect(screen.getByTestId("relay-ids")).toHaveTextContent("");
  });
});
