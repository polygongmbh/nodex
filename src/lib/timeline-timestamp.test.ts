import { describe, expect, it } from "vitest";

import { formatTimelineTimestamp } from "./timeline-timestamp";

describe("formatTimelineTimestamp", () => {
  const now = new Date("2026-04-03T12:00:00.000Z");

  it("shows same-day timestamps as locale time", () => {
    const timestamp = new Date("2026-04-03T09:15:00.000Z");
    expect(formatTimelineTimestamp(timestamp, "en", now)).toBe("11:15 AM");
  });

  it("prefixes previous-day timestamps with a localized yesterday label", () => {
    const timestamp = new Date("2026-04-02T18:45:00.000Z");
    expect(formatTimelineTimestamp(timestamp, "en", now)).toBe("yesterday 08:45 PM");
  });

  it("shows entries from two days ago until 10 months ago as localized month-day labels", () => {
    const timestamp = new Date("2026-03-29T09:15:00.000Z");
    expect(formatTimelineTimestamp(timestamp, "en", now)).toBe("Mar 29");
  });

  it("shows entries older than 10 months as locale short dates", () => {
    const timestamp = new Date("2025-05-31T09:15:00.000Z");
    expect(formatTimelineTimestamp(timestamp, "de", now)).toBe("31.05.25");
  });
});
