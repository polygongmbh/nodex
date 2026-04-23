import { describe, it, expect } from "vitest";
import {
  DEFAULT_TASK_STATES,
  parseTaskStateConfig,
  resolveTaskStateDefinition,
  getTaskStateUiType,
  isTaskCompletedState,
  isTaskTerminalState,
  getQuickToggleNextState,
  getNextStateInSequence,
  getStateSortType,
  getVisibleByDefaultStates,
  getProtocolTypeForState,
} from "./task-state-config";

describe("parseTaskStateConfig", () => {
  it("parses valid JSON config", () => {
    const config = JSON.stringify([
      { id: "open", type: "todo", label: "Open", icon: "circle", visibleByDefault: true },
      { id: "wip", type: "active", label: "WIP", icon: "circle-dot", visibleByDefault: true },
    ]);
    const result = parseTaskStateConfig(config);
    expect(result).toHaveLength(2);
    expect(result![0].id).toBe("open");
    expect(result![1].type).toBe("active");
  });

  it("returns null for invalid JSON", () => {
    expect(parseTaskStateConfig("not json")).toBeNull();
  });

  it("returns null for empty array", () => {
    expect(parseTaskStateConfig("[]")).toBeNull();
  });

  it("filters out invalid entries", () => {
    const config = JSON.stringify([
      { id: "ok", type: "todo", label: "OK", icon: "circle", visibleByDefault: true },
      { id: "", type: "todo", label: "Bad", icon: "circle", visibleByDefault: true },
      { missing: "fields" },
    ]);
    const result = parseTaskStateConfig(config);
    expect(result).toHaveLength(1);
    expect(result![0].id).toBe("ok");
  });

  it("deduplicates by id", () => {
    const config = JSON.stringify([
      { id: "todo", type: "todo", label: "First", icon: "circle", visibleByDefault: true },
      { id: "todo", type: "todo", label: "Duplicate", icon: "circle", visibleByDefault: false },
    ]);
    const result = parseTaskStateConfig(config);
    expect(result).toHaveLength(1);
    expect(result![0].label).toBe("First");
  });

  it("rejects unknown state types", () => {
    const config = JSON.stringify([
      { id: "bad", type: "unknown", label: "Bad", icon: "x", visibleByDefault: true },
    ]);
    expect(parseTaskStateConfig(config)).toBeNull();
  });
});

describe("resolveTaskStateDefinition", () => {
  it("resolves known states from registry", () => {
    const def = resolveTaskStateDefinition("in-progress", DEFAULT_TASK_STATES);
    expect(def.id).toBe("in-progress");
    expect(def.type).toBe("active");
    expect(def.label).toBe("In Progress");
  });

  it("returns first state for undefined id", () => {
    const def = resolveTaskStateDefinition(undefined, DEFAULT_TASK_STATES);
    expect(def.id).toBe("todo");
  });

  it("derives a fallback for unknown state ids", () => {
    const def = resolveTaskStateDefinition("blocked", DEFAULT_TASK_STATES);
    expect(def.id).toBe("blocked");
    expect(def.type).toBe("active");
    expect(def.label).toBe("blocked");
    expect(def.visibleByDefault).toBe(false);
  });

  it("derives done type for 'completed' id", () => {
    expect(resolveTaskStateDefinition("completed", DEFAULT_TASK_STATES).type).toBe("done");
  });

  it("derives todo type for 'open' id", () => {
    expect(resolveTaskStateDefinition("open", DEFAULT_TASK_STATES).type).toBe("todo");
  });
});

describe("type helpers", () => {
  it("getTaskStateUiType returns correct types", () => {
    expect(getTaskStateUiType("todo", DEFAULT_TASK_STATES)).toBe("todo");
    expect(getTaskStateUiType("in-progress", DEFAULT_TASK_STATES)).toBe("active");
    expect(getTaskStateUiType("done", DEFAULT_TASK_STATES)).toBe("done");
    expect(getTaskStateUiType("closed", DEFAULT_TASK_STATES)).toBe("closed");
  });

  it("isTaskCompletedState only true for done type", () => {
    expect(isTaskCompletedState("done", DEFAULT_TASK_STATES)).toBe(true);
    expect(isTaskCompletedState("in-progress", DEFAULT_TASK_STATES)).toBe(false);
    expect(isTaskCompletedState("closed", DEFAULT_TASK_STATES)).toBe(false);
  });

  it("isTaskTerminalState true for done and closed types", () => {
    expect(isTaskTerminalState("done", DEFAULT_TASK_STATES)).toBe(true);
    expect(isTaskTerminalState("closed", DEFAULT_TASK_STATES)).toBe(true);
    expect(isTaskTerminalState("todo", DEFAULT_TASK_STATES)).toBe(false);
    expect(isTaskTerminalState("in-progress", DEFAULT_TASK_STATES)).toBe(false);
  });

  it("getStateSortType matches ui type", () => {
    expect(getStateSortType("in-progress", DEFAULT_TASK_STATES)).toBe("active");
    expect(getStateSortType("done", DEFAULT_TASK_STATES)).toBe("done");
  });
});

