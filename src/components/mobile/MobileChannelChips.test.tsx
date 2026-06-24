import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileChannelChips } from "./MobileChannelChips";
import { makeChannel } from "@/test/fixtures";

const channels = [
  makeChannel({ id: "dev", name: "dev", usageCount: 4, pinIndex: 0 }),
  makeChannel({ id: "design", name: "design", usageCount: 5, pinIndex: 1 }),
];

function renderChips(overrides: Partial<React.ComponentProps<typeof MobileChannelChips>> = {}) {
  const props = {
    channels,
    activeChannelId: null,
    isManageActive: false,
    onManageOpen: vi.fn(),
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

  it("opens manage from the menu chip", () => {
    const { onManageOpen } = renderChips();
    fireEvent.click(screen.getByTestId("mobile-chip-menu"));
    expect(onManageOpen).toHaveBeenCalledOnce();
  });

  it("selects home and channels on tap", () => {
    const { onSelectHome, onSelectChannel } = renderChips();
    fireEvent.click(screen.getByText("Home"));
    expect(onSelectHome).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByText("#dev"));
    expect(onSelectChannel).toHaveBeenCalledWith("dev");
  });

  it("marks Home active when no channel is selected, and the channel otherwise", () => {
    const { rerender } = render(
      <MobileChannelChips
        channels={channels}
        activeChannelId={null}
        isManageActive={false}
        onManageOpen={vi.fn()}
        onSelectHome={vi.fn()}
        onSelectChannel={vi.fn()}
        onTogglePin={vi.fn()}
      />
    );
    const devChipClass = () => screen.getByText("#dev").closest("button")!.className;
    expect(screen.getByText("Home").className).toContain("bg-primary");
    expect(devChipClass()).not.toContain("bg-primary");

    rerender(
      <MobileChannelChips
        channels={channels}
        activeChannelId="dev"
        isManageActive={false}
        onManageOpen={vi.fn()}
        onSelectHome={vi.fn()}
        onSelectChannel={vi.fn()}
        onTogglePin={vi.fn()}
      />
    );
    expect(screen.getByText("Home").className).not.toContain("bg-primary");
    expect(devChipClass()).toContain("bg-primary");
  });

  it("toggles pin on long-press and suppresses the trailing tap", () => {
    vi.useFakeTimers();
    const { onTogglePin, onSelectChannel } = renderChips();
    const devChip = screen.getByText("#dev");

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
