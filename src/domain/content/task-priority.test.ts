import { describe, expect, it } from "vitest";
import {
  displayPriorityFromStored,
  formatPriorityLabel,
  storedPriorityFromDisplay,
} from "@/domain/content/task-priority";

describe("task priority helpers", () => {
  it("maps stored priorities to display priorities by dividing by 20 and rounding", () => {
    expect(displayPriorityFromStored(20)).toBe(1);
    expect(displayPriorityFromStored(50)).toBe(3);
    expect(displayPriorityFromStored(80)).toBe(4);
    expect(displayPriorityFromStored(100)).toBe(5);
  });

  it("maps display priorities back to canonical stored priorities", () => {
    expect(storedPriorityFromDisplay(1)).toBe(20);
    expect(storedPriorityFromDisplay(4)).toBe(80);
    expect(storedPriorityFromDisplay(5)).toBe(100);
  });

  it("formats in-app labels from stored priorities", () => {
    expect(formatPriorityLabel(80)).toBe("P4");
    expect(formatPriorityLabel(undefined)).toBe("");
  });
});
