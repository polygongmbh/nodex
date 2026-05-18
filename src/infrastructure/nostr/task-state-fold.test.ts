import { describe, expect, it } from "vitest";
import { NostrEventKind } from "@/lib/nostr/types";
import type { Post, TaskPost } from "@/types";
import {
  foldTaskStateEventIntoPost,
  foldTaskStateEventsIntoPost,
  type TaskStateEventLike,
} from "./task-state-fold";

const OWNER = "owner-pk";
const OUTSIDER = "outsider-pk";

function makeTask(overrides: Partial<TaskPost> = {}): TaskPost {
  return {
    id: "task-1",
    kind: NostrEventKind.Task,
    author: { pubkey: OWNER, name: OWNER, displayName: OWNER },
    content: "Do the thing",
    tags: [],
    relays: [],
    timestamp: new Date(1_000_000_000_000),
    stateUpdates: [],
    dates: [],
    assigneePubkeys: [],
    ...overrides,
  };
}

function stateEvent(overrides: Partial<TaskStateEventLike> = {}): TaskStateEventLike {
  return {
    id: "evt-1",
    pubkey: OWNER,
    kind: NostrEventKind.GitStatusApplied,
    content: "",
    tags: [["e", "task-1", "", "property"]],
    created_at: 1_000_500_000,
    ...overrides,
  };
}

describe("foldTaskStateEventIntoPost", () => {
  it("appends a state update and advances lastEditedAt", () => {
    const post = makeTask();
    const folded = foldTaskStateEventIntoPost(post, stateEvent());
    expect(folded).not.toBe(post);
    expect(folded.kind).toBe(NostrEventKind.Task);
    if (folded.kind !== NostrEventKind.Task) return;
    expect(folded.stateUpdates).toHaveLength(1);
    expect(folded.stateUpdates[0].state.status).toBe("done");
    expect(folded.lastEditedAt?.getTime()).toBe(1_000_500_000 * 1000);
  });

  it("returns the input post when the event does not target it", () => {
    const post = makeTask();
    const folded = foldTaskStateEventIntoPost(
      post,
      stateEvent({ tags: [["e", "different-task"]] }),
    );
    expect(folded).toBe(post);
  });

  it("returns the input post when the kind is not a task-state kind", () => {
    const post = makeTask();
    const folded = foldTaskStateEventIntoPost(
      post,
      stateEvent({ kind: NostrEventKind.TextNote }),
    );
    expect(folded).toBe(post);
  });

  it("ignores updates from a pubkey that has no permission on the task", () => {
    const post = makeTask({ assigneePubkeys: ["allowed-pk"] });
    const folded = foldTaskStateEventIntoPost(
      post,
      stateEvent({ pubkey: OUTSIDER }),
    );
    expect(folded).toBe(post);
  });

  it("is idempotent: applying the same event twice is the same as applying it once", () => {
    const post = makeTask();
    const once = foldTaskStateEventIntoPost(post, stateEvent());
    const twice = foldTaskStateEventIntoPost(once, stateEvent());
    expect(twice).toBe(once);
  });

  it("sorts state updates by timestamp descending regardless of arrival order", () => {
    const post = makeTask();
    const earlier = stateEvent({ id: "early", created_at: 1_000_000_001, content: "active" });
    const later = stateEvent({ id: "late", created_at: 1_000_000_500 });
    const sequenced = foldTaskStateEventsIntoPost(post, [later, earlier]);
    if (sequenced.kind !== NostrEventKind.Task) throw new Error("expected task");
    expect(sequenced.stateUpdates.map((entry) => entry.id)).toEqual(["late", "early"]);
  });

  it("incremental fold produces the same final state as bulk fold", () => {
    const post = makeTask();
    const events = [
      stateEvent({ id: "a", created_at: 1_000_000_001, kind: NostrEventKind.GitStatusOpen, content: "active" }),
      stateEvent({ id: "b", created_at: 1_000_000_010 }),
      stateEvent({ id: "c", created_at: 1_000_000_005, kind: NostrEventKind.GitStatusClosed }),
    ];
    const bulk = foldTaskStateEventsIntoPost(post, events);
    let incremental: Post = post;
    for (const event of events) {
      incremental = foldTaskStateEventIntoPost(incremental, event);
    }
    if (bulk.kind !== NostrEventKind.Task || incremental.kind !== NostrEventKind.Task) {
      throw new Error("expected task");
    }
    expect(incremental.stateUpdates).toEqual(bulk.stateUpdates);
    expect(incremental.lastEditedAt?.getTime()).toBe(bulk.lastEditedAt?.getTime());
  });

  it("does not regress lastEditedAt when an older state event arrives after a newer one", () => {
    const post = makeTask();
    const newer = stateEvent({ id: "n", created_at: 1_500_000_000 });
    const older = stateEvent({ id: "o", created_at: 1_200_000_000 });
    const folded = foldTaskStateEventsIntoPost(post, [newer, older]);
    expect(folded.lastEditedAt?.getTime()).toBe(1_500_000_000 * 1000);
  });
});
