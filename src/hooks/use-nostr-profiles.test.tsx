import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNostrProfile } from "./use-nostr-profiles";

const mockUseNDK = vi.fn();

vi.mock("@/lib/nostr/ndk-context", () => ({
  useNDK: () => mockUseNDK(),
}));

describe("useNostrProfile stability", () => {
  beforeEach(() => {
    mockUseNDK.mockReset();
    mockUseNDK.mockReturnValue({ ndk: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not rerender in a loop when pubkey is null", async () => {
    let renderCount = 0;

    function Harness() {
      renderCount += 1;
      useNostrProfile(null);
      return null;
    }

    const view = render(<Harness />);

    try {
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(renderCount).toBeLessThan(10);
    } finally {
      view.unmount();
    }
  });

  it("settles after subscription eose without entering a rerender loop", async () => {
    const pubkey = "a".repeat(64);
    const subscribe = vi.fn(() => {
      const listeners: {
        event?: (event: { content: string; pubkey: string }) => void;
        eose?: () => void;
      } = {};
      setTimeout(() => listeners.eose?.(), 0);
      return {
        on: (
          event: "event" | "eose",
          callback: ((event: { content: string; pubkey: string }) => void) | (() => void)
        ) => {
          if (event === "event") {
            listeners.event = callback as (event: { content: string; pubkey: string }) => void;
            return;
          }
          listeners.eose = callback as () => void;
        },
        stop: vi.fn(),
      };
    });

    mockUseNDK.mockReturnValue({
      ndk: {
        subscribe,
      },
    });

    let renderCount = 0;
    function Harness() {
      renderCount += 1;
      useNostrProfile(pubkey);
      return null;
    }

    const view = render(<Harness />);

    try {
      await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(1));
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(renderCount).toBeLessThan(20);
    } finally {
      view.unmount();
    }
  });
});
