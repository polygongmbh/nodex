import { describe, expect, it } from "vitest";
import { NostrEventKind } from "@/lib/nostr/types";
import {
  DELETION_EVENT_KIND,
  buildDeletionTags,
  extractDeletionAddresses,
  extractDeletionTargetIds,
  isDeletionEvent,
} from "./deletion-events";

describe("deletion-events", () => {
  it("identifies deletion event kind", () => {
    expect(isDeletionEvent(DELETION_EVENT_KIND)).toBe(true);
    expect(isDeletionEvent(NostrEventKind.TextNote)).toBe(false);
  });

  it("builds e + k tags for a target event", () => {
    expect(buildDeletionTags({ id: "abc", kind: NostrEventKind.TextNote })).toEqual([
      ["e", "abc"],
      ["k", "1"],
    ]);
  });

  it("extracts every targeted event id", () => {
    expect(
      extractDeletionTargetIds([
        ["e", "id-a"],
        ["p", "irrelevant"],
        ["E", "id-b"],
        ["k", "1"],
      ])
    ).toEqual(["id-a", "id-b"]);
  });

  it("returns an empty list when no e tags are present", () => {
    expect(extractDeletionTargetIds([["k", "1"]])).toEqual([]);
  });

  it("emits an a tag for parameterized-replaceable kinds", () => {
    const pubkey = "a".repeat(64);
    expect(
      buildDeletionTags({
        id: "evt-id",
        kind: NostrEventKind.CalendarTimeBased,
        pubkey,
        dTag: "my-event",
      })
    ).toEqual([
      ["e", "evt-id"],
      ["k", String(NostrEventKind.CalendarTimeBased)],
      ["a", `${NostrEventKind.CalendarTimeBased}:${pubkey}:my-event`],
    ]);
  });

  it("omits the a tag when pubkey or d is missing", () => {
    const tags = buildDeletionTags({
      id: "evt-id",
      kind: NostrEventKind.CalendarDateBased,
      pubkey: "a".repeat(64),
    });
    expect(tags.find((tag) => tag[0] === "a")).toBeUndefined();
  });

  it("does not emit an a tag for non-parameterized-replaceable kinds", () => {
    const tags = buildDeletionTags({
      id: "evt-id",
      kind: NostrEventKind.TextNote,
      pubkey: "a".repeat(64),
      dTag: "irrelevant",
    });
    expect(tags.find((tag) => tag[0] === "a")).toBeUndefined();
  });

  it("extracts a-tag addresses", () => {
    expect(
      extractDeletionAddresses([
        ["e", "evt"],
        ["a", "31923:pub:slug"],
        ["A", "31922:pub:other"],
        ["k", "31923"],
      ])
    ).toEqual(["31923:pub:slug", "31922:pub:other"]);
  });
});
