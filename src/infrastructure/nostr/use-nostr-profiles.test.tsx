import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  useCachedNostrProfile,
  useNostrProfile,
  useNostrProfiles,
} from "./use-nostr-profiles";
import { defaultKind0Cache } from "./people-from-kind0";
import { NostrEventKind, type NostrEvent } from "@/lib/nostr/types";

const pubkeyA = "a".repeat(64);
const pubkeyB = "b".repeat(64);

function kind0(pubkey: string, content: Record<string, string>, createdAt?: number): NostrEvent {
  return {
    id: "",
    pubkey,
    kind: NostrEventKind.Metadata,
    tags: [],
    sig: "",
    created_at: createdAt ?? Math.floor(Date.now() / 1000),
    content: JSON.stringify(content),
  };
}

describe("useNostrProfile / useCachedNostrProfile", () => {
  beforeEach(() => {
    defaultKind0Cache.clear();
    localStorage.clear();
  });
  afterEach(() => {
    defaultKind0Cache.clear();
    localStorage.clear();
  });

  it("returns null for unknown pubkeys", () => {
    let observed: unknown;
    function Probe() {
      const { profile } = useNostrProfile(pubkeyA);
      observed = profile;
      return null;
    }
    render(<Probe />);
    expect(observed).toBeNull();
  });

  it("re-renders when a real kind 0 event is ingested into the cache", () => {
    let observed: ReturnType<typeof useCachedNostrProfile> = null;
    function Probe() {
      observed = useCachedNostrProfile(pubkeyA);
      return null;
    }
    render(<Probe />);
    expect(observed).toBeNull();

    act(() => {
      defaultKind0Cache.save([kind0(pubkeyA, {
        name: "alice",
        display_name: "Alice",
        picture: "https://example.com/alice.png",
      })], "wss://demo.test");
    });

    expect(observed).toMatchObject({
      pubkey: pubkeyA,
      name: "alice",
      displayName: "Alice",
      picture: "https://example.com/alice.png",
    });
  });

  it("useNostrProfiles returns a map keyed by pubkey", () => {
    defaultKind0Cache.save([
      kind0(pubkeyA, { name: "alice", picture: "a.png" }),
      kind0(pubkeyB, { name: "bob" }),
    ], "wss://demo.test");

    let observed: Record<string, unknown> = {};
    function Probe() {
      const { profiles } = useNostrProfiles([pubkeyA, pubkeyB]);
      observed = profiles;
      return null;
    }
    render(<Probe />);

    expect(observed[pubkeyA]).toMatchObject({ name: "alice", picture: "a.png" });
    expect(observed[pubkeyB]).toMatchObject({ name: "bob" });
  });

  it("accepts both camelCase displayName and snake_case display_name", () => {
    defaultKind0Cache.save([kind0(pubkeyA, { name: "snake", display_name: "Snake Case" })], "wss://demo.test");

    let observed: ReturnType<typeof useCachedNostrProfile> = null;
    function Probe() {
      observed = useCachedNostrProfile(pubkeyA);
      return null;
    }
    render(<Probe />);
    expect(observed).toMatchObject({ displayName: "Snake Case" });
  });

  it("does not enter a rerender loop when pubkey is null", async () => {
    let renderCount = 0;
    function Probe() {
      renderCount += 1;
      useNostrProfile(null);
      return null;
    }
    const view = render(<Probe />);
    try {
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(renderCount).toBeLessThan(10);
    } finally {
      view.unmount();
    }
  });
});
