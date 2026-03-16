import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChannelItem } from "./ChannelItem";
import type { Channel } from "@/types";

const baseChannel: Channel = {
  id: "general",
  name: "general",
  filterState: "neutral",
};

describe("ChannelItem", () => {
  it("enables exclusive filter when clicking the channel text", () => {
    const onToggle = vi.fn();
    const onExclusive = vi.fn();

    render(<ChannelItem channel={baseChannel} onToggle={onToggle} onExclusive={onExclusive} />);

    const exclusiveButton = screen.getByRole("button", { name: "Show only #general" });

    fireEvent.click(exclusiveButton);

    expect(onExclusive).toHaveBeenCalledTimes(1);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("toggles filter when clicking the hashtag icon", () => {
    const onToggle = vi.fn();
    const onExclusive = vi.fn();

    render(<ChannelItem channel={baseChannel} onToggle={onToggle} onExclusive={onExclusive} />);
    const toggleButton = screen.getByRole("button", { name: "Toggle #general filter" });

    fireEvent.click(toggleButton);

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onExclusive).not.toHaveBeenCalled();
  });

  it("renders pin button when onPin is provided", () => {
    render(
      <ChannelItem
        channel={baseChannel}
        onToggle={vi.fn()}
        onExclusive={vi.fn()}
        onPin={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /pin #general/i })).toBeInTheDocument();
  });

  it("does not render pin button when neither onPin nor onUnpin is provided", () => {
    render(<ChannelItem channel={baseChannel} onToggle={vi.fn()} onExclusive={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /pin #general/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /unpin #general/i })).not.toBeInTheDocument();
  });

  it("calls onPin when pin button is clicked and channel is not pinned", () => {
    const onPin = vi.fn();
    const onToggle = vi.fn();

    render(
      <ChannelItem
        channel={baseChannel}
        onToggle={onToggle}
        onExclusive={vi.fn()}
        isPinned={false}
        onPin={onPin}
        onUnpin={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /pin #general/i }));

    expect(onPin).toHaveBeenCalledTimes(1);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("calls onUnpin when pin button is clicked and channel is pinned", () => {
    const onUnpin = vi.fn();
    const onToggle = vi.fn();

    render(
      <ChannelItem
        channel={baseChannel}
        onToggle={onToggle}
        onExclusive={vi.fn()}
        isPinned={true}
        onPin={vi.fn()}
        onUnpin={onUnpin}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /unpin #general/i }));

    expect(onUnpin).toHaveBeenCalledTimes(1);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("pin button is visible when channel is pinned", () => {
    render(
      <ChannelItem
        channel={baseChannel}
        onToggle={vi.fn()}
        onExclusive={vi.fn()}
        isPinned={true}
        onPin={vi.fn()}
        onUnpin={vi.fn()}
      />
    );
    const btn = screen.getByRole("button", { name: /unpin #general/i });
    expect(btn).not.toHaveClass("opacity-0");
  });

  it("pin button has opacity-0 class when channel is not pinned", () => {
    render(
      <ChannelItem
        channel={baseChannel}
        onToggle={vi.fn()}
        onExclusive={vi.fn()}
        isPinned={false}
        onPin={vi.fn()}
        onUnpin={vi.fn()}
      />
    );
    const btn = screen.getByRole("button", { name: /pin #general/i });
    expect(btn).toHaveClass("opacity-0");
  });

});
