import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { RelayManagement } from "./RelayManagement";
import { toast } from "sonner";
import { FeedInteractionProvider } from "@/features/feed-page/interactions/feed-interaction-context";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("RelayManagement", () => {
  const renderWithBus = (ui: ReactNode, dispatch = vi.fn().mockResolvedValue({
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

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  it("copies diagnostics from relay debug utilities", async () => {
    renderWithBus(
      <RelayManagement
        relays={[
          { url: "wss://relay.one", status: "connected", latency: 123 },
          { url: "wss://relay.two", status: "disconnected" },
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /manage relays/i }));
    fireEvent.click(screen.getByRole("button", { name: /copy diagnostics/i }));

    await Promise.resolve();

    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast.success)).toHaveBeenCalled();
  });

  it("shows distinct labels for connection issues and read rejections", () => {
    renderWithBus(
      <RelayManagement
        relays={[
          { url: "wss://relay.one", status: "connection-error" },
          { url: "wss://relay.two", status: "verification-failed" },
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /manage relays/i }));
    expect(screen.getByText("connection issue")).toBeInTheDocument();
    expect(screen.getByText("read rejected")).toBeInTheDocument();
  });

  it("explains read-only relays as readable but not publishable", () => {
    renderWithBus(
      <RelayManagement
        relays={[
          { url: "wss://relay.one", status: "read-only" },
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /manage relays/i }));
    expect(screen.getByText("Reads from this relay still work, but publishing to it is currently unavailable.")).toBeInTheDocument();
  });

  it("shows relay capability details from nip11 metadata", () => {
    renderWithBus(
      <RelayManagement
        relays={[
          {
            url: "wss://relay.one",
            status: "connected",
            nip11: {
              authRequired: true,
              supportsNip42: true,
              checkedAt: 1700000000000,
            },
          },
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /manage relays/i }));
    fireEvent.click(screen.getByRole("button", { name: /show relay details/i }));

    expect(screen.getByText("Relay capabilities")).toBeInTheDocument();
    expect(screen.getByText("Auth required")).toBeInTheDocument();
    expect(screen.getAllByText("yes").length).toBeGreaterThan(0);
    expect(screen.getByText("connected (auth required)")).toBeInTheDocument();
  });

  it("dispatches relay reconnect intent from the management panel", () => {
    const dispatch = renderWithBus(
      <RelayManagement
        relays={[
          { url: "wss://relay.one", status: "read-only" },
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /manage relays/i }));
    fireEvent.click(screen.getByRole("button", { name: /reconnect relay/i }));

    expect(dispatch).toHaveBeenCalledWith({ type: "sidebar.relay.reconnect", url: "wss://relay.one" });
  });

  it("dispatches relay remove intent without reconnect intent", () => {
    const dispatch = renderWithBus(
      <RelayManagement
        relays={[
          { url: "wss://relay.one", status: "connected" },
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /manage relays/i }));
    fireEvent.click(screen.getByRole("button", { name: /remove relay/i }));

    expect(dispatch).toHaveBeenCalledWith({ type: "sidebar.relay.remove", url: "wss://relay.one" });
    expect(dispatch).not.toHaveBeenCalledWith({ type: "sidebar.relay.reconnect", url: "wss://relay.one" });
  });

  it("dispatches trimmed relay input for shared add normalization", () => {
    const dispatch = renderWithBus(
      <RelayManagement
        relays={[
          { url: "wss://relay.one", status: "connected" },
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /manage relays/i }));
    fireEvent.change(screen.getByPlaceholderText(/wss:\/\/relay\.example\.com/i), {
      target: { value: " relay.example.com " },
    });
    fireEvent.keyDown(screen.getByPlaceholderText(/wss:\/\/relay\.example\.com/i), { key: "Enter" });

    expect(dispatch).toHaveBeenCalledWith({ type: "sidebar.relay.add", url: "relay.example.com" });
  });

});
