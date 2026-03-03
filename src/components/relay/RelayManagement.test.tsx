import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { RelayManagement } from "./RelayManagement";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("RelayManagement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  it("copies diagnostics from relay debug utilities", async () => {
    render(
      <RelayManagement
        relays={[
          { url: "wss://relay.one", status: "connected", latency: 123 },
          { url: "wss://relay.two", status: "disconnected" },
        ]}
        onAddRelay={() => {}}
        onRemoveRelay={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /manage relays/i }));
    fireEvent.click(screen.getByRole("button", { name: /copy diagnostics/i }));

    await Promise.resolve();

    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast.success)).toHaveBeenCalled();
  });

  it("shows distinct labels for connection issues and verification failures", () => {
    render(
      <RelayManagement
        relays={[
          { url: "wss://relay.one", status: "connection-error" },
          { url: "wss://relay.two", status: "verification-failed" },
        ]}
        onAddRelay={() => {}}
        onRemoveRelay={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /manage relays/i }));
    expect(screen.getByText("connection issue")).toBeInTheDocument();
    expect(screen.getByText("verification failed")).toBeInTheDocument();
  });
});
