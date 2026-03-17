import { describe, expect, it } from "vitest";
import type { Task } from "@/types";
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
    } as Task;
    const newer = {
      id: "newer",
      timestamp: new Date("2026-02-17T11:00:00.000Z"),
      relays: [],
    } as Task;

    const merged = mergeTasks([older], [newer]);

    expect(merged.map((task) => task.id)).toEqual(["newer", "older"]);
  });
});
