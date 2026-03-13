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

  it("shows distinct labels for connection issues and read rejections", () => {
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
    expect(screen.getByText("read rejected")).toBeInTheDocument();
  });

  it("explains read-only relays as readable but not publishable", () => {
    render(
      <RelayManagement
        relays={[
          { url: "wss://relay.one", status: "read-only" },
        ]}
        onAddRelay={() => {}}
        onRemoveRelay={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /manage relays/i }));
    expect(screen.getByText("Reads from this relay still work, but publishing to it is currently unavailable.")).toBeInTheDocument();
  });

  it("shows relay capability details from nip11 metadata", () => {
    render(
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
        onAddRelay={() => {}}
        onRemoveRelay={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /manage relays/i }));
    fireEvent.click(screen.getByRole("button", { name: /show relay details/i }));

    expect(screen.getByText("Relay capabilities")).toBeInTheDocument();
    expect(screen.getByText("Auth required")).toBeInTheDocument();
    expect(screen.getAllByText("yes").length).toBeGreaterThan(0);
    expect(screen.getByText("connected (auth required)")).toBeInTheDocument();
  });

  it("allows reconnecting an individual relay from the management panel", () => {
    const onReconnectRelay = vi.fn();

    render(
      <RelayManagement
        relays={[
          { url: "wss://relay.one", status: "read-only" },
        ]}
        onAddRelay={() => {}}
        onRemoveRelay={() => {}}
        onReconnectRelay={onReconnectRelay}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /manage relays/i }));
    fireEvent.click(screen.getByRole("button", { name: /reconnect relay/i }));

    expect(onReconnectRelay).toHaveBeenCalledWith("wss://relay.one");
  });

  it("removes an individual relay without triggering reconnect", () => {
    const onRemoveRelay = vi.fn();
    const onReconnectRelay = vi.fn();

    render(
      <RelayManagement
        relays={[
          { url: "wss://relay.one", status: "connected" },
        ]}
        onAddRelay={() => {}}
        onRemoveRelay={onRemoveRelay}
        onReconnectRelay={onReconnectRelay}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /manage relays/i }));
    fireEvent.click(screen.getByRole("button", { name: /remove relay/i }));

    expect(onRemoveRelay).toHaveBeenCalledWith("wss://relay.one");
    expect(onReconnectRelay).not.toHaveBeenCalled();
  });
});
