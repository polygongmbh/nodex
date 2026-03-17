import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChannelMatchModeToggle } from "./ChannelMatchModeToggle";

describe("ChannelMatchModeToggle", () => {
  it("toggles from and to or and reflects pressed state", () => {
    const onChange = vi.fn();

    render(<ChannelMatchModeToggle mode="and" onChange={onChange} />);

    const button = screen.getByRole("button", { name: /included channel match mode/i });
    expect(button).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(button);

    expect(onChange).toHaveBeenCalledWith("or");
  });
});
