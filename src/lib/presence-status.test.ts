import { describe, expect, it } from "vitest";
import {
  buildActivePresenceTags,
  buildOfflinePresenceTags,
  deriveLatestActivePresenceByAuthor,
  deriveLatestPresenceByAuthor,
} from "./presence-status";
import { NostrEventKind } from "./nostr/types";

const authorA = "a".repeat(64);
const taskId = "t".repeat(64);

describe("deriveLatestActivePresenceByAuthor", () => {
  it("drops active presence when a newer offline state exists", () => {
    const events = [
      {
        kind: NostrEventKind.UserStatus,
        pubkey: authorA,
        created_at: 1_699_999_900,
        tags: buildActivePresenceTags("feed", null),
      },
      {
        kind: NostrEventKind.UserStatus,
        pubkey: authorA,
        created_at: 1_699_999_950,
        tags: buildOfflinePresenceTags(),
      },
    ];

    const active = deriveLatestActivePresenceByAuthor(events);
    expect(active.has(authorA)).toBe(false);
  });

  it("keeps latest active presence when it is newer than offline", () => {
    const events = [
      {
        kind: NostrEventKind.UserStatus,
        pubkey: authorA,
        created_at: 1_699_999_950,
        tags: buildOfflinePresenceTags(),
      },
      {
        kind: NostrEventKind.UserStatus,
        pubkey: authorA,
        created_at: 1_699_999_980,
        tags: buildActivePresenceTags("feed", null),
      },
    ];

    const active = deriveLatestActivePresenceByAuthor(events);
    expect(active.get(authorA)).toBe(1_699_999_980 * 1000);
  });
});

describe("deriveLatestPresenceByAuthor", () => {
  it("retains the latest active presence details from tags", () => {
    const events = [
      {
        kind: NostrEventKind.UserStatus,
        pubkey: authorA,
        created_at: 1_699_999_980,
        tags: buildActivePresenceTags("feed", taskId),
      },
    ];

    const latest = deriveLatestPresenceByAuthor(events);

    expect(latest.get(authorA)).toEqual({
      reportedAtMs: 1_699_999_980 * 1000,
      state: "active",
      view: "feed",
      taskId,
    });
  });

  it("keeps a newer offline state and clears active details", () => {
    const events = [
      {
        kind: NostrEventKind.UserStatus,
        pubkey: authorA,
        created_at: 1_699_999_900,
        tags: buildActivePresenceTags("feed", taskId),
      },
      {
        kind: NostrEventKind.UserStatus,
        pubkey: authorA,
        created_at: 1_699_999_950,
        tags: buildOfflinePresenceTags(),
      },
    ];

    const latest = deriveLatestPresenceByAuthor(events);

    expect(latest.get(authorA)).toEqual({
      reportedAtMs: 1_699_999_950 * 1000,
      state: "offline",
      view: undefined,
      taskId: undefined,
    });
  });
});

describe("buildActivePresenceTags", () => {
  it("omits the e tag when there is no focused task", () => {
    expect(buildActivePresenceTags("feed", null)).toEqual([
      ["d", "nodex-presence"],
      ["nodex-view", "feed"],
    ]);
  });

  it("references the focused task via an e tag", () => {
    expect(buildActivePresenceTags("feed", taskId)).toEqual([
      ["d", "nodex-presence"],
      ["nodex-view", "feed"],
      ["e", taskId],
    ]);
  });
});
