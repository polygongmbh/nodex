import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RelayItem } from "./RelayItem";
import type { Relay } from "@/types";

const baseRelay: Relay = {
  id: "relay-1",
  name: "Main Relay",
  icon: "cpu",
  isActive: true,
};

describe("RelayItem", () => {
  it("supports exclusive and toggle relay actions", () => {
    const onToggle = vi.fn();
    const onExclusive = vi.fn();

    render(<RelayItem relay={baseRelay} onToggle={onToggle} onExclusive={onExclusive} />);

    const exclusiveButton = screen.getByRole("button", { name: "Show only Main Relay feed" });
    const toggleButton = screen.getByRole("button", { name: "Toggle Main Relay feed" });

    fireEvent.click(exclusiveButton);
    fireEvent.click(toggleButton);

    expect(onExclusive).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
