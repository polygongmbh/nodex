import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileChannelChips } from "./MobileChannelChips";
import { makeChannel } from "@/test/fixtures";

const channels = [
  makeChannel({ id: "dev", name: "dev", usageCount: 4 }),
  makeChannel({ id: "design", name: "design", usageCount: 5 }),
];

function renderChips(overrides: Partial<React.ComponentProps<typeof MobileChannelChips>> = {}) {
  const props = {
    channels,
    isManageActive: false,
    onManageToggle: vi.fn(),
    onSelectHome: vi.fn(),
    onSelectChannel: vi.fn(),
    onTogglePin: vi.fn(),
    ...overrides,
  };
  render(<MobileChannelChips {...props} />);
  return props;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("MobileChannelChips", () => {
  it("renders the Home chip and a chip per channel with its usage count", () => {
    renderChips();
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("#dev")).toBeInTheDocument();
    expect(screen.getByText("#design")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("toggles manage from the menu chip", () => {
    const { onManageToggle } = renderChips();
    fireEvent.click(screen.getByTestId("mobile-chip-menu"));
    expect(onManageToggle).toHaveBeenCalledOnce();
  });

  it("selects home and channels on tap", () => {
    const { onSelectHome, onSelectChannel } = renderChips();
    fireEvent.click(screen.getByText("Home"));
    expect(onSelectHome).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByText("#dev"));
    expect(onSelectChannel).toHaveBeenCalledWith("dev");
  });

  it("marks Home active when no channel is included, and the included channel otherwise", () => {
    const devChipClass = () => screen.getByText("#dev").closest("button")!.className;
    renderChips();
    // The active chip is the only one with the primary-foreground text color.
    expect(screen.getByText("Home").className).toContain("text-primary-foreground");
    expect(devChipClass()).not.toContain("text-primary-foreground");

    cleanup();
    renderChips({
      channels: [
        makeChannel({ id: "dev", name: "dev", usageCount: 4, filterState: "included" }),
        makeChannel({ id: "design", name: "design", usageCount: 5 }),
      ],
    });
    expect(screen.getByText("Home").className).not.toContain("text-primary-foreground");
    expect(devChipClass()).toContain("text-primary-foreground");
  });

  it("lights up every included chip when multiple channels are selected", () => {
    renderChips({
      channels: [
        makeChannel({ id: "dev", name: "dev", usageCount: 4, filterState: "included" }),
        makeChannel({ id: "design", name: "design", usageCount: 5, filterState: "included" }),
      ],
    });
    expect(screen.getByText("#dev").closest("button")!.className).toContain("text-primary-foreground");
    expect(screen.getByText("#design").closest("button")!.className).toContain("text-primary-foreground");
    // Home steps aside while any channel is scoped.
    expect(screen.getByText("Home").className).not.toContain("text-primary-foreground");
  });

  it("marks pinned chips with a pin icon and drops the hash prefix", () => {
    renderChips({
      channels: [
        makeChannel({ id: "dev", name: "dev", usageCount: 4, pinIndex: 0 }),
        makeChannel({ id: "random", name: "random", usageCount: 1 }),
      ],
    });
    // Pinned chip shows the bare name (no '#') and a pin glyph.
    const pinned = screen.getByText("dev").closest("button")!;
    const unpinned = screen.getByText("#random").closest("button")!;
    expect(pinned).toHaveAttribute("data-pinned", "true");
    expect(pinned.querySelector("svg")).not.toBeNull();
    expect(unpinned).not.toHaveAttribute("data-pinned");
    expect(unpinned.querySelector("svg")).toBeNull();
  });

  it("toggles pin on long-press and suppresses the trailing tap", () => {
    vi.useFakeTimers();
    const { onTogglePin, onSelectChannel } = renderChips({
      channels: [makeChannel({ id: "dev", name: "dev", usageCount: 4, pinIndex: 0 })],
    });
    const devChip = screen.getByText("dev");

    fireEvent.pointerDown(devChip, { button: 0, pointerId: 1 });
    vi.advanceTimersByTime(500);
    expect(onTogglePin).toHaveBeenCalledWith("dev", true);

    fireEvent.click(devChip);
    expect(onSelectChannel).not.toHaveBeenCalled();
  });

  it("pins an unpinned channel on long-press", () => {
    vi.useFakeTimers();
    const unpinned = [makeChannel({ id: "team", name: "team", usageCount: 3 })];
    const onTogglePin = vi.fn();
    renderChips({ channels: unpinned, onTogglePin });

    fireEvent.pointerDown(screen.getByText("#team"), { button: 0, pointerId: 1 });
    vi.advanceTimersByTime(500);
    expect(onTogglePin).toHaveBeenCalledWith("team", false);
  });
});
