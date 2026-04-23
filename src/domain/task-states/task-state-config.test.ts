import { describe, it, expect } from "vitest";
import {
  DEFAULT_TASK_STATES,
  parseTaskStateConfig,
  resolveTaskState,
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
      { id: "open", type: "open", label: "Open", icon: "circle", visibleByDefault: true },
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
      { id: "ok", type: "open", label: "OK", icon: "circle", visibleByDefault: true },
      { id: "", type: "open", label: "Bad", icon: "circle", visibleByDefault: true },
      { missing: "fields" },
    ]);
    const result = parseTaskStateConfig(config);
    expect(result).toHaveLength(1);
    expect(result![0].id).toBe("ok");
  });

  it("deduplicates by id", () => {
    const config = JSON.stringify([
      { id: "open", type: "open", label: "First", icon: "circle", visibleByDefault: true },
      { id: "open", type: "open", label: "Duplicate", icon: "circle", visibleByDefault: false },
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

describe("resolveTaskState", () => {
  it("resolves default active state from status alone", () => {
    const def = resolveTaskState("active", undefined, DEFAULT_TASK_STATES);
    expect(def.id).toBe("active");
    expect(def.label).toBe("In Progress");
  });

  it("resolves default open state for undefined status", () => {
    const def = resolveTaskState(undefined, undefined, DEFAULT_TASK_STATES);
    expect(def.id).toBe("open");
  });

  it("matches configured state by label", () => {
    const registry = [
      ...DEFAULT_TASK_STATES,
      { id: "blocked", type: "active" as const, label: "Blocked", icon: "pause", visibleByDefault: false },
    ];
    const def = resolveTaskState("active", "Blocked", registry);
    expect(def.id).toBe("blocked");
  });

  it("matches configured state by id when label matches id", () => {
    const registry = [
      ...DEFAULT_TASK_STATES,
      { id: "review", type: "active" as const, label: "In Review", icon: "eye", visibleByDefault: false },
    ];
    const def = resolveTaskState("active", "review", registry);
    expect(def.id).toBe("review");
  });

  it("derives ad-hoc definition for unknown label", () => {
    const def = resolveTaskState("active", "Custom Work", DEFAULT_TASK_STATES);
    expect(def.id).toBe("active:custom work");
    expect(def.label).toBe("Custom Work");
    expect(def.type).toBe("active");
    expect(def.visibleByDefault).toBe(false);
  });
});

describe("resolveTaskStateDefinition", () => {
  it("resolves known states from registry", () => {
    const def = resolveTaskStateDefinition("active", DEFAULT_TASK_STATES);
    expect(def.id).toBe("active");
    expect(def.type).toBe("active");
    expect(def.label).toBe("In Progress");
  });

  it("returns first state for undefined id", () => {
    const def = resolveTaskStateDefinition(undefined, DEFAULT_TASK_STATES);
    expect(def.id).toBe("open");
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

  it("derives open type for 'todo' id", () => {
    expect(resolveTaskStateDefinition("todo", DEFAULT_TASK_STATES).type).toBe("open");
  });
});

describe("type helpers", () => {
  it("getTaskStateUiType returns correct types", () => {
    expect(getTaskStateUiType("open", DEFAULT_TASK_STATES)).toBe("open");
    expect(getTaskStateUiType("active", DEFAULT_TASK_STATES)).toBe("active");
    expect(getTaskStateUiType("done", DEFAULT_TASK_STATES)).toBe("done");
    expect(getTaskStateUiType("closed", DEFAULT_TASK_STATES)).toBe("closed");
  });

  it("isTaskCompletedState only true for done type", () => {
    expect(isTaskCompletedState("done", DEFAULT_TASK_STATES)).toBe(true);
    expect(isTaskCompletedState("active", DEFAULT_TASK_STATES)).toBe(false);
    expect(isTaskCompletedState("closed", DEFAULT_TASK_STATES)).toBe(false);
  });

  it("isTaskTerminalState true for done and closed types", () => {
    expect(isTaskTerminalState("done", DEFAULT_TASK_STATES)).toBe(true);
    expect(isTaskTerminalState("closed", DEFAULT_TASK_STATES)).toBe(true);
    expect(isTaskTerminalState("open", DEFAULT_TASK_STATES)).toBe(false);
    expect(isTaskTerminalState("active", DEFAULT_TASK_STATES)).toBe(false);
  });

  it("getStateSortType matches ui type", () => {
    expect(getStateSortType("active", DEFAULT_TASK_STATES)).toBe("active");
    expect(getStateSortType("done", DEFAULT_TASK_STATES)).toBe("done");
  });
});

describe("getQuickToggleNextState", () => {
  it("desktop: open -> active", () => {
    expect(getQuickToggleNextState("open", {}, DEFAULT_TASK_STATES)).toBe("active");
  });

  it("desktop: active -> done", () => {
    expect(getQuickToggleNextState("active", {}, DEFAULT_TASK_STATES)).toBe("done");
  });

  it("desktop: done -> null (open chooser)", () => {
    expect(getQuickToggleNextState("done", {}, DEFAULT_TASK_STATES)).toBeNull();
  });

  it("desktop: closed -> null (open chooser)", () => {
    expect(getQuickToggleNextState("closed", {}, DEFAULT_TASK_STATES)).toBeNull();
  });

  it("mobile: open -> done (skips active)", () => {
    expect(getQuickToggleNextState("open", { mobile: true }, DEFAULT_TASK_STATES)).toBe("done");
  });

  it("mobile: active -> done", () => {
    expect(getQuickToggleNextState("active", { mobile: true }, DEFAULT_TASK_STATES)).toBe("done");
  });

  it("mobile: done -> null", () => {
    expect(getQuickToggleNextState("done", { mobile: true }, DEFAULT_TASK_STATES)).toBeNull();
  });

  it("handles undefined status (defaults to open)", () => {
    expect(getQuickToggleNextState(undefined, {}, DEFAULT_TASK_STATES)).toBe("active");
  });

  it("works with custom registry", () => {
    const custom = [
      { id: "backlog", type: "open" as const, label: "Backlog", icon: "circle", visibleByDefault: true },
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
    expect(getNextStateInSequence("open", DEFAULT_TASK_STATES)).toBe("active");
    expect(getNextStateInSequence("active", DEFAULT_TASK_STATES)).toBe("done");
    expect(getNextStateInSequence("done", DEFAULT_TASK_STATES)).toBe("closed");
    expect(getNextStateInSequence("closed", DEFAULT_TASK_STATES)).toBe("open");
  });

  it("falls back to first state for unknown id", () => {
    expect(getNextStateInSequence("nonexistent", DEFAULT_TASK_STATES)).toBe("open");
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
  it("maps open/active to open", () => {
    expect(getProtocolTypeForState("open", DEFAULT_TASK_STATES)).toBe("open");
    expect(getProtocolTypeForState("active", DEFAULT_TASK_STATES)).toBe("open");
  });

  it("maps done to done", () => {
    expect(getProtocolTypeForState("done", DEFAULT_TASK_STATES)).toBe("done");
  });

  it("maps closed to closed", () => {
    expect(getProtocolTypeForState("closed", DEFAULT_TASK_STATES)).toBe("closed");
  });
});
