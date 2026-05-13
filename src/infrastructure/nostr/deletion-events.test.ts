import { describe, expect, it } from "vitest";
import { NostrEventKind } from "@/lib/nostr/types";
import {
  DELETION_EVENT_KIND,
  buildDeletionTags,
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
});
