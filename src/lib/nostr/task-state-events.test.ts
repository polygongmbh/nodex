import { describe, expect, it } from "vitest";
import { NostrEventKind } from "./types";
import {
  extractTaskStateTargetId,
  isTaskStateEventKind,
  mapTaskStateEventToTaskStatus,
  mapTaskStatusToStateEvent,
} from "./task-state-events";

describe("task-state-events", () => {
  it("maps in-progress to Open kind with description", () => {
    const mapped = mapTaskStatusToStateEvent("in-progress");
    expect(mapped.kind).toBe(NostrEventKind.GitStatusOpen);
    expect(mapped.content).toBe("In Progress");
  });

  it("maps done to Applied kind", () => {
    const mapped = mapTaskStatusToStateEvent("done");
    expect(mapped.kind).toBe(NostrEventKind.GitStatusApplied);
    expect(mapped.content).toBe("");
  });

  it("extracts property target from e tags", () => {
    const target = extractTaskStateTargetId([
      ["e", "task-parent", "", "parent"],
      ["e", "task-prop", "", "property"],
    ]);
    expect(target).toBe("task-prop");
  });

  it("maps Open with description to in-progress", () => {
    const mapped = mapTaskStateEventToTaskStatus(
      NostrEventKind.GitStatusOpen,
      "Working on this now"
    );
    expect(mapped.status).toBe("in-progress");
    expect(mapped.statusDescription).toBe("Working on this now");
  });

  it("classifies only task-state kinds as state events", () => {
    expect(isTaskStateEventKind(NostrEventKind.GitStatusOpen)).toBe(true);
    expect(isTaskStateEventKind(NostrEventKind.Task)).toBe(false);
  });
});
