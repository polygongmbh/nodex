import { describe, expect, it } from "vitest";
import { makeTask } from "@/test/fixtures";
import { planTaskDateShift } from "./task-date-shift";

const day = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const ranged = makeTask({
  dates: [
    { date: "2026-03-02", type: "scheduled" },
    { date: "2026-03-06", type: "due" },
  ],
});

describe("planTaskDateShift", () => {
  it("moves both sides of a range and keeps their types", () => {
    expect(planTaskDateShift(ranged, "move", 3)).toEqual([
      { type: "scheduled", date: day("2026-03-05"), time: undefined },
      { type: "due", date: day("2026-03-09"), time: undefined },
    ]);
  });

  it("keeps the time of day of datetime entries", () => {
    const timed = makeTask({ dates: [{ datetime: new Date(2026, 2, 2, 14, 30), type: "due" }] });
    expect(planTaskDateShift(timed, "move", 1)).toEqual([
      { type: "due", date: new Date(2026, 2, 3, 14, 30), time: "14:30" },
    ]);
  });

  it("moves milestones when the task has no span", () => {
    const task = makeTask({ dates: [{ date: "2026-03-02", type: "milestone" }] });
    expect(planTaskDateShift(task, "move", -1)).toEqual([
      { type: "milestone", date: day("2026-03-01"), time: undefined },
    ]);
  });

  it("resizes one side and clamps it at the other", () => {
    expect(planTaskDateShift(ranged, "resize-end", 2)).toEqual([
      { type: "due", date: day("2026-03-08"), time: undefined },
    ]);
    expect(planTaskDateShift(ranged, "resize-start", 10)).toEqual([
      { type: "scheduled", date: day("2026-03-06"), time: undefined },
    ]);
  });

  it("grows a single-date task into a range from the dragged edge", () => {
    const due = makeTask({ dates: [{ date: "2026-03-06", type: "due" }] });
    expect(planTaskDateShift(due, "resize-start", -2)).toEqual([
      { type: "start", date: day("2026-03-04"), time: undefined },
    ]);
    expect(planTaskDateShift(due, "resize-end", 2)).toEqual([
      { type: "due", date: day("2026-03-08"), time: undefined },
      { type: "start", date: day("2026-03-06"), time: undefined },
    ]);
    expect(planTaskDateShift(due, "resize-end", -2)).toEqual([]);
  });

  it("does nothing for a zero delta", () => {
    expect(planTaskDateShift(ranged, "move", 0)).toEqual([]);
  });
});
