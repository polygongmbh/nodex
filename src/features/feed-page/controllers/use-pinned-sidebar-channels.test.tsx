import { render, screen, act } from "@testing-library/react";
import { useRef } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { usePinnedSidebarChannels } from "./use-pinned-sidebar-channels";
import { makeChannel, makeTask } from "@/test/fixtures";
import type { Channel } from "@/types";
import { loadPinnedChannelsState, savePinnedChannelsState } from "@/infrastructure/preferences/pinned-channels-storage";
import { createEmptyPinnedChannelsState, getPinnedChannelIdsForRelays, pinChannelForRelays } from "@/domain/preferences/pinned-channel-state";

function Harness({
  channels,
  channelFilterStates,
  allRelays = ["relay-one"],
}: {
  channels: Channel[];
  channelFilterStates: Map<string, Channel["filterState"]>;
  allRelays?: string[];
}) {
  const result = usePinnedSidebarChannels({
    userPubkey: undefined,
    effectiveActiveRelayIds: new Set(allRelays),
    channels,
    channelFilterStates,
    allTasks: [
      makeTask({ id: "task-one", tags: ["general"], relays: ["relay-one"] }),
      makeTask({ id: "task-two", tags: ["ops"], relays: ["relay-two"] }),
    ],
  });

  const handleRef = useRef(result.handleChannelPin);
  handleRef.current = result.handleChannelPin;

  return (
    <>
      <output data-testid="channels-with-state">
        {result.channelsWithState
          .map((channel) => `${channel.id}:${channel.filterState}`)
          .join(",")}
      </output>
      <output data-testid="pinned-channel-ids">
        {result.pinnedChannelIds.join(",")}
      </output>
      <button onClick={() => handleRef.current("ops")}>pin-ops</button>
      <button onClick={() => handleRef.current("general")}>pin-general</button>
    </>
  );
}

describe("usePinnedSidebarChannels", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("does not surface missing active filtered channels in the sidebar", () => {
    render(
      <Harness
        channels={[makeChannel({ id: "general", name: "general" })]}
        channelFilterStates={new Map([
          ["urgent", "included"],
        ])}
      />
    );

    expect(screen.getByTestId("channels-with-state")).toHaveTextContent("general:neutral");
    expect(screen.getByTestId("channels-with-state")).not.toHaveTextContent("urgent:included");
  });

  it("does not duplicate a channel already present in the derived list", () => {
    render(
      <Harness
        channels={[
          makeChannel({ id: "general", name: "general" }),
          makeChannel({ id: "urgent", name: "urgent" }),
        ]}
        channelFilterStates={new Map([
          ["urgent", "included"],
        ])}
      />
    );

    expect(screen.getByTestId("channels-with-state")).toHaveTextContent("general:neutral,urgent:included");
  });

  it("returns pinned channel ids as a first-class result", () => {
    window.localStorage.setItem(
      "nodex.pinned-channels.guest",
      JSON.stringify({
        byRelay: {
          "relay-one": [{ channelId: "ops", pinnedAt: "2026-04-04T10:00:00.000Z", order: 0 }],
        },
      })
    );

    render(
      <Harness
        channels={[makeChannel({ id: "general", name: "general" })]}
        channelFilterStates={new Map()}
      />
    );

    expect(screen.getByTestId("pinned-channel-ids")).toHaveTextContent("ops");
  });

  it("pins a channel only to the relay where it appears in tasks", () => {
    render(
      <Harness
        channels={[]}
        channelFilterStates={new Map()}
        allRelays={["relay-one", "relay-two"]}
      />
    );

    act(() => {
      screen.getByText("pin-ops").click();
    });

    const saved = loadPinnedChannelsState(undefined);
    expect(getPinnedChannelIdsForRelays(saved, ["relay-two"])).toContain("ops");
    expect(getPinnedChannelIdsForRelays(saved, ["relay-one"])).not.toContain("ops");
  });

  it("pins a channel to all active relays when it has no relay presence", () => {
    const preloaded = pinChannelForRelays(createEmptyPinnedChannelsState(), ["relay-one"], "general");
    savePinnedChannelsState(preloaded);

    render(
      <Harness
        channels={[]}
        channelFilterStates={new Map()}
        allRelays={["relay-one", "relay-two"]}
      />
    );

    // "general" appears in tasks only on relay-one, so pin scopes to relay-one
    expect(getPinnedChannelIdsForRelays(loadPinnedChannelsState(undefined), ["relay-one"])).toContain("general");
    expect(getPinnedChannelIdsForRelays(loadPinnedChannelsState(undefined), ["relay-two"])).not.toContain("general");
  });
});
