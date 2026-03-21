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

    const exclusiveButton = screen.getByRole("button", { name: "Show only #general" });

    fireEvent.click(exclusiveButton);

    expect(dispatch).toHaveBeenCalledWith({ type: "sidebar.channel.exclusive", channelId: "general" });
  });

  it("toggles filter when clicking the hashtag icon", () => {
    const dispatch = renderChannelItem(<ChannelItem channel={baseChannel} />);
    const toggleButton = screen.getByRole("button", { name: "Toggle #general filter" });

    fireEvent.click(toggleButton);

    expect(dispatch).toHaveBeenCalledWith({ type: "sidebar.channel.toggle", channelId: "general" });
  });

  it("renders pin button", () => {
    renderChannelItem(<ChannelItem channel={baseChannel} />);
    expect(screen.getByRole("button", { name: /pin #general/i })).toBeInTheDocument();
  });

  it("dispatches pin when pin button is clicked and channel is not pinned", () => {
    const dispatch = renderChannelItem(<ChannelItem channel={baseChannel} isPinned={false} />);

    fireEvent.click(screen.getByRole("button", { name: /pin #general/i }));

    expect(dispatch).toHaveBeenCalledWith({ type: "sidebar.channel.pin", channelId: "general" });
  });

  it("dispatches unpin when pin button is clicked and channel is pinned", () => {
    const dispatch = renderChannelItem(<ChannelItem channel={baseChannel} isPinned={true} />);

    fireEvent.click(screen.getByRole("button", { name: /unpin #general/i }));

    expect(dispatch).toHaveBeenCalledWith({ type: "sidebar.channel.unpin", channelId: "general" });
  });
});
