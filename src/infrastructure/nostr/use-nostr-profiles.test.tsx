import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  seedNostrProfile,
  useCachedNostrProfile,
  useNostrProfile,
  useNostrProfiles,
} from "./use-nostr-profiles";
import { defaultKind0Cache } from "./people-from-kind0";

const pubkeyA = "a".repeat(64);
const pubkeyB = "b".repeat(64);

describe("useNostrProfile / useCachedNostrProfile", () => {
  beforeEach(() => {
    defaultKind0Cache.clear();
    localStorage.clear();
  });
  afterEach(() => {
    defaultKind0Cache.clear();
    localStorage.clear();
  });

  it("returns null for unknown pubkeys without subscribing or fetching", () => {
    let observed: unknown;
    function Probe() {
      const { profile } = useNostrProfile(pubkeyA);
      observed = profile;
      return null;
    }
    render(<Probe />);
    expect(observed).toBeNull();
  });

  it("re-renders when a kind 0 event is ingested via seedNostrProfile", () => {
    let observed: ReturnType<typeof useCachedNostrProfile> = null;
    function Probe() {
      observed = useCachedNostrProfile(pubkeyA);
      return null;
    }
    render(<Probe />);
    expect(observed).toBeNull();

    act(() => {
      seedNostrProfile({
        pubkey: pubkeyA,
        name: "alice",
        displayName: "Alice",
        picture: "https://example.com/alice.png",
      });
    });

    expect(observed).toMatchObject({
      pubkey: pubkeyA,
      name: "alice",
      displayName: "Alice",
      picture: "https://example.com/alice.png",
    });
  });

  it("useNostrProfiles returns a map keyed by pubkey", () => {
    seedNostrProfile({ pubkey: pubkeyA, name: "alice", picture: "a.png" });
    seedNostrProfile({ pubkey: pubkeyB, name: "bob" });

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
    defaultKind0Cache.save([
      {
        id: "",
        pubkey: pubkeyA,
        kind: 0,
        tags: [],
        sig: "",
        created_at: Math.floor(Date.now() / 1000),
        content: JSON.stringify({ name: "snake", display_name: "Snake Case" }),
      },
    ]);

    let observed: ReturnType<typeof useCachedNostrProfile> = null;
    function Probe() {
      observed = useCachedNostrProfile(pubkeyA);
      return null;
    }
    render(<Probe />);
    expect(observed?.displayName).toBe("Snake Case");
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
