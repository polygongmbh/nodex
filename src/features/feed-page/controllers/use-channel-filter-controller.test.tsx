import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { useState } from "react";
import { useChannelFilterController } from "./use-channel-filter-controller";
import { useRelayFilterController } from "@/features/feed-page/controllers/use-relay-filter-controller";
import { useFilterStore } from "@/features/feed-page/stores/filter-store";
import { makeChannel, makePerson, makeRelay } from "@/test/fixtures";
import { useTaskMutationStore } from "@/features/feed-page/stores/task-mutation-store";
import type { Channel, Relay } from "@/types";
import type { Person } from "@/types/person";
import type { FeedInteractionHandlerMap, FeedInteractionPipelineApi } from "@/features/feed-page/interactions/feed-interaction-pipeline";
import type { FeedInteractionIntent, FeedInteractionIntentType } from "@/features/feed-page/interactions/feed-interaction-intent";
import { toast } from "sonner";

const mockApi: FeedInteractionPipelineApi = {
  dispatch: () => Promise.resolve({ envelope: { id: 0, dispatchedAtMs: 0, intent: { type: "ui.openGuide" } }, outcome: { status: "handled" } }),
  dispatchBatch: () => Promise.resolve([]),
};

function callHandler(handlers: FeedInteractionHandlerMap, intent: FeedInteractionIntent) {
  const handler = handlers[intent.type as FeedInteractionIntentType] as
    | ((intent: FeedInteractionIntent, api: FeedInteractionPipelineApi) => void)
    | undefined;
  handler?.(intent, mockApi);
}

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
  makePerson({ pubkey: "alice", name: "alice", displayName: "Alice" }),
  makePerson({ pubkey: "bob", name: "bob", displayName: "Bob" }),
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
  const postedTags = useTaskMutationStore((s) => s.postedTags);
  const [searchQuery, setSearchQuery] = useState("");
  const relayState = useRelayFilterController({
    relays,
  });
  const relaysWithActiveState = relays.map((relay) => ({
    ...relay,
    isActive: relayState.effectiveActiveRelayIds.has(relay.id),
  }));
  const filters = useChannelFilterController({
    relays: relaysWithActiveState,
    channels: visibleChannels,
    composeChannels: visibleComposeChannels,
    people,
    setPeople,
    sidebarPeople: visibleSidebarPeople,
    hasLiveHydratedScope,
    isHydrating,
  });
  const location = useLocation();

  return (
    <>
      <button onClick={() => relayState.handleRelayExclusive("relay-one")}>RelayExclusive</button>
      <button onClick={() => filters.toggleChannel("general")}>ChannelToggle</button>
      <button onClick={() => filters.toggleAllChannels()}>ChannelClearAll</button>
      <button onClick={() => filters.setChannelMatchMode("or")}>ModeOr</button>
      <button onClick={() => filters.showOnlyPerson("alice")}>PersonExclusive</button>
      <button onClick={() => filters.toggleAllPeople()}>PersonClearAll</button>
      <button onClick={() => callHandler(filters.handlers, { type: "filter.applyHashtagExclusive", tag: "urgent" })}>HashtagExclusive</button>
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
      <button onClick={() => callHandler(filters.handlers, { type: "filter.applyAuthorExclusive", author: makePerson({ pubkey: "alice", name: "alice", displayName: "Alice" }) })}>
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
        {people.filter((person) => person.isSelected).map((person) => person.pubkey).join(",")}
      </output>
      <output data-testid="posted-tags">{postedTags.map((tag) => `${tag.name}:${tag.relayIds.join("|")}`).join(",")}</output>
      <output data-testid="mention-request">{filters.mentionRequest?.mention ?? ""}</output>
      <output data-testid="search-query">{searchQuery}</output>
      <output data-testid="location-search">{location.search}</output>
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

describe("useChannelFilterController", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useFilterStore.setState({ activeRelayIds: new Set(), channelFilterStates: new Map(), channelMatchMode: "and" });
    vi.mocked(toast).mockClear();
    useTaskMutationStore.setState({
      localTasks: [],
      postedTags: [],
      suppressedNostrEventIds: new Set(),
    });
  });

  it("adds a missing hashtag to postedTags and applies an exclusive channel filter", () => {
    renderHarness();

    fireEvent.click(screen.getByRole("button", { name: "RelayExclusive" }));
    fireEvent.click(screen.getByRole("button", { name: "HashtagExclusive" }));

    expect(screen.getByTestId("posted-tags")).toHaveTextContent("urgent:relay-one");
    expect(screen.getByTestId("channel-state-urgent")).toHaveTextContent("included");
    expect(screen.getByTestId("channel-state-general")).toHaveTextContent("neutral");
  });

  it("selects the clicked author and queues a mention request", () => {
    renderHarness({ isMobile: true });

    fireEvent.click(screen.getByRole("button", { name: "AuthorClick" }));

    expect(screen.getByTestId("selected-people")).toHaveTextContent("alice");
    expect(screen.getByTestId("mention-request")).toHaveTextContent("@alice");
    expect(screen.getByTestId("search-query")).toHaveTextContent("");
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
    ["HideGeneralEverywhere", "included"],
    ["KeepGeneralComposeForcedOnly", "included"],
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

  it("does not discard URL-hydrated channel params when a scoped feed hides that channel", () => {
    renderHarness({
      initialEntries: ["/?ch=general"],
    });

    expect(screen.getByTestId("channel-state-general")).toHaveTextContent("included");
    expect(screen.getByTestId("location-search")).toHaveTextContent("?ch=general");

    fireEvent.click(screen.getByRole("button", { name: "HideGeneralEverywhere" }));

    expect(screen.getByTestId("channel-state-general")).toHaveTextContent("included");
    expect(screen.getByTestId("location-search")).toHaveTextContent("?ch=general");
  });

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

  it("clears active channel filters without selecting every channel", () => {
    renderHarness();

    fireEvent.click(screen.getByRole("button", { name: "ChannelToggle" }));
    expect(screen.getByTestId("channel-state-general")).toHaveTextContent("included");

    fireEvent.click(screen.getByRole("button", { name: "ChannelClearAll" }));

    expect(screen.getByTestId("channel-state-general")).toHaveTextContent("neutral");
    expect(toast).toHaveBeenCalled();
  });

  it("clears selected people without selecting the full sidebar list", () => {
    renderHarness();

    fireEvent.click(screen.getByRole("button", { name: "PersonExclusive" }));
    expect(screen.getByTestId("selected-people")).toHaveTextContent("alice");

    fireEvent.click(screen.getByRole("button", { name: "PersonClearAll" }));

    expect(screen.getByTestId("selected-people")).toHaveTextContent("");
    expect(toast).toHaveBeenCalled();
  });
});
