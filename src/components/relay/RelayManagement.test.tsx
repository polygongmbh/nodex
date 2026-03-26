import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { RelayManagement } from "./RelayManagement";
import { toast } from "sonner";
import { FeedInteractionProvider } from "@/features/feed-page/interactions/feed-interaction-context";
import i18n from "@/lib/i18n/config";

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
    void i18n.changeLanguage("en");
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

  it("shows distinct status labels for connection issues and read rejections", () => {
    renderWithBus(
      <RelayManagement
        relays={[
          { url: "wss://relay.one", status: "connection-error" },
          { url: "wss://relay.two", status: "verification-failed" },
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /manage relays/i }));
    expect(screen.getByText(i18n.t("relay.status.connectionError"))).toBeInTheDocument();
    expect(screen.getByText(i18n.t("relay.status.readRejected"))).toBeInTheDocument();
  });

  it("shows the read-only relay explanatory hint", () => {
    renderWithBus(
      <RelayManagement
        relays={[
          { url: "wss://relay.one", status: "read-only" },
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /manage relays/i }));
    expect(screen.getByText(i18n.t("relay.statusHints.readOnly"))).toBeInTheDocument();
  });

  it("shows relay capability metadata fields when details are expanded", () => {
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

    expect(screen.getByRole("button", { name: /hide relay details/i })).toBeInTheDocument();
    expect(screen.getByText(i18n.t("relay.details.title"))).toBeInTheDocument();
    expect(screen.getByText(i18n.t("relay.details.authRequired"))).toBeInTheDocument();
    expect(screen.getByText(i18n.t("relay.details.supportsNip42"))).toBeInTheDocument();
    expect(screen.getAllByText(i18n.t("relay.details.yes"))).toHaveLength(2);
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

  it("dispatches relay reorder intent with the next ordered relay urls", () => {
    const dispatch = renderWithBus(
      <RelayManagement
        relays={[
          { url: "wss://relay.one", status: "connected" },
          { url: "wss://relay.two", status: "connected" },
          { url: "wss://relay.three", status: "connected" },
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /manage relays/i }));
    fireEvent.click(screen.getByRole("button", { name: /move relay\.one down/i }));

    expect(dispatch).toHaveBeenCalledWith({
      type: "sidebar.relay.reorder",
      orderedUrls: ["wss://relay.two", "wss://relay.one", "wss://relay.three"],
    });
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
