import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMemo, useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { useChannels } from "./use-channels";
import { useAllPosts } from "./use-all-posts";
import { useChannelFilterController } from "./use-channel-filter-controller";
import { useTaskMutationStore } from "@/features/feed-page/stores/task-mutation-store";
import { useFilterStore } from "@/features/feed-page/stores/filter-store";
import { __resetPostsStoreForTests } from "@/features/feed-page/stores/posts-store";
import { ingestPostEvent } from "@/infrastructure/nostr/post-event-ingest";
import type { NostrEventWithRelay } from "@/lib/nostr/types";
import { makeRelay } from "@/test/fixtures";
import type { Relay } from "@/types";
import type { SelectablePerson } from "@/types/person";
import type { FeedInteractionHandlerMap, FeedInteractionPipelineApi } from "@/features/feed-page/interactions/feed-interaction-pipeline";
import type { FeedInteractionIntent, FeedInteractionIntentType } from "@/features/feed-page/interactions/feed-interaction-intent";

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
  makeRelay({ id: "relay-one", name: "Relay One", url: "wss://relay.one", isActive: true }),
  makeRelay({ id: "relay-two", name: "Relay Two", url: "wss://relay.two", isActive: true }),
];

const nostrEvents: NostrEventWithRelay[] = [
  {
    id: "event-one",
    pubkey: "a".repeat(64),
    created_at: 1,
    kind: 1,
    tags: [["t", "ops"]],
    content: "#ops",
    sig: "b".repeat(128),
    relayUrls: ["wss://relay.one"],
  },
  {
    id: "event-two",
    pubkey: "c".repeat(64),
    created_at: 2,
    kind: 1,
    tags: [["t", "general"]],
    content: "#general",
    sig: "d".repeat(128),
    relayUrls: ["wss://relay.two"],
  },
];

function seedNostrEventsStore(events: NostrEventWithRelay[]): void {
  __resetPostsStoreForTests();
  for (const event of events) ingestPostEvent(event);
}

function Harness() {
  const [people, setPeople] = useState<SelectablePerson[]>([]);
  const activeRelayIds = useFilterStore((s) => s.activeRelayIds);
  const setActiveRelayIds = useFilterStore((s) => s.setActiveRelayIds);
  const relaysWithActiveState = relays.map((relay) => ({
    ...relay,
    isActive: activeRelayIds.has(relay.id),
  }));

  const allTasks = useAllPosts({
    demoTasks: [],
    isHydrating: false,
    hasLiveHydratedScope: false,
  });
  const allRelayIds = useMemo(() => relaysWithActiveState.map((relay) => relay.id), [relaysWithActiveState]);
  const channels = useChannels({
    allTasks,
    effectiveActiveRelayIds: activeRelayIds,
    allRelayIds,
    channelFrecencyState: {},
  });

  const filters = useChannelFilterController({
    relays: relaysWithActiveState,
    channels,
    people,
    setPeople,
    sidebarPeople: [],
  });

  const includedChannels = filters.channelsWithState
    .filter((channel) => channel.filterState === "included")
    .map((channel) => channel.name)
    .join(",");

  return (
    <>
      <button onClick={() => filters.toggleChannel("ops")}>ToggleOps</button>
      <button onClick={() => setActiveRelayIds(new Set(["relay-one"]))}>RelayOne</button>
      <button onClick={() => setActiveRelayIds(new Set(["relay-two"]))}>SwitchRelay</button>
      <button onClick={() => callHandler(filters.handlers, { type: "filter.applyHashtagInclude", tag: "urgent" })}>HashtagInclude</button>
      <output data-testid="compose-channel-names">
        {filters.channelsWithState.map((channel) => channel.name).join(",")}
      </output>
      <output data-testid="compose-included-channel-names">{includedChannels}</output>
    </>
  );
}

describe("useChannels compose channels", () => {
  beforeEach(() => {
    window.localStorage.clear();
    seedNostrEventsStore(nostrEvents);
    useFilterStore.setState({ activeRelayIds: new Set(["relay-one"]), channelFilterStates: new Map(), channelMatchMode: "and" });
    useTaskMutationStore.setState({
      localTasks: [],
      postedTags: [],
      suppressedNostrEventIds: new Set(),
    });
  });

  it("drops relay-scoped compose channels when switching to a relay where they do not exist", () => {
    render(
      <MemoryRouter>
        <Harness />
      </MemoryRouter>
    );

    expect(screen.getByTestId("compose-channel-names")).toHaveTextContent("ops");

    fireEvent.click(screen.getByRole("button", { name: "ToggleOps" }));
    expect(screen.getByTestId("compose-included-channel-names")).toHaveTextContent("ops");

    fireEvent.click(screen.getByRole("button", { name: "SwitchRelay" }));

    expect(screen.getByTestId("compose-channel-names")).toHaveTextContent("general");
    expect(screen.getByTestId("compose-channel-names")).not.toHaveTextContent("ops");
    expect(screen.getByTestId("compose-included-channel-names")).toHaveTextContent("");
  });

  it("keeps chip-added channels scoped to the relay they were added from", () => {
    render(
      <MemoryRouter>
        <Harness />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "RelayOne" }));
    fireEvent.click(screen.getByRole("button", { name: "HashtagInclude" }));

    expect(screen.getByTestId("compose-channel-names")).toHaveTextContent("ops");
    expect(screen.getByTestId("compose-channel-names")).toHaveTextContent("urgent");

    fireEvent.click(screen.getByRole("button", { name: "SwitchRelay" }));

    expect(screen.getByTestId("compose-channel-names")).toHaveTextContent("general");
    expect(screen.getByTestId("compose-channel-names")).not.toHaveTextContent("urgent");
  });
});
