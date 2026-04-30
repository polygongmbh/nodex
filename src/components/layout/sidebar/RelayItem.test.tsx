import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { RelayItem } from "./RelayItem";
import type { Relay } from "@/types";
import { FeedInteractionProvider } from "@/features/feed-page/interactions/feed-interaction-context";

vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Tooltip: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: ReactNode }) => <div data-side="right">{children}</div>,
}));

const baseRelay: Relay = {
  id: "relay-1",
  name: "Main Relay",
  isActive: true,
  url: "wss://relay.damus.io",
};

describe("RelayItem", () => {
  it("dispatches typed relay selection intents for exclusive and toggle actions", () => {
    const dispatch = vi.fn().mockResolvedValue({
      envelope: { id: 1, dispatchedAtMs: Date.now(), intent: { type: "ui.focusTasks" } },
      outcome: { status: "handled" },
    });

    render(
      <FeedInteractionProvider bus={{ dispatch, dispatchBatch: vi.fn().mockResolvedValue([]) }}>
        <RelayItem relay={baseRelay} />
      </FeedInteractionProvider>
    );

    const exclusiveButton = screen.getByRole("button", { name: "Show only posts from relay.damus.io" });
    const toggleButton = screen.getByRole("button", { name: "Show or hide posts from relay.damus.io" });

    fireEvent.click(exclusiveButton);
    fireEvent.click(toggleButton);

    expect(dispatch).toHaveBeenCalledWith({ type: "sidebar.relay.select", relayId: "relay-1", mode: "exclusive" });
    expect(dispatch).toHaveBeenCalledWith({ type: "sidebar.relay.select", relayId: "relay-1", mode: "toggle" });
  });

  it("shows the connection issue tooltip across the whole row and suppresses button title tooltips", async () => {
    const dispatch = vi.fn().mockResolvedValue({
      envelope: { id: 1, dispatchedAtMs: Date.now(), intent: { type: "ui.focusTasks" } },
      outcome: { status: "handled" },
    });

    render(
      <FeedInteractionProvider bus={{ dispatch, dispatchBatch: vi.fn().mockResolvedValue([]) }}>
        <RelayItem
          relay={{
            ...baseRelay,
            connectionStatus: "connection-error",
          }}
        />
      </FeedInteractionProvider>
    );

    const exclusiveButton = screen.getByRole("button", { name: "Show only posts from relay.damus.io" });
    const toggleButton = screen.getByRole("button", { name: "Show or hide posts from relay.damus.io" });
    const rowTrigger = exclusiveButton.closest("[data-sidebar-item]")?.parentElement as HTMLElement;

    expect(exclusiveButton).not.toHaveAttribute("title");
    expect(toggleButton).not.toHaveAttribute("title");

    fireEvent.mouseEnter(rowTrigger);
    fireEvent.pointerMove(rowTrigger);

    expect((await screen.findAllByText("Connection Issue")).length).toBeGreaterThan(0);
    expect(document.querySelector("[data-side='right']")).not.toBeNull();
  });

  it("shows a disconnected relay popover across the whole row", async () => {
    render(
      <FeedInteractionProvider bus={{ dispatch: vi.fn().mockResolvedValue(undefined), dispatchBatch: vi.fn().mockResolvedValue([]) }}>
        <RelayItem
          relay={{
            ...baseRelay,
            connectionStatus: "disconnected",
          }}
        />
      </FeedInteractionProvider>
    );

    const exclusiveButton = screen.getByRole("button", { name: "Show only posts from relay.damus.io" });
    const rowTrigger = exclusiveButton.closest("[data-sidebar-item]")?.parentElement as HTMLElement;

    fireEvent.mouseEnter(rowTrigger);
    fireEvent.pointerMove(rowTrigger);

    expect((await screen.findAllByText("Disconnected")).length).toBeGreaterThan(0);
  });

  it("keeps the default row tooltip while enlarging the read-only status hit area", async () => {
    render(
      <FeedInteractionProvider bus={{ dispatch: vi.fn().mockResolvedValue(undefined), dispatchBatch: vi.fn().mockResolvedValue([]) }}>
        <RelayItem
          relay={{
            ...baseRelay,
            connectionStatus: "read-only",
          }}
        />
      </FeedInteractionProvider>
    );

    const exclusiveButton = screen.getByRole("button", { name: "Show only posts from relay.damus.io" });
    const toggleButton = screen.getByRole("button", { name: "Show or hide posts from relay.damus.io" });
    const readOnlyTrigger = screen.getByLabelText("Read Only");
    const sidebarRow = exclusiveButton.closest("[data-sidebar-item]") as HTMLElement;

    expect(exclusiveButton).toHaveAttribute("title");
    expect(toggleButton).toHaveAttribute("title");
    expect(sidebarRow.className).toContain("bg-sidebar-accent");
    expect(sidebarRow.className).not.toContain("bg-warning/10");

    fireEvent.mouseEnter(readOnlyTrigger);
    fireEvent.pointerMove(readOnlyTrigger);

    expect((await screen.findAllByText("Read Only")).length).toBeGreaterThan(0);
    expect(document.querySelector("[data-side='right']")).not.toBeNull();
  });
});
