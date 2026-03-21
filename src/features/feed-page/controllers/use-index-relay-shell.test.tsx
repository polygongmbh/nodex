import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeRelayAddUrl, useIndexRelayShell } from "./use-index-relay-shell";

function createWrapper() {
  const queryClient = new QueryClient();
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useIndexRelayShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes bare relay urls to wss and activates the normalized relay id", () => {
    const addRelay = vi.fn();
    const setActiveRelayIds = vi.fn();

    const { result } = renderHook(
      () =>
        useIndexRelayShell({
          ndkRelays: [],
          relays: [],
          effectiveActiveRelayIds: new Set(),
          addRelay,
          removeRelay: vi.fn(),
          setActiveRelayIds,
          removeCachedRelayProfile: vi.fn(),
        }),
      { wrapper: createWrapper() }
    );

    result.current.handleAddRelay(" relay.example.com/ ");

    expect(addRelay).toHaveBeenCalledWith("wss://relay.example.com");
    expect(setActiveRelayIds).toHaveBeenCalledTimes(1);
    const setState = setActiveRelayIds.mock.calls[0]?.[0] as (previous: Set<string>) => Set<string>;
    const next = setState(new Set());
    expect(next).toEqual(new Set(["relay-example-com"]));
  });

  it("does not add relays for empty or unsupported protocol inputs", () => {
    const addRelay = vi.fn();
    const setActiveRelayIds = vi.fn();

    const { result } = renderHook(
      () =>
        useIndexRelayShell({
          ndkRelays: [],
          relays: [],
          effectiveActiveRelayIds: new Set(),
          addRelay,
          removeRelay: vi.fn(),
          setActiveRelayIds,
          removeCachedRelayProfile: vi.fn(),
        }),
      { wrapper: createWrapper() }
    );

    result.current.handleAddRelay("   ");
    result.current.handleAddRelay("https://relay.example.com");

    expect(addRelay).not.toHaveBeenCalled();
    expect(setActiveRelayIds).not.toHaveBeenCalled();
  });
});

describe("normalizeRelayAddUrl", () => {
  it("normalizes and validates relay input for shared add handling", () => {
    expect(normalizeRelayAddUrl("relay.example.com")).toBe("wss://relay.example.com");
    expect(normalizeRelayAddUrl(" ws://relay.example.com/ ")).toBe("ws://relay.example.com");
    expect(normalizeRelayAddUrl("   ")).toBeNull();
    expect(normalizeRelayAddUrl("https://relay.example.com")).toBeNull();
  });
});
