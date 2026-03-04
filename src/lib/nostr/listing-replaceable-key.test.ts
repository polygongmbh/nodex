import { describe, expect, it } from "vitest";
import { getListingReplaceableKey } from "./listing-replaceable-key";
import { NostrEventKind } from "./types";

describe("getListingReplaceableKey", () => {
  it("uses NIP-99 identifier when available", () => {
    const key = getListingReplaceableKey(
      {
        id: "event-id-1",
        feedMessageType: "offer",
        author: { id: "A".repeat(64) },
        nip99: { identifier: "listing-123" },
      },
      NostrEventKind.ClassifiedListing
    );
    expect(key).toBe(`${NostrEventKind.ClassifiedListing}:${"a".repeat(64)}:listing-123`);
  });

  it("falls back to event id when identifier is missing", () => {
    const key = getListingReplaceableKey(
      {
        id: "legacy-event-id",
        feedMessageType: "request",
        author: { id: "b".repeat(64) },
        nip99: {},
      },
      NostrEventKind.ClassifiedListing
    );
    expect(key).toBe(`${NostrEventKind.ClassifiedListing}:${"b".repeat(64)}:legacy-event-id`);
  });

  it("returns null for non-listing tasks", () => {
    const key = getListingReplaceableKey(
      {
        id: "event-id-2",
        feedMessageType: undefined,
        author: { id: "c".repeat(64) },
        nip99: { identifier: "listing-456" },
      },
      NostrEventKind.ClassifiedListing
    );
    expect(key).toBeNull();
  });
});
