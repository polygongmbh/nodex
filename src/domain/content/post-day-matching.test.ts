import { describe, expect, it } from "vitest";
import {
  collectEventDayKeys,
  formatDayKey,
  getPostDateDayKeys,
  postHasDateOnDay,
  postOccursOnDay,
} from "./post-day-matching";
import { makeComment, makeTask } from "@/test/fixtures";

describe("getPostDateDayKeys", () => {
  it("collects single date entries", () => {
    const task = makeTask({ dueDate: new Date(2026, 5, 10) });
    expect(getPostDateDayKeys(task)).toEqual(new Set(["2026-06-10"]));
  });

  it("expands start–end ranges day by day", () => {
    const task = makeTask({
      dates: [
        { date: "2026-06-10", type: "start" },
        { date: "2026-06-12", type: "end" },
      ],
    });
    expect(getPostDateDayKeys(task)).toEqual(
      new Set(["2026-06-10", "2026-06-11", "2026-06-12"])
    );
  });

  it("is empty for comments", () => {
    expect(getPostDateDayKeys(makeComment()).size).toBe(0);
  });
});

describe("postOccursOnDay / postHasDateOnDay", () => {
  const createdAt = new Date(2026, 5, 1, 14, 30);
  const task = makeTask({ timestamp: createdAt, dueDate: new Date(2026, 5, 10) });

  it("matches the creation day only via postOccursOnDay", () => {
    const creationKey = formatDayKey(createdAt);
    expect(postOccursOnDay(task, creationKey)).toBe(true);
    expect(postHasDateOnDay(task, creationKey)).toBe(false);
  });

  it("matches referenced dates via both", () => {
    expect(postOccursOnDay(task, "2026-06-10")).toBe(true);
    expect(postHasDateOnDay(task, "2026-06-10")).toBe(true);
  });

  it("matches comments by creation day", () => {
    const comment = makeComment({ timestamp: createdAt });
    expect(postOccursOnDay(comment, formatDayKey(createdAt))).toBe(true);
    expect(postOccursOnDay(comment, "2026-06-10")).toBe(false);
  });
});

describe("collectEventDayKeys", () => {
  it("unions referenced-date days, ignoring undated posts", () => {
    const a = makeTask({ id: "a", dueDate: new Date(2026, 5, 10) });
    const b = makeTask({ id: "b", dueDate: new Date(2026, 5, 20) });
    const undated = makeComment({ id: "c" });
    expect(collectEventDayKeys([a, b, undated])).toEqual(
      new Set(["2026-06-10", "2026-06-20"])
    );
  });
});
