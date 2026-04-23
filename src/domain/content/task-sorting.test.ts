import { describe, expect, it } from "vitest";
import { addDays, startOfDay, subDays } from "date-fns";
import { makeTask } from "@/test/fixtures";
import { buildChildrenMap, getDueDateColorClass, sortTasks } from "./task-sorting";

describe("getDueDateColorClass", () => {
  const today = startOfDay(new Date());

  it("uses red for overdue and muted for missing/done", () => {
    expect(getDueDateColorClass(undefined)).toBe("text-muted-foreground");
    expect(getDueDateColorClass(addDays(today, 3), "done")).toBe("text-muted-foreground");
    expect(getDueDateColorClass(subDays(today, 1), "open")).toBe("text-destructive");
  });

  it("keeps near dates yellow and shifts gradually greener farther away", () => {
    expect(getDueDateColorClass(today, "open")).toBe("text-warning");
    expect(getDueDateColorClass(addDays(today, 1), "open")).toBe("text-due-near");
    expect(getDueDateColorClass(addDays(today, 2), "open")).toBe("text-due-near");
    expect(getDueDateColorClass(addDays(today, 3), "open")).toBe("text-due-mid");
    expect(getDueDateColorClass(addDays(today, 5), "open")).toBe("text-due-mid");
    expect(getDueDateColorClass(addDays(today, 6), "open")).toBe("text-due-far");
    expect(getDueDateColorClass(addDays(today, 14), "open")).toBe("text-due-far");
    expect(getDueDateColorClass(addDays(today, 21), "open")).toBe("text-due-distant");
  });
});

describe("sortTasks", () => {
  const today = startOfDay(new Date());

  it("orders tasks by due-now, progress, priority bands, and priority absence", () => {
    const tasks = [
      makeTask({
        id: "medium-priority",
        priority: 40,
        lastEditedAt: new Date("2026-02-18T10:00:00.000Z"),
      }),
      makeTask({
        id: "active",
        status: "active",
        lastEditedAt: new Date("2026-02-18T12:00:00.000Z"),
      }),
      makeTask({
        id: "upcoming-due",
        dueDate: addDays(today, 3),
        lastEditedAt: new Date("2026-02-18T09:00:00.000Z"),
      }),
      makeTask({
        id: "high-priority",
        priority: 80,
        lastEditedAt: new Date("2026-02-18T11:00:00.000Z"),
      }),
      makeTask({
        id: "low-priority",
        priority: 20,
        lastEditedAt: new Date("2026-02-18T13:00:00.000Z"),
      }),
      makeTask({
        id: "no-priority",
        lastEditedAt: new Date("2026-02-18T14:00:00.000Z"),
      }),
      makeTask({
        id: "due-now",
        dueDate: subDays(today, 1),
        lastEditedAt: new Date("2026-02-18T08:00:00.000Z"),
      }),
      makeTask({
        id: "done-task",
        status: "done",
        dueDate: subDays(today, 2),
        priority: 100,
        lastEditedAt: new Date("2026-02-18T15:00:00.000Z"),
      }),
    ];

    const sorted = sortTasks(tasks, {
      allTasks: tasks,
      childrenMap: buildChildrenMap(tasks),
    });

    expect(sorted.map((task) => task.id)).toEqual([
      "due-now",
      "active",
      "high-priority",
      "upcoming-due",
      "medium-priority",
      "no-priority",
      "low-priority",
      "done-task",
    ]);
  });

  it("uses latest modification time as tie-breaker within same tier", () => {
    const older = makeTask({
      id: "high-old",
      priority: 90,
      lastEditedAt: new Date("2026-02-18T09:00:00.000Z"),
    });
    const newer = makeTask({
      id: "high-new",
      priority: 90,
      lastEditedAt: new Date("2026-02-18T12:00:00.000Z"),
    });

    const tasks = [older, newer];
    const sorted = sortTasks(tasks, {
      allTasks: tasks,
      childrenMap: buildChildrenMap(tasks),
    });

    expect(sorted.map((task) => task.id)).toEqual(["high-new", "high-old"]);
  });
});
