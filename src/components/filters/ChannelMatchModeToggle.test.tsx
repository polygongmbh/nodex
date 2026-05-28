import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChannelMatchModeToggle } from "./ChannelMatchModeToggle";

describe("ChannelMatchModeToggle", () => {
  it("toggles from and to or and reflects pressed state", () => {
    const onChange = vi.fn();

    render(<ChannelMatchModeToggle mode="and" onChange={onChange} />);

    const button = screen.getByTestId("channel-match-mode-toggle");

    fireEvent.click(button);

    expect(onChange).toHaveBeenCalledWith("or");
  });
});
