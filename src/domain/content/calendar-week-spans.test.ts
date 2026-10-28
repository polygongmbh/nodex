import { describe, expect, it } from "vitest";
import { countWeekSpanLanes, isMultiDaySpan, layoutWeekSpans } from "./calendar-week-spans";

const day = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const entry = (item: string, start: string, end: string) => ({ item, span: { start: day(start), end: day(end) } });

// Monday 2026-03-02 .. Sunday 2026-03-08
const weekStart = day("2026-03-02");

describe("isMultiDaySpan", () => {
  it("is true only when the span covers more than one day", () => {
    expect(isMultiDaySpan({ start: day("2026-03-02"), end: day("2026-03-02") })).toBe(false);
    expect(isMultiDaySpan({ start: day("2026-03-02"), end: day("2026-03-03") })).toBe(true);
  });
});

describe("layoutWeekSpans", () => {
  it("places a span inside the week with closed ends", () => {
    expect(layoutWeekSpans([entry("a", "2026-03-03", "2026-03-05")], weekStart)).toEqual([
      { item: "a", startCol: 1, endCol: 3, lane: 0, continuesBefore: false, continuesAfter: false },
    ]);
  });

  it("clips spans crossing the week boundaries and flags the continuation", () => {
    const [segment] = layoutWeekSpans([entry("a", "2026-02-27", "2026-03-12")], weekStart);
    expect(segment).toMatchObject({ startCol: 0, endCol: 6, continuesBefore: true, continuesAfter: true });
  });

  it("drops spans outside the week", () => {
    expect(
      layoutWeekSpans([entry("before", "2026-02-20", "2026-03-01"), entry("after", "2026-03-09", "2026-03-10")], weekStart)
    ).toEqual([]);
  });

  it("stacks overlapping spans into lanes and reuses freed lanes", () => {
    const segments = layoutWeekSpans(
      [
        entry("short", "2026-03-02", "2026-03-03"),
        entry("long", "2026-03-02", "2026-03-06"),
        entry("late", "2026-03-04", "2026-03-05"),
      ],
      weekStart
    );
    expect(segments.map((s) => [s.item, s.lane])).toEqual([
      ["long", 0],
      ["short", 1],
      ["late", 1],
    ]);
    expect(countWeekSpanLanes(segments)).toBe(2);
  });
});
