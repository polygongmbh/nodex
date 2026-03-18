import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const startupRelaysModule = vi.hoisted(() => ({
  readStartupRelayBootstrap: vi.fn(),
  resolveStartupRelayBootstrap: vi.fn(),
}));

const ndkContextModule = vi.hoisted(() => ({
  NDKProvider: vi.fn(({ children }: { children: ReactNode }) => <>{children}</>),
}));

vi.mock("@/components/ui/toaster", () => ({
  Toaster: () => null,
}));

vi.mock("@/components/ui/sonner", () => ({
  Toaster: () => null,
}));

vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/theme/ThemeProvider", () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/infrastructure/nostr/ndk-context", () => ndkContextModule);
vi.mock("@/infrastructure/nostr/startup-relays", () => startupRelaysModule);
vi.mock("@/lib/nostr/dev-logs", () => ({
  nostrDevLog: vi.fn(),
}));

vi.mock("./pages/Index", () => ({
  default: () => <div data-testid="index-page">Index</div>,
}));

vi.mock("./pages/NotFound", () => ({
  default: () => <div data-testid="not-found-page">Not found</div>,
}));

describe("App routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    startupRelaysModule.readStartupRelayBootstrap.mockReturnValue({
      relayUrls: ["wss://relay.env"],
      source: "env",
      needsAsyncFallback: false,
    });
    startupRelaysModule.resolveStartupRelayBootstrap.mockResolvedValue({
      relayUrls: ["wss://relay.fallback"],
      source: "fallback",
      needsAsyncFallback: false,
    });
    window.history.pushState({}, "", "/");
  });

  it("renders Index for /signin", () => {
    window.history.pushState({}, "", "/signin");

    render(<App />);

    expect(screen.getByTestId("index-page")).toBeInTheDocument();
    expect(ndkContextModule.NDKProvider).toHaveBeenCalledWith(
      expect.objectContaining({ defaultRelays: ["wss://relay.env"] }),
      expect.anything()
    );
  });

  it("renders Index for /signup", () => {
    window.history.pushState({}, "", "/signup");

    render(<App />);

    expect(screen.getByTestId("index-page")).toBeInTheDocument();
  });

  it("waits for async fallback relay bootstrap before mounting the provider", async () => {
    let resolveBootstrap: ((value: { relayUrls: string[]; source: "fallback"; needsAsyncFallback: false }) => void) | null = null;
    startupRelaysModule.readStartupRelayBootstrap.mockReturnValue({
      relayUrls: [],
      source: "fallback",
      needsAsyncFallback: true,
    });
    startupRelaysModule.resolveStartupRelayBootstrap.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveBootstrap = resolve;
        })
    );

    render(<App />);

    expect(ndkContextModule.NDKProvider).not.toHaveBeenCalled();

    resolveBootstrap?.({
      relayUrls: ["wss://relay.fallback"],
      source: "fallback",
      needsAsyncFallback: false,
    });

    await waitFor(() => {
      expect(ndkContextModule.NDKProvider).toHaveBeenCalledWith(
        expect.objectContaining({ defaultRelays: ["wss://relay.fallback"] }),
        expect.anything()
      );
    });
  });
});
