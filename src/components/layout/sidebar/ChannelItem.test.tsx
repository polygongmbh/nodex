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

    fireEvent.click(screen.getByRole("button", { name: "Show only #general" }));

    expect(onExclusive).toHaveBeenCalledTimes(1);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("toggles filter when clicking the hashtag icon", () => {
    const onToggle = vi.fn();
    const onExclusive = vi.fn();

    render(<ChannelItem channel={baseChannel} onToggle={onToggle} onExclusive={onExclusive} />);

    fireEvent.click(screen.getByRole("button", { name: "Toggle #general filter" }));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onExclusive).not.toHaveBeenCalled();
  });
});
