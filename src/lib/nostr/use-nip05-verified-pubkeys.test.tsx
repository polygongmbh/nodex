import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNip05VerifiedPubkeys } from "./use-nip05-verified-pubkeys";
import { clearNip05ResolutionCache } from "./nip05-resolver";

const pubkeyA = "a".repeat(64);

const fetchMock = vi.fn();

beforeEach(() => {
  clearNip05ResolutionCache();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  clearNip05ResolutionCache();
  vi.unstubAllGlobals();
});

function mockResolverHit(localPart: string, pubkey: string) {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ names: { [localPart]: pubkey } }),
  });
}

function mockResolverMiss() {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ names: {} }) });
}

describe("useNip05VerifiedPubkeys", () => {
  it("returns the pubkey set once nip05 resolution matches", async () => {
    mockResolverHit("alice", pubkeyA);
    let observed = new Set<string>();
    function Probe() {
      observed = useNip05VerifiedPubkeys([{ pubkey: pubkeyA, nip05: "alice@example.com" }]);
      return null;
    }
    render(<Probe />);

    await waitFor(() => expect(observed.has(pubkeyA)).toBe(true));
  });

  it("does not verify when the resolved pubkey differs", async () => {
    mockResolverHit("alice", "f".repeat(64));
    let observed = new Set<string>();
    function Probe() {
      observed = useNip05VerifiedPubkeys([{ pubkey: pubkeyA, nip05: "alice@example.com" }]);
      return null;
    }
    render(<Probe />);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(observed.has(pubkeyA)).toBe(false);
  });

  it("reuses cached resolutions instead of refetching", async () => {
    mockResolverHit("alice", pubkeyA);
    function Probe() {
      useNip05VerifiedPubkeys([{ pubkey: pubkeyA, nip05: "alice@example.com" }]);
      return null;
    }
    const first = render(<Probe />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    first.unmount();

    render(<Probe />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns an empty set when there is no nip05", async () => {
    mockResolverMiss();
    let observed = new Set<string>();
    function Probe() {
      observed = useNip05VerifiedPubkeys([{ pubkey: pubkeyA }]);
      return null;
    }
    render(<Probe />);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(observed.size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
