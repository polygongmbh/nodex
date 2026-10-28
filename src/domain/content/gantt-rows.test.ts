import { describe, expect, it } from "vitest";
import { makeTask } from "@/test/fixtures";
import { buildGanttRows, getGanttRange, getTaskGanttSpan } from "./gantt-rows";

const day = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

describe("getTaskGanttSpan", () => {
  it("spans start to end", () => {
    const task = makeTask({ dates: [{ date: "2026-03-01", type: "start" }, { date: "2026-03-05", type: "end" }] });
    expect(getTaskGanttSpan(task)).toEqual({ start: day("2026-03-01"), end: day("2026-03-05") });
  });

  it("falls back to scheduled and due", () => {
    const task = makeTask({ dates: [{ date: "2026-03-10", type: "due" }, { date: "2026-03-02", type: "scheduled" }] });
    expect(getTaskGanttSpan(task)).toEqual({ start: day("2026-03-02"), end: day("2026-03-10") });
  });

  it("makes a single-day bar from a lone date and none from milestones", () => {
    expect(getTaskGanttSpan(makeTask({ dates: [{ date: "2026-03-04", type: "due" }] }))).toEqual({
      start: day("2026-03-04"),
      end: day("2026-03-04"),
    });
    expect(getTaskGanttSpan(makeTask({ dates: [{ date: "2026-03-04", type: "milestone" }] }))).toBeNull();
  });
});

describe("buildGanttRows", () => {
  it("orders tasks as a tree and derives the span of undated parents", () => {
    const parent = makeTask({ id: "p", content: "Project" });
    const late = makeTask({ id: "b", parentId: "p", content: "Late", dates: [{ date: "2026-03-09", type: "due" }] });
    const early = makeTask({ id: "a", parentId: "p", content: "Early", dates: [{ date: "2026-03-02", type: "start" }] });
    const undated = makeTask({ id: "x", content: "Undated" });

    const rows = buildGanttRows([late, undated, parent, early]);

    expect(rows.map((row) => [row.task.content, row.depth])).toEqual([
      ["Project", 0],
      ["Early", 1],
      ["Late", 1],
    ]);
    expect(rows[0]).toMatchObject({ derived: true, span: { start: day("2026-03-02"), end: day("2026-03-09") } });
  });

  it("treats tasks whose parent is outside the set as roots", () => {
    const child = makeTask({ id: "c", parentId: "missing", dates: [{ date: "2026-03-02", type: "due" }] });
    expect(buildGanttRows([child])).toMatchObject([{ depth: 0 }]);
  });
});

describe("getGanttRange", () => {
  it("covers all rows and today with padding", () => {
    const rows = buildGanttRows([makeTask({ dates: [{ date: "2026-03-20", type: "due" }] })]);
    expect(getGanttRange(rows, day("2026-03-01"), 2)).toEqual({ start: day("2026-02-27"), end: day("2026-03-22") });
  });
});
