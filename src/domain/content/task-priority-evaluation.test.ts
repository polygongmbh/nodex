import { describe, expect, it } from "vitest";
import { makeTask } from "@/test/fixtures";
import {
  buildChildrenMap,
  calculateFrecency,
  calculateLocalUrgency,
  calculateProgress,
  DEFAULT_PRIORITY_PARAMS,
  evaluateTaskPriorities,
  geometricMean,
  selfSum,
} from "./task-priority-evaluation";

const NOW = new Date("2026-04-27T12:00:00.000Z").getTime();
const ONE_DAY = 24 * 60 * 60 * 1000;

describe("calculateLocalUrgency", () => {
  it("returns the no-due baseline when the task has no due date", () => {
    const task = makeTask();
    expect(calculateLocalUrgency(task, NOW)).toBe(DEFAULT_PRIORITY_PARAMS.noDueBaseline);
  });

  it("returns 1 for a task due today", () => {
    const task = makeTask({ dueDate: new Date(NOW) });
    expect(calculateLocalUrgency(task, NOW)).toBeCloseTo(1, 5);
  });

  it("decays for tasks due in the future", () => {
    const inSeven = makeTask({ dueDate: new Date(NOW + 7 * ONE_DAY) });
    const inOne = makeTask({ dueDate: new Date(NOW + ONE_DAY) });
    const futureSeven = calculateLocalUrgency(inSeven, NOW);
    const futureOne = calculateLocalUrgency(inOne, NOW);
    expect(futureSeven).toBeLessThan(futureOne);
    expect(futureSeven).toBeLessThan(1);
  });

  it("rises with overdue magnitude using the overdue multiplier", () => {
    const oneDayLate = makeTask({ dueDate: new Date(NOW - ONE_DAY) });
    const fourDaysLate = makeTask({ dueDate: new Date(NOW - 4 * ONE_DAY) });
    expect(calculateLocalUrgency(oneDayLate, NOW)).toBeCloseTo(1.25, 5);
    expect(calculateLocalUrgency(fourDaysLate, NOW)).toBeCloseTo(2, 5);
  });

  it("caps overdue urgency at maxUrgency", () => {
    const ancient = makeTask({ dueDate: new Date(NOW - 1000 * ONE_DAY) });
    expect(calculateLocalUrgency(ancient, NOW)).toBe(DEFAULT_PRIORITY_PARAMS.maxUrgency);
  });
});

describe("calculateProgress", () => {
  it("treats a leaf with terminal status as fully done", () => {
    const leaf = makeTask({ id: "a", status: { type: "done" } });
    const map = buildChildrenMap([leaf]);
    expect(calculateProgress(leaf, map)).toBe(1);
  });

  it("returns 0 for an open leaf", () => {
    const leaf = makeTask({ id: "a", status: { type: "open" } });
    const map = buildChildrenMap([leaf]);
    expect(calculateProgress(leaf, map)).toBe(0);
  });

  it("averages over subtask completion, ignoring comments and closed tasks", () => {
    const parent = makeTask({ id: "p" });
    const doneChild = makeTask({ id: "c1", parentId: "p", status: { type: "done" } });
    const openChild = makeTask({ id: "c2", parentId: "p", status: { type: "open" } });
    const comment = makeTask({ id: "c3", parentId: "p", taskType: "comment" });
    const closedChild = makeTask({ id: "c4", parentId: "p", status: { type: "closed" } });
    const map = buildChildrenMap([parent, doneChild, openChild, comment, closedChild]);
    expect(calculateProgress(parent, map)).toBe(0.5);
  });

  it("recurses into nested subtasks", () => {
    const root = makeTask({ id: "root" });
    const mid = makeTask({ id: "mid", parentId: "root" });
    const leaf1 = makeTask({ id: "l1", parentId: "mid", status: { type: "done" } });
    const leaf2 = makeTask({ id: "l2", parentId: "mid", status: { type: "open" } });
    const map = buildChildrenMap([root, mid, leaf1, leaf2]);
    expect(calculateProgress(root, map)).toBe(0.5);
  });
});

