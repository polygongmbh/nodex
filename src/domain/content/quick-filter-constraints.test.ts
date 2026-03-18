import { describe, expect, it } from "vitest";
import { makeTask } from "@/test/fixtures";
import {
  clampMinPriority,
  clampRecentDays,
  normalizeQuickFilterState,
  taskMatchesQuickFilters,
} from "@/domain/content/quick-filter-constraints";

describe("quick filter constraints", () => {
  it("normalizes defaults and clamps out-of-range values", () => {
    const normalized = normalizeQuickFilterState({
      recentEnabled: true,
      recentDays: 0,
      priorityEnabled: true,
      minPriority: 150,
    });

    expect(normalized).toEqual({
      recentEnabled: true,
      recentDays: 1,
      priorityEnabled: true,
      minPriority: 100,
    });
  });

  it("applies recent-days and min-priority filters together", () => {
    const nowMs = new Date("2026-03-18T12:00:00.000Z").getTime();
    const quickFilters = {
      recentEnabled: true,
      recentDays: 7,
      priorityEnabled: true,
      minPriority: 50,
    };

    const matching = makeTask({
      id: "matching",
      timestamp: new Date("2026-03-13T12:00:00.000Z"),
      priority: 70,
    });
    const stale = makeTask({
      id: "stale",
      timestamp: new Date("2026-03-01T12:00:00.000Z"),
      priority: 70,
    });
    const lowPriority = makeTask({
      id: "low-priority",
      timestamp: new Date("2026-03-13T12:00:00.000Z"),
      priority: 10,
    });
    const missingPriority = makeTask({
      id: "missing-priority",
      timestamp: new Date("2026-03-13T12:00:00.000Z"),
      priority: undefined,
    });

    expect(taskMatchesQuickFilters(matching, quickFilters, nowMs)).toBe(true);
    expect(taskMatchesQuickFilters(stale, quickFilters, nowMs)).toBe(false);
    expect(taskMatchesQuickFilters(lowPriority, quickFilters, nowMs)).toBe(false);
    expect(taskMatchesQuickFilters(missingPriority, quickFilters, nowMs)).toBe(false);
  });

  it("treats recent state updates as recent activity via lastEditedAt", () => {
    const nowMs = new Date("2026-03-18T12:00:00.000Z").getTime();
    const quickFilters = {
      recentEnabled: true,
      recentDays: 7,
      priorityEnabled: false,
      minPriority: 50,
    };

    const updatedTask = makeTask({
      id: "updated-recently",
      timestamp: new Date("2026-01-01T00:00:00.000Z"),
      lastEditedAt: new Date("2026-03-17T10:00:00.000Z"),
    });

    expect(taskMatchesQuickFilters(updatedTask, quickFilters, nowMs)).toBe(true);
  });

  it("clamps numeric helpers", () => {
    expect(clampRecentDays(500)).toBe(365);
    expect(clampMinPriority(-5)).toBe(0);
  });
});
