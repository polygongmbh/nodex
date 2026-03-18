import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { RawNostrEventDialog } from "./RawNostrEventDialog";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const event = {
  id: "event-1",
  pubkey: "a".repeat(64),
  created_at: 1700000000,
  kind: 1,
  tags: [["t", "general"]],
  content: "hello #general",
  sig: "b".repeat(128),
};

describe("RawNostrEventDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  it("copies json and event id", async () => {
    render(
      <RawNostrEventDialog
        open
        onOpenChange={vi.fn()}
        event={event}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy JSON" }));
    await Promise.resolve();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(JSON.stringify(event, null, 2));
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Raw JSON copied to clipboard.");

    fireEvent.click(screen.getByRole("button", { name: "Copy event id" }));
    await Promise.resolve();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("event-1");
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Event id copied to clipboard.");
  });

  it("shows an error toast when clipboard copy fails", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("nope")) },
      configurable: true,
    });

    render(
      <RawNostrEventDialog
        open
        onOpenChange={vi.fn()}
        event={event}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy JSON" }));
    await Promise.resolve();

    expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Could not copy raw JSON.");
  });
});
