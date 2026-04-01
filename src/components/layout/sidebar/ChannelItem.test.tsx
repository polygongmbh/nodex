import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ChannelItem } from "./ChannelItem";
import type { Channel } from "@/types";
import { FeedInteractionProvider } from "@/features/feed-page/interactions/feed-interaction-context";

const baseChannel: Channel = {
  id: "general",
  name: "general",
  filterState: "neutral",
};

describe("ChannelItem", () => {
  const renderChannelItem = (ui: ReactNode, dispatch = vi.fn().mockResolvedValue({
    envelope: { id: 1, dispatchedAtMs: Date.now(), intent: { type: "ui.focusTasks" } },
    outcome: { status: "handled" },
  })) => {
    render(
      <FeedInteractionProvider bus={{ dispatch, dispatchBatch: vi.fn().mockResolvedValue([]) }}>
        {ui}
      </FeedInteractionProvider>
    );
    return dispatch;
  };

  it("enables exclusive filter when clicking the channel text", () => {
    const dispatch = renderChannelItem(<ChannelItem channel={baseChannel} />);

    const exclusiveButton = screen.getByTestId("channel-item-exclusive-general");

    fireEvent.click(exclusiveButton);

    expect(dispatch).toHaveBeenCalledWith({ type: "sidebar.channel.exclusive", channelId: "general" });
  });

  it("toggles filter when clicking the hashtag icon", () => {
    const dispatch = renderChannelItem(<ChannelItem channel={baseChannel} />);
    const toggleButton = screen.getByTestId("channel-item-toggle-general");

    fireEvent.click(toggleButton);

    expect(dispatch).toHaveBeenCalledWith({ type: "sidebar.channel.toggle", channelId: "general" });
  });

  it("renders pin button", () => {
    renderChannelItem(<ChannelItem channel={baseChannel} />);
    expect(screen.getByTestId("channel-item-pin-general")).toBeInTheDocument();
  });

  it("dispatches pin when pin button is clicked and channel is not pinned", () => {
    const dispatch = renderChannelItem(<ChannelItem channel={baseChannel} isPinned={false} />);

    fireEvent.click(screen.getByTestId("channel-item-pin-general"));

    expect(dispatch).toHaveBeenCalledWith({ type: "sidebar.channel.pin", channelId: "general" });
  });

  it("dispatches unpin when pin button is clicked and channel is pinned", () => {
    const dispatch = renderChannelItem(<ChannelItem channel={baseChannel} isPinned={true} />);

    fireEvent.click(screen.getByTestId("channel-item-pin-general"));

    expect(dispatch).toHaveBeenCalledWith({ type: "sidebar.channel.unpin", channelId: "general" });
  });

  it("keeps the pin in a separate far-left gutter so the hashtag column does not move", () => {
    renderChannelItem(
      <ChannelItem
        channel={{
          ...baseChannel,
          name: "very-long-channel-name-that-should-not-shift-the-hashtag-column",
          filterState: "included",
        }}
      />
    );

    const pinButton = screen.getByTestId("channel-item-pin-general");
    const toggleButton = screen.getByTestId("channel-item-toggle-general");

    expect(pinButton.className).toContain("absolute");
    expect(pinButton.className).toContain("left-1");
    expect(pinButton.className).toContain("h-6");
    expect(toggleButton.className).not.toContain("absolute");
  });
});
