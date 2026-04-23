import { describe, expect, it } from "vitest";
import { getTaskStatusType, type Task } from "@/types";
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

  it("preserves relay state update messages when local and relay copies collide", () => {
    const existing = {
      id: "task-1",
      timestamp: new Date("2026-02-17T10:00:00.000Z"),
      lastEditedAt: new Date("2026-02-17T10:01:00.000Z"),
      relays: ["relay-a"],
      status: { type: "open" },
      stateUpdates: [
        {
          id: "local-state-1",
          status: { type: "active" },
          timestamp: new Date("2026-02-17T10:01:00.000Z"),
          authorPubkey: "local-author",
        },
      ],
    } as Task;
    const incoming = {
      id: "task-1",
      timestamp: new Date("2026-02-17T10:00:00.000Z"),
      relays: ["relay-b"],
      status: { type: "done" },
      stateUpdates: [
        {
          id: "relay-state-1",
          status: { type: "done" },
          timestamp: new Date("2026-02-17T10:02:00.000Z"),
          authorPubkey: "relay-author",
        },
      ],
      lastEditedAt: new Date("2026-02-17T10:02:00.000Z"),
    } as Task;

    const merged = mergeTasks([existing], [incoming]);

    expect(merged).toHaveLength(1);
    expect(getTaskStatusType(merged[0]?.status)).toBe("done");
    expect(merged[0]?.stateUpdates?.map((update) => update.id)).toEqual([
      "relay-state-1",
      "local-state-1",
    ]);
    expect(merged[0]?.lastEditedAt?.toISOString()).toBe("2026-02-17T10:02:00.000Z");
    expect(merged[0]?.relays).toEqual(["relay-a", "relay-b"]);
  });
});
