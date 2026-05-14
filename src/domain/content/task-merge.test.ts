import { describe, expect, it } from "vitest";
import { getTaskStateUpdates, getTaskStatusFromTask, type Task } from "@/types";
import { mergeTasks } from "./task-merge";

describe("mergeTasks", () => {
  it("keeps the newer copy of a task when ids collide", () => {
    const older = {
      id: "task-1",
      timestamp: new Date("2026-02-17T10:00:00.000Z"),
      relays: ["relay-a"],
    } as Task;
    const newer = {
      id: "task-1",
      timestamp: new Date("2026-02-17T11:00:00.000Z"),
      relays: ["relay-b"],
    } as Task;

    const merged = mergeTasks([older], [newer]);

    expect(merged).toHaveLength(1);
    expect(merged[0].timestamp.toISOString()).toBe("2026-02-17T11:00:00.000Z");
    expect(merged[0].relays).toEqual(["relay-a", "relay-b"]);
  });

  it("returns tasks sorted newest first", () => {
    const older = {
      id: "older",
      timestamp: new Date("2026-02-17T10:00:00.000Z"),
      relays: [],
    } as unknown as Task;
    const newer = {
      id: "newer",
      timestamp: new Date("2026-02-17T11:00:00.000Z"),
      relays: [],
    } as unknown as Task;

    const merged = mergeTasks([older], [newer]);

    expect(merged.map((task) => task.id)).toEqual(["newer", "older"]);
  });

  it("reuses the existing reference when the merge yields equivalent values", () => {
    const existing = {
      id: "task-1",
      author: { pubkey: "alice" },
      content: "Hello",
      tags: ["work"],
      taskType: "task",
      timestamp: new Date("2026-02-17T10:00:00.000Z"),
      lastEditedAt: new Date("2026-02-17T10:00:00.000Z"),
      relays: ["relay-a"],
    } as unknown as Task;
    const incoming = {
      id: "task-1",
      author: { pubkey: "alice" },
      content: "Hello",
      tags: ["work"],
      taskType: "task",
      timestamp: new Date("2026-02-17T10:00:00.000Z"),
      relays: ["relay-a"],
    } as unknown as Task;

    const merged = mergeTasks([existing], [incoming]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toBe(existing);
  });

  it("preserves relay state update messages when local and relay copies collide", () => {
    const existing = {
      id: "task-1",
      kind: 1621,
      author: { pubkey: "alice", name: "alice", displayName: "alice" },
      content: "",
      tags: [],
      timestamp: new Date("2026-02-17T10:00:00.000Z"),
      lastEditedAt: new Date("2026-02-17T10:01:00.000Z"),
      relays: ["relay-a"],
      dates: [],
      assigneePubkeys: [],
      stateUpdates: [
        {
          id: "local-state-1",
          state: { status: "active" },
          timestamp: new Date("2026-02-17T10:01:00.000Z"),
          authorPubkey: "local-author",
        },
      ],
    } as unknown as Task;
    const incoming = {
      id: "task-1",
      kind: 1621,
      author: { pubkey: "alice", name: "alice", displayName: "alice" },
      content: "",
      tags: [],
      timestamp: new Date("2026-02-17T10:00:00.000Z"),
      relays: ["relay-b"],
      dates: [],
      assigneePubkeys: [],
      stateUpdates: [
        {
          id: "relay-state-1",
          state: { status: "done" },
          timestamp: new Date("2026-02-17T10:02:00.000Z"),
          authorPubkey: "relay-author",
        },
      ],
      lastEditedAt: new Date("2026-02-17T10:02:00.000Z"),
    } as unknown as Task;

    const merged = mergeTasks([existing], [incoming]);

    expect(merged).toHaveLength(1);
    expect(getTaskStatusFromTask(merged[0])).toBe("done");
    expect(getTaskStateUpdates(merged[0]).map((update) => update.id)).toEqual([
      "relay-state-1",
      "local-state-1",
    ]);
    expect(merged[0]?.lastEditedAt?.toISOString()).toBe("2026-02-17T10:02:00.000Z");
    expect(merged[0]?.relays).toEqual(["relay-a", "relay-b"]);
  });
});
