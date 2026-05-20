import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  noteSeenPubkey,
  getSeenPubkeys,
  getSeenPubkeysVersion,
  subscribeToSeenPubkeys,
  __resetSeenPubkeysForTests,
} from "./seen-pubkeys-store";

describe("seen-pubkeys-store", () => {
  beforeEach(() => {
    __resetSeenPubkeysForTests();
  });

  it("collects normalized pubkeys", () => {
    noteSeenPubkey("  AbC  ");
    noteSeenPubkey("abc");
    noteSeenPubkey("def");
    expect(getSeenPubkeys().sort()).toEqual(["abc", "def"]);
  });

  it("ignores empty and undefined input", () => {
    noteSeenPubkey(undefined);
    noteSeenPubkey("");
    noteSeenPubkey("   ");
    expect(getSeenPubkeys()).toEqual([]);
    expect(getSeenPubkeysVersion()).toBe(0);
  });

  it("notifies subscribers only when a new pubkey is added", () => {
    const callback = vi.fn();
    const unsubscribe = subscribeToSeenPubkeys(callback);

    noteSeenPubkey("abc");
    expect(callback).toHaveBeenCalledTimes(1);

    noteSeenPubkey("abc");
    expect(callback).toHaveBeenCalledTimes(1);

    noteSeenPubkey("def");
    expect(callback).toHaveBeenCalledTimes(2);

    unsubscribe();
  });

  it("returns referentially stable arrays between mutations", () => {
    noteSeenPubkey("a");
    const first = getSeenPubkeys();
    const second = getSeenPubkeys();
    expect(first).toBe(second);

    noteSeenPubkey("b");
    expect(getSeenPubkeys()).not.toBe(first);
  });
});