describe("getQuickToggleNextState", () => {
  it("desktop: todo -> in-progress", () => {
    expect(getQuickToggleNextState("todo", {}, DEFAULT_TASK_STATES)).toBe("in-progress");
  });

  it("desktop: in-progress -> done", () => {
    expect(getQuickToggleNextState("in-progress", {}, DEFAULT_TASK_STATES)).toBe("done");
  });

  it("desktop: done -> null (open chooser)", () => {
    expect(getQuickToggleNextState("done", {}, DEFAULT_TASK_STATES)).toBeNull();
  });

  it("desktop: closed -> null (open chooser)", () => {
    expect(getQuickToggleNextState("closed", {}, DEFAULT_TASK_STATES)).toBeNull();
  });

  it("mobile: todo -> done (skips active)", () => {
    expect(getQuickToggleNextState("todo", { mobile: true }, DEFAULT_TASK_STATES)).toBe("done");
  });

  it("mobile: in-progress -> done", () => {
    expect(getQuickToggleNextState("in-progress", { mobile: true }, DEFAULT_TASK_STATES)).toBe("done");
  });

  it("mobile: done -> null", () => {
    expect(getQuickToggleNextState("done", { mobile: true }, DEFAULT_TASK_STATES)).toBeNull();
  });

  it("handles undefined status (defaults to todo)", () => {
    expect(getQuickToggleNextState(undefined, {}, DEFAULT_TASK_STATES)).toBe("in-progress");
  });

  it("works with custom registry", () => {
    const custom = [
      { id: "backlog", type: "todo" as const, label: "Backlog", icon: "circle", visibleByDefault: true },
      { id: "dev", type: "active" as const, label: "Dev", icon: "circle-dot", visibleByDefault: true },
      { id: "complete", type: "done" as const, label: "Complete", icon: "check", visibleByDefault: true },
    ];
    expect(getQuickToggleNextState("backlog", {}, custom)).toBe("dev");
    expect(getQuickToggleNextState("dev", {}, custom)).toBe("complete");
    expect(getQuickToggleNextState("backlog", { mobile: true }, custom)).toBe("complete");
  });
});

describe("getNextStateInSequence", () => {
  it("cycles through states in order", () => {
    expect(getNextStateInSequence("todo", DEFAULT_TASK_STATES)).toBe("in-progress");
    expect(getNextStateInSequence("in-progress", DEFAULT_TASK_STATES)).toBe("done");
    expect(getNextStateInSequence("done", DEFAULT_TASK_STATES)).toBe("closed");
    expect(getNextStateInSequence("closed", DEFAULT_TASK_STATES)).toBe("todo");
  });

  it("wraps around from last to first", () => {
    expect(getNextStateInSequence("closed", DEFAULT_TASK_STATES)).toBe("todo");
  });

  it("falls back to first state for unknown id", () => {
    expect(getNextStateInSequence("nonexistent", DEFAULT_TASK_STATES)).toBe("todo");
  });
});

describe("getVisibleByDefaultStates", () => {
  it("returns all defaults when all visible", () => {
    expect(getVisibleByDefaultStates(DEFAULT_TASK_STATES)).toHaveLength(4);
  });

  it("filters by visibleByDefault flag", () => {
    const registry = [
      ...DEFAULT_TASK_STATES,
      { id: "blocked", type: "active" as const, label: "Blocked", icon: "pause", visibleByDefault: false },
    ];
    expect(getVisibleByDefaultStates(registry)).toHaveLength(4);
  });
});

describe("getProtocolTypeForState", () => {
  it("maps todo/active to open", () => {
    expect(getProtocolTypeForState("todo", DEFAULT_TASK_STATES)).toBe("open");
    expect(getProtocolTypeForState("in-progress", DEFAULT_TASK_STATES)).toBe("open");
  });

  it("maps done to done", () => {
    expect(getProtocolTypeForState("done", DEFAULT_TASK_STATES)).toBe("done");
  });

  it("maps closed to closed", () => {
    expect(getProtocolTypeForState("closed", DEFAULT_TASK_STATES)).toBe("closed");
  });
});
