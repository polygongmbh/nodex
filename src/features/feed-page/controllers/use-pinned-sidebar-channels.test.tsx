import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { usePinnedSidebarChannels } from "./use-pinned-sidebar-channels";
import { makeChannel, makeTask } from "@/test/fixtures";
import type { Channel } from "@/types";

function Harness({
  channels,
  channelFilterStates,
}: {
  channels: Channel[];
  channelFilterStates: Map<string, Channel["filterState"]>;
}) {
  const result = usePinnedSidebarChannels({
    userPubkey: undefined,
    effectiveActiveRelayIds: new Set(["relay-one"]),
    channels,
    channelFilterStates,
    allTasks: [
      makeTask({ id: "task-one", tags: ["general"], relays: ["relay-one"] }),
      makeTask({ id: "task-two", tags: ["ops"], relays: ["relay-one"] }),
    ],
  });

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
});