describe("calculateFrecency", () => {
  it("returns the neutral boost of 1 when there are no touches", () => {
    const task = makeTask();
    const map = buildChildrenMap([task]);
    expect(calculateFrecency(task, map, NOW)).toBe(1);
  });

  it("counts comment children as touches", () => {
    const task = makeTask({ id: "p" });
    const comment = makeTask({
      id: "c",
      parentId: "p",
      taskType: "comment",
      timestamp: new Date(NOW - 60 * 1000),
    });
    const map = buildChildrenMap([task, comment]);
    expect(calculateFrecency(task, map, NOW)).toBeGreaterThan(1);
  });

  it("counts state updates as touches", () => {
    const task = makeTask({
      id: "p",
      stateUpdates: [
        {
          id: "u1",
          status: { type: "active" },
          timestamp: new Date(NOW - 5 * 60 * 1000),
          authorPubkey: "x",
        },
      ],
    });
    const map = buildChildrenMap([task]);
    expect(calculateFrecency(task, map, NOW)).toBeGreaterThan(1);
  });

  it("decays older touches relative to newer ones", () => {
    const recentTask = makeTask({
      id: "r",
      stateUpdates: [
        { id: "u", status: { type: "active" }, timestamp: new Date(NOW - 60 * 1000), authorPubkey: "x" },
      ],
    });
    const oldTask = makeTask({
      id: "o",
      stateUpdates: [
        {
          id: "u",
          status: { type: "active" },
          timestamp: new Date(NOW - 30 * ONE_DAY),
          authorPubkey: "x",
        },
      ],
    });
    const recentMap = buildChildrenMap([recentTask]);
    const oldMap = buildChildrenMap([oldTask]);
    expect(calculateFrecency(recentTask, recentMap, NOW)).toBeGreaterThan(
      calculateFrecency(oldTask, oldMap, NOW),
    );
  });
});

describe("geometricMean", () => {
  it("returns 1 for an empty input", () => {
    expect(geometricMean([])).toBe(1);
  });

  it("computes the geometric mean", () => {
    expect(geometricMean([0.6, 0.3, 0.9])).toBeCloseTo(Math.cbrt(0.6 * 0.3 * 0.9), 5);
  });
});

describe("selfSum", () => {
  it("ignores influences below the self value", () => {
    expect(selfSum(2, [1, 0.5], 3)).toBe(2);
  });

  it("adds dampened deltas from influences above self", () => {
    expect(selfSum(1, [4, 1.5], 3)).toBeCloseTo(1 + (3 / 3) + (0.5 / 3), 5);
  });
});

describe("evaluateTaskPriorities", () => {
  it("excludes terminal and comment tasks from the result", () => {
    const open = makeTask({ id: "open" });
    const done = makeTask({ id: "done", status: { type: "done" } });
    const closed = makeTask({ id: "closed", status: { type: "closed" } });
    const comment = makeTask({ id: "comment", parentId: "open", taskType: "comment" });
    const result = evaluateTaskPriorities([open, done, closed, comment], NOW);
    expect(result.has("open")).toBe(true);
    expect(result.has("done")).toBe(false);
    expect(result.has("closed")).toBe(false);
    expect(result.has("comment")).toBe(false);
  });

  it("ranks an overdue task above one due in two weeks", () => {
    const overdue = makeTask({ id: "overdue", dueDate: new Date(NOW - 2 * ONE_DAY) });
    const future = makeTask({ id: "future", dueDate: new Date(NOW + 14 * ONE_DAY) });
    const result = evaluateTaskPriorities([overdue, future], NOW);
    expect(result.get("overdue")!.priority).toBeGreaterThan(result.get("future")!.priority);
  });

  it("raises a parent's urgency when a child is more urgent", () => {
    const child = makeTask({ id: "c", parentId: "p", dueDate: new Date(NOW - ONE_DAY) });
    const parentBaseline = makeTask({ id: "p" });
    const result = evaluateTaskPriorities([parentBaseline, child], NOW);
    const parentUrgency = result.get("p")!.urgency;
    const standalone = evaluateTaskPriorities([parentBaseline], NOW);
    expect(parentUrgency).toBeGreaterThan(standalone.get("p")!.urgency);
  });

  it("propagates parent importance into a child via the geometric mean", () => {
    const parent = makeTask({ id: "p", priority: 100 }); // importance ~ 2
    const child = makeTask({ id: "c", parentId: "p" }); // importance default 1
    const result = evaluateTaskPriorities([parent, child], NOW);
    const childImportance = result.get("c")!.importance;
    expect(childImportance).toBeGreaterThan(1);
    expect(childImportance).toBeLessThan(2);
  });

  it("gives an unimportant task with high frecency a higher priority than an idle one", () => {
    const idle = makeTask({ id: "idle" });
    const active = makeTask({
      id: "active",
      stateUpdates: Array.from({ length: 5 }, (_, i) => ({
        id: `u${i}`,
        status: { type: "active" as const },
        timestamp: new Date(NOW - (i + 1) * 60 * 1000),
        authorPubkey: "x",
      })),
    });
    const result = evaluateTaskPriorities([idle, active], NOW);
    expect(result.get("active")!.priority).toBeGreaterThan(result.get("idle")!.priority);
  });
});
