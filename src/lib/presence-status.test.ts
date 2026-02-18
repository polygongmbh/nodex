import { describe, expect, it } from "vitest";
import { deriveLatestActivePresenceByAuthor } from "./presence-status";
import { NostrEventKind } from "./nostr/types";

const authorA = "a".repeat(64);

describe("deriveLatestActivePresenceByAuthor", () => {
  it("drops active presence when a newer offline state exists", () => {
    const nowUnix = 1_700_000_000;
    const events = [
      {
        kind: NostrEventKind.UserStatus,
        pubkey: authorA,
        created_at: 1_699_999_900,
        tags: [["d", "nodex-presence"], ["expiration", String(nowUnix + 3600)]],
        content: JSON.stringify({ state: "active", view: "feed", taskId: null }),
      },
      {
        kind: NostrEventKind.UserStatus,
        pubkey: authorA,
        created_at: 1_699_999_950,
        tags: [["d", "nodex-presence"], ["expiration", String(nowUnix + 60)]],
        content: JSON.stringify({ state: "offline" }),
      },
    ];

    const active = deriveLatestActivePresenceByAuthor(events, nowUnix);
    expect(active.has(authorA)).toBe(false);
  });

  it("keeps latest active presence when it is newer than offline", () => {
    const nowUnix = 1_700_000_000;
    const events = [
      {
        kind: NostrEventKind.UserStatus,
        pubkey: authorA,
        created_at: 1_699_999_950,
        tags: [["d", "nodex-presence"], ["expiration", String(nowUnix + 60)]],
        content: JSON.stringify({ state: "offline" }),
      },
      {
        kind: NostrEventKind.UserStatus,
        pubkey: authorA,
        created_at: 1_699_999_980,
        tags: [["d", "nodex-presence"], ["expiration", String(nowUnix + 3600)]],
        content: JSON.stringify({ state: "active", view: "feed", taskId: null }),
      },
    ];

    const active = deriveLatestActivePresenceByAuthor(events, nowUnix);
    expect(active.get(authorA)).toBe(1_699_999_980 * 1000);
  });
});
