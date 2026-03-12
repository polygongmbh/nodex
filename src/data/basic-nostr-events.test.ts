import { describe, expect, it } from "vitest";
import { verifyEvent } from "nostr-tools/pure";
import { basicNostrEvents } from "./basic-nostr-events";

describe("basicNostrEvents", () => {
  it("contains valid signed nostr events", () => {
    for (const event of basicNostrEvents) {
      expect(verifyEvent(event)).toBe(true);
    }
  });
});
