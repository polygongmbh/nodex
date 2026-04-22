import { describe, expect, it } from "vitest";
import { isTaskLockedUntilStart } from "./task-dates";
import { makeTask } from "@/test/fixtures";

describe("task-dates", () => {
  it("locks tasks with future start date", () => {
    const now = new Date("2026-02-17T12:00:00.000Z");
    const futureStartTask = makeTask({
      dateType: "start",
      dueDate: new Date("2026-02-18T12:00:00.000Z"),
    });
    const pastStartTask = makeTask({
      dateType: "start",
      dueDate: new Date("2026-02-16T12:00:00.000Z"),
    });

    expect(isTaskLockedUntilStart(futureStartTask, now)).toBe(true);
    expect(isTaskLockedUntilStart(pastStartTask, now)).toBe(false);
  });
});
