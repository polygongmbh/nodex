import { describe, it, expect, vi, beforeEach } from "vitest";
import { Circle, CircleDot, CircleCheckBig, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { TaskStateDefinition } from "@/domain/task-states/task-state-config";
import { DEFAULT_TASK_STATES } from "@/domain/task-states/task-state-config";

// Mock dynamicIconImports before importing the module under test
vi.mock("lucide-react/dynamicIconImports", () => {
  const FakeIcon = () => null;
  return {
    default: {
      circle: () => Promise.resolve({ default: Circle }),
      "circle-dot": () => Promise.resolve({ default: CircleDot }),
      "circle-check-big": () => Promise.resolve({ default: CircleCheckBig }),
      x: () => Promise.resolve({ default: X }),
    },
  };
});

// Import after mocking
const { getTaskStateIconComponent, preloadTaskStateIcons } = await import(
  "./task-state-ui"
);

describe("preloadTaskStateIcons", () => {
  it("populates cache so getTaskStateIconComponent returns the real component", async () => {
    await preloadTaskStateIcons(DEFAULT_TASK_STATES);
    expect(getTaskStateIconComponent("circle")).toBe(Circle);
    expect(getTaskStateIconComponent("circle-dot")).toBe(CircleDot);
    expect(getTaskStateIconComponent("circle-check-big")).toBe(CircleCheckBig);
    expect(getTaskStateIconComponent("x")).toBe(X);
  });

  it("is idempotent: re-calling does not throw or duplicate", async () => {
    await expect(preloadTaskStateIcons(DEFAULT_TASK_STATES)).resolves.toBeUndefined();
  });

  it("silently skips unknown icon IDs", async () => {
    const custom: TaskStateDefinition[] = [
      { id: "custom", type: "open", label: "Custom", icon: "no-such-icon", visibleByDefault: true },
    ];
    await expect(preloadTaskStateIcons(custom)).resolves.toBeUndefined();
    // Falls back to the type's default
    expect(getTaskStateIconComponent("no-such-icon", "open")).toBe(Circle);
  });
});

describe("getTaskStateIconComponent", () => {
  it("falls back to the type default for uncached IDs", () => {
    expect(getTaskStateIconComponent("totally-unknown", "done")).toBe(CircleCheckBig);
    expect(getTaskStateIconComponent("totally-unknown", "closed")).toBe(X);
  });

  it("falls back to Circle when no fallback type is given", () => {
    expect(getTaskStateIconComponent("also-unknown")).toBe(Circle);
  });
});
