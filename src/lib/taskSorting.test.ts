import { describe, expect, it } from "vitest";
import { addDays, startOfDay, subDays } from "date-fns";
import { getDueDateColorClass } from "./taskSorting";

describe("getDueDateColorClass", () => {
  const today = startOfDay(new Date());

  it("uses red for overdue and muted for missing/done", () => {
    expect(getDueDateColorClass(undefined)).toBe("text-muted-foreground");
    expect(getDueDateColorClass(addDays(today, 3), "done")).toBe("text-muted-foreground");
    expect(getDueDateColorClass(subDays(today, 1), "todo")).toBe("text-destructive");
  });

  it("keeps near dates yellow and shifts gradually greener farther away", () => {
    expect(getDueDateColorClass(today, "todo")).toBe("text-warning");
    expect(getDueDateColorClass(addDays(today, 1), "todo")).toBe("text-yellow-500");
    expect(getDueDateColorClass(addDays(today, 2), "todo")).toBe("text-yellow-500");
    expect(getDueDateColorClass(addDays(today, 3), "todo")).toBe("text-lime-500");
    expect(getDueDateColorClass(addDays(today, 5), "todo")).toBe("text-lime-500");
    expect(getDueDateColorClass(addDays(today, 6), "todo")).toBe("text-green-500");
    expect(getDueDateColorClass(addDays(today, 14), "todo")).toBe("text-green-500");
    expect(getDueDateColorClass(addDays(today, 21), "todo")).toBe("text-emerald-500");
  });
});
