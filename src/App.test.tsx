import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const startupRelaysModule = vi.hoisted(() => ({
  readStartupRelayBootstrap: vi.fn(),
  resolveStartupRelayBootstrap: vi.fn(),
}));

const startupNoasModule = vi.hoisted(() => ({
  readStartupNoasBootstrap: vi.fn(),
  resolveStartupNoasBootstrap: vi.fn(),
}));

const ndkContextModule = vi.hoisted(() => ({
  NDKProvider: vi.fn(({ children }: { children: ReactNode }) => <>{children}</>),
}));

vi.mock("@/components/ui/toaster", () => ({
  Toaster: (): null => null,
}));

vi.mock("@/components/ui/sonner", () => ({
  Toaster: (): null => null,
}));

vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/theme/ThemeProvider", () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/infrastructure/nostr/ndk-context", () => ndkContextModule);
vi.mock("@/infrastructure/nostr/startup-relays", () => startupRelaysModule);
vi.mock("@/infrastructure/nostr/startup-noas", () => startupNoasModule);
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
    startupNoasModule.readStartupNoasBootstrap.mockReturnValue({
      defaultHostUrl: "",
      source: "fallback",
      needsAsyncFallback: false,
    });
    startupNoasModule.resolveStartupNoasBootstrap.mockResolvedValue({
      defaultHostUrl: "https://example.test",
      source: "fallback",
      needsAsyncFallback: false,
    });
    window.history.pushState({}, "", "/");
  });

  it("renders Index for /signin", async () => {
    window.history.pushState({}, "", "/signin");

    render(<App />);

    await screen.findByTestId("index-page");
    expect(ndkContextModule.NDKProvider).toHaveBeenCalledWith(
      expect.objectContaining({ defaultRelays: ["wss://relay.env"], defaultNoasHostUrl: "" }),
      expect.anything()
    );
  });

  it("renders Index for /signup", async () => {
    window.history.pushState({}, "", "/signup");

    render(<App />);

    await screen.findByTestId("index-page");
  });

  it("mounts immediately while async fallback relay bootstrap continues in the background", async () => {
    let resolveBootstrap!: (value: {
      relayUrls: string[];
      source: "fallback";
      needsAsyncFallback: false;
    }) => void;
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

    await screen.findByTestId("index-page");
    expect(ndkContextModule.NDKProvider).toHaveBeenCalledWith(
      expect.objectContaining({ defaultRelays: [], defaultNoasHostUrl: "" }),
      expect.anything()
    );

    resolveBootstrap({
      relayUrls: ["wss://relay.fallback"],
      source: "fallback",
      needsAsyncFallback: false,
    });

    await waitFor(() => {
      expect(ndkContextModule.NDKProvider).toHaveBeenCalledWith(
        expect.objectContaining({ defaultRelays: ["wss://relay.fallback"], defaultNoasHostUrl: "" }),
        expect.anything()
      );
    });
  });

  it("updates the NDK provider with a discovered startup Noas host without blocking app boot", async () => {
    startupNoasModule.readStartupNoasBootstrap.mockReturnValue({
      defaultHostUrl: "",
      source: "fallback",
      needsAsyncFallback: true,
    });

    render(<App />);

    await screen.findByTestId("index-page");
    expect(ndkContextModule.NDKProvider).toHaveBeenCalledWith(
      expect.objectContaining({ defaultNoasHostUrl: "" }),
      expect.anything()
    );

    await waitFor(() => {
      expect(ndkContextModule.NDKProvider).toHaveBeenCalledWith(
        expect.objectContaining({ defaultNoasHostUrl: "https://example.test" }),
        expect.anything()
      );
    });
  });
});
