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
    currentView: "feed",
    effectiveActiveRelayIds: new Set(["relay-one"]),
    channels,
    channelFilterStates,
    allTasks: [
      makeTask({ id: "task-one", tags: ["general"], relays: ["relay-one"] }),
      makeTask({ id: "task-two", tags: ["ops"], relays: ["relay-one"] }),
    ],
  });

  return (
    <output data-testid="channels-with-state">
      {result.channelsWithState
        .map((channel) => `${channel.id}:${channel.filterState}`)
        .join(",")}
    </output>
  );
}

describe("usePinnedSidebarChannels", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("surfaces active filtered channels even when missing from derived channels", () => {
    render(
      <Harness
        channels={[makeChannel({ id: "general", name: "general" })]}
        channelFilterStates={new Map([
          ["urgent", "included"],
        ])}
      />
    );

    expect(screen.getByTestId("channels-with-state")).toHaveTextContent("urgent:included");
    expect(screen.getByTestId("channels-with-state")).toHaveTextContent("general:neutral");
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
});
