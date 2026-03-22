import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { TFunction } from "i18next";
import { useState } from "react";
import { useIndexFilters } from "./use-index-filters";
import { useRelayFilterState } from "@/features/feed-page/controllers/use-relay-filter-state";
import { makeChannel, makePerson, makeRelay } from "@/test/fixtures";
import type { Channel, Person, PostedTag, Relay } from "@/types";

vi.mock("sonner", () => ({
  toast: vi.fn(),
}));

const relays: Relay[] = [
  makeRelay({ id: "relay-one", name: "Relay One", isActive: false, connectionStatus: "connected", url: "wss://relay.one" }),
  makeRelay({ id: "relay-two", name: "Relay Two", isActive: false, connectionStatus: "connected", url: "wss://relay.two" }),
];

const channels: Channel[] = [
  makeChannel({ id: "general", name: "general" }),
  makeChannel({ id: "ops", name: "ops" }),
];

const peopleSeed: Person[] = [
  makePerson({ id: "alice", name: "alice", displayName: "Alice" }),
  makePerson({ id: "bob", name: "bob", displayName: "Bob" }),
];

function Harness({
  isMobile = false,
  isHydrating = false,
  hasLiveHydratedScope = false,
  startWithEmptyScope = false,
  startWithEmptyPeople = false,
}: {
  isMobile?: boolean;
  isHydrating?: boolean;
  hasLiveHydratedScope?: boolean;
  startWithEmptyScope?: boolean;
  startWithEmptyPeople?: boolean;
}) {
  const [people, setPeople] = useState<Person[]>(startWithEmptyPeople ? [] : peopleSeed);
  const [visibleChannels, setVisibleChannels] = useState<Channel[]>(startWithEmptyScope ? [] : channels);
  const [visibleComposeChannels, setVisibleComposeChannels] = useState<Channel[]>(
    startWithEmptyScope ? [] : channels
  );
  const [visibleSidebarPeople, setVisibleSidebarPeople] = useState<Person[]>(
    startWithEmptyScope ? [] : peopleSeed
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [postedTags, setPostedTags] = useState<PostedTag[]>([]);
  const relayState = useRelayFilterState({
    relays,
    t: ((key: string) => key) as unknown as TFunction,
  });
  const relaysWithActiveState = relays.map((relay) => ({
    ...relay,
    isActive: relayState.effectiveActiveRelayIds.has(relay.id),
  }));
  const filters = useIndexFilters({
    relays: relaysWithActiveState,
    setActiveRelayIds: relayState.setActiveRelayIds,
    channels: visibleChannels,
    composeChannels: visibleComposeChannels,
    postedTags,
    setPostedTags,
    people,
    setPeople,
    sidebarPeople: visibleSidebarPeople,
    isMobile,
    hasLiveHydratedScope,
    isHydrating,
    setSearchQuery,
    t: ((key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key) as unknown as TFunction,
  });

  return (
    <>
      <button onClick={() => relayState.handleRelayExclusive("relay-one")}>RelayExclusive</button>
      <button onClick={() => filters.handleChannelToggle("general")}>ChannelToggle</button>
      <button onClick={() => filters.handleChannelMatchModeChange("or")}>ModeOr</button>
      <button onClick={() => filters.handlePersonExclusive("alice")}>PersonExclusive</button>
      <button onClick={() => filters.handleHashtagExclusive("urgent")}>HashtagExclusive</button>
      <button onClick={() => setVisibleChannels([channels[1]])}>HideGeneralSidebarChannel</button>
      <button onClick={() => {
        setVisibleChannels([channels[1]]);
        setVisibleComposeChannels([channels[1]]);
      }}>HideGeneralEverywhere</button>
      <button onClick={() => {
        setVisibleChannels([channels[1]]);
        setVisibleComposeChannels([
          makeChannel({ id: "general", name: "general", usageCount: 3 }),
          channels[1],
        ]);
      }}>KeepGeneralComposeRealOnly</button>
      <button onClick={() => {
        setVisibleChannels([channels[1]]);
        setVisibleComposeChannels([
          makeChannel({ id: "general", name: "general", usageCount: 0 }),
          channels[1],
        ]);
      }}>KeepGeneralComposeForcedOnly</button>
      <button onClick={() => setVisibleSidebarPeople([peopleSeed[1]])}>HideAliceSidebarPerson</button>
      <button onClick={() => filters.handleAuthorClick(makePerson({ id: "alice", name: "alice", displayName: "Alice" }))}>
        AuthorClick
      </button>
      <button onClick={() => setPeople(peopleSeed)}>LoadPeople</button>
      <button onClick={filters.resetFiltersToDefault}>Reset</button>
      <output data-testid="relay-ids">{Array.from(relayState.effectiveActiveRelayIds).sort().join(",")}</output>
      <output data-testid="channel-state-general">
        {filters.channelFilterStates.get("general") || "neutral"}
      </output>
      <output data-testid="channel-state-urgent">
        {filters.channelFilterStates.get("urgent") || "neutral"}
      </output>
      <output data-testid="channel-match-mode">{filters.channelMatchMode}</output>
      <output data-testid="selected-people">
        {people.filter((person) => person.isSelected).map((person) => person.id).join(",")}
      </output>
      <output data-testid="posted-tags">{postedTags.map((tag) => `${tag.name}:${tag.relayIds.join("|")}`).join(",")}</output>
      <output data-testid="mention-request">{filters.mentionRequest?.mention ?? ""}</output>
      <output data-testid="search-query">{searchQuery}</output>
    </>
  );
}

function renderHarness(options?: {
  isMobile?: boolean;
  isHydrating?: boolean;
  hasLiveHydratedScope?: boolean;
  startWithEmptyScope?: boolean;
  startWithEmptyPeople?: boolean;
  initialEntries?: string[];
}) {
  return render(
    <MemoryRouter initialEntries={options?.initialEntries}>
      <Harness {...options} />
    </MemoryRouter>
  );
}

describe("useIndexFilters", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("adds a missing hashtag to postedTags and applies an exclusive channel filter", () => {
    renderHarness();

    fireEvent.click(screen.getByRole("button", { name: "RelayExclusive" }));
    fireEvent.click(screen.getByRole("button", { name: "HashtagExclusive" }));

    expect(screen.getByTestId("posted-tags")).toHaveTextContent("urgent:relay-one");
    expect(screen.getByTestId("channel-state-urgent")).toHaveTextContent("included");
    expect(screen.getByTestId("channel-state-general")).toHaveTextContent("neutral");
  });

  it("selects the clicked author and queues a mention request on mobile", () => {
    renderHarness({ isMobile: true });

    fireEvent.click(screen.getByRole("button", { name: "AuthorClick" }));

    expect(screen.getByTestId("selected-people")).toHaveTextContent("alice");
    expect(screen.getByTestId("mention-request")).toHaveTextContent("@alice");
    expect(screen.getByTestId("search-query")).toHaveTextContent("@alice");
  });

  it("resets relay, channel, people, and match-mode filters to defaults", () => {
    renderHarness();

    fireEvent.click(screen.getByRole("button", { name: "RelayExclusive" }));
    fireEvent.click(screen.getByRole("button", { name: "ChannelToggle" }));
    fireEvent.click(screen.getByRole("button", { name: "ModeOr" }));
    fireEvent.click(screen.getByRole("button", { name: "PersonExclusive" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(screen.getByTestId("relay-ids")).toHaveTextContent("");
    expect(screen.getByTestId("channel-state-general")).toHaveTextContent("neutral");
    expect(screen.getByTestId("channel-match-mode")).toHaveTextContent("and");
    expect(screen.getByTestId("selected-people")).toHaveTextContent("");
  });

  it.each([
    ["KeepGeneralComposeRealOnly", "included"],
    ["HideGeneralEverywhere", "neutral"],
    ["KeepGeneralComposeForcedOnly", "neutral"],
  ] as const)(
    "resolves selected channel state for scoped availability source %s",
    (scopeActionButtonName, expectedState) => {
      renderHarness();

      fireEvent.click(screen.getByRole("button", { name: "ChannelToggle" }));
      expect(screen.getByTestId("channel-state-general")).toHaveTextContent("included");

      fireEvent.click(screen.getByRole("button", { name: scopeActionButtonName }));

      expect(screen.getByTestId("channel-state-general")).toHaveTextContent(expectedState);
    }
  );

  it("deselects people who are no longer available in the current sidebar scope", () => {
    renderHarness();

    fireEvent.click(screen.getByRole("button", { name: "PersonExclusive" }));
    expect(screen.getByTestId("selected-people")).toHaveTextContent("alice");

    fireEvent.click(screen.getByRole("button", { name: "HideAliceSidebarPerson" }));

    expect(screen.getByTestId("selected-people")).toHaveTextContent("");
  });

  it("keeps URL-hydrated channel and people filters during initial hydration", () => {
    renderHarness({
      isHydrating: true,
      hasLiveHydratedScope: false,
      startWithEmptyScope: true,
      initialEntries: ["/?ch=general&p=alice"],
    });

    expect(screen.getByTestId("channel-state-general")).toHaveTextContent("included");
    expect(screen.getByTestId("selected-people")).toHaveTextContent("alice");
  });

  it("applies URL-hydrated selected people when people profiles load after mount", () => {
    renderHarness({
      isHydrating: true,
      hasLiveHydratedScope: false,
      startWithEmptyPeople: true,
      initialEntries: ["/?p=alice"],
    });

    expect(screen.getByTestId("selected-people")).toHaveTextContent("");

    fireEvent.click(screen.getByRole("button", { name: "LoadPeople" }));

    expect(screen.getByTestId("selected-people")).toHaveTextContent("alice");
  });

  it("allows deselecting URL-hydrated people after startup", () => {
    renderHarness({
      initialEntries: ["/?p=alice"],
    });

    expect(screen.getByTestId("selected-people")).toHaveTextContent("alice");

    fireEvent.click(screen.getByRole("button", { name: "PersonExclusive" }));

    expect(screen.getByTestId("selected-people")).toHaveTextContent("");
  });

  it("does not reselect URL-hydrated people after delayed load once deselected", () => {
    renderHarness({
      isHydrating: true,
      hasLiveHydratedScope: false,
      startWithEmptyPeople: true,
      initialEntries: ["/?p=alice"],
    });

    fireEvent.click(screen.getByRole("button", { name: "LoadPeople" }));
    expect(screen.getByTestId("selected-people")).toHaveTextContent("alice");

    fireEvent.click(screen.getByRole("button", { name: "PersonExclusive" }));

    expect(screen.getByTestId("selected-people")).toHaveTextContent("");
  });
});
