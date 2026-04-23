import { describe, expect, it } from "vitest";
import { NostrEventKind } from "@/lib/nostr/types";
import {
  extractTaskStateTargetId,
  isTaskStateEventKind,
  mapTaskStateEventToTaskStatus,
  mapTaskStatusToStateEvent,
} from "./task-state-events";

describe("task-state-events", () => {
  it("maps active to Open kind with description", () => {
    const mapped = mapTaskStatusToStateEvent("active");
    expect(mapped.kind).toBe(NostrEventKind.GitStatusOpen);
    expect(mapped.content).toBe("In Progress");
  });

  it("maps done to Applied kind", () => {
    const mapped = mapTaskStatusToStateEvent("done");
    expect(mapped.kind).toBe(NostrEventKind.GitStatusApplied);
    expect(mapped.content).toBe("");
  });

  it("maps closed to Closed kind", () => {
    const mapped = mapTaskStatusToStateEvent("closed");
    expect(mapped.kind).toBe(NostrEventKind.GitStatusClosed);
    expect(mapped.content).toBe("");
  });

  it("extracts property target from e tags", () => {
    const target = extractTaskStateTargetId([
      ["e", "task-parent", "", "parent"],
      ["e", "task-prop", "", "property"],
    ]);
    expect(target).toBe("task-prop");
  });

  it("maps Open without description to open", () => {
    const mapped = mapTaskStateEventToTaskStatus(
      NostrEventKind.GitStatusOpen,
      ""
    );
    expect(mapped.status).toBe("open");
    expect(mapped.statusDescription).toBeUndefined();
  });

  it("maps Open with description to active", () => {
    const mapped = mapTaskStateEventToTaskStatus(
      NostrEventKind.GitStatusOpen,
      "Working on this now"
    );
    expect(mapped.status).toBe("active");
    expect(mapped.statusDescription).toBe("Working on this now");
  });

  it("maps Closed kind to closed", () => {
    const mapped = mapTaskStateEventToTaskStatus(
      NostrEventKind.GitStatusClosed,
      ""
    );
    expect(mapped.status).toBe("closed");
    expect(mapped.statusDescription).toBeUndefined();
  });

  it("classifies only task-state kinds as state events", () => {
    expect(isTaskStateEventKind(NostrEventKind.GitStatusOpen)).toBe(true);
    expect(isTaskStateEventKind(NostrEventKind.Task)).toBe(false);
  });
});
