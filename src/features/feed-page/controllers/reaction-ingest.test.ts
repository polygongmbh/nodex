import { describe, expect, it, beforeEach } from "vitest";
import { NostrEventKind, type NostrEventWithRelay } from "@/lib/nostr/types";
import { handleReactionEvent } from "./reaction-ingest";
import {
  __resetReactionsRegistryForTests,
  getReactionsForTarget,
} from "@/features/feed-page/stores/reactions-registry";

function event(
  partial: Pick<NostrEventWithRelay, "id" | "pubkey" | "content" | "tags" | "kind">,
): NostrEventWithRelay {
  return { created_at: 0, sig: "", relayUrls: ["wss://relay.test"], ...partial };
}

beforeEach(() => {
  __resetReactionsRegistryForTests();
});

describe("handleReactionEvent", () => {
  it("folds a reaction into the registry", () => {
    handleReactionEvent(
      event({
        id: "r1",
        pubkey: "alice",
        content: "👍",
        tags: [["e", "task-a"]],
        kind: NostrEventKind.Reaction,
      }),
    );
    expect(getReactionsForTarget("task-a")?.totals["👍"]).toBe(1);
  });

  it("removes a reaction when its author's NIP-09 deletion arrives", () => {
    handleReactionEvent(
      event({
        id: "r1",
        pubkey: "alice",
        content: "👍",
        tags: [["e", "task-a"]],
        kind: NostrEventKind.Reaction,
      }),
    );
    handleReactionEvent(
      event({
        id: "d1",
        pubkey: "alice",
        content: "",
        tags: [["e", "r1"]],
        kind: NostrEventKind.EventDeletion,
      }),
    );
    expect(getReactionsForTarget("task-a")).toBeUndefined();
  });
});
