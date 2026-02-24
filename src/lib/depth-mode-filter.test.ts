import { describe, expect, it } from "vitest";
import { filterTasksByDepthMode } from "./depth-mode-filter";

interface TestTask {
  id: string;
  parentId?: string | null;
}

const tasks: TestTask[] = [
  { id: "root" },
  { id: "child-1", parentId: "root" },
  { id: "child-2", parentId: "root" },
];

const getDepth = (taskId: string) => {
  if (taskId === "root") return 1;
  if (taskId === "child-1" || taskId === "child-2") return 2;
  return 1;
};

const hasChildren = (taskId: string) => taskId === "root";

describe("filterTasksByDepthMode", () => {
  it("returns only project containers in projects mode when matches exist", () => {
    const filtered = filterTasksByDepthMode({
      tasks,
      depthMode: "projects",
      getDepth,
      hasChildren,
    });

    expect(filtered.map((task) => task.id)).toEqual(["root"]);
  });

  it("falls back to all levels when projects mode has no matches", () => {
    const noProjectTasks: TestTask[] = [
      { id: "solo-1" },
      { id: "solo-2" },
    ];

    const filtered = filterTasksByDepthMode({
      tasks: noProjectTasks,
      depthMode: "projects",
      getDepth: () => 1,
      hasChildren: () => false,
    });

    expect(filtered).toEqual(noProjectTasks);
  });

  it("keeps non-project depth modes unchanged", () => {
    const filtered = filterTasksByDepthMode({
      tasks,
      depthMode: "1",
      getDepth,
      hasChildren,
    });

    expect(filtered.map((task) => task.id)).toEqual(["root"]);
  });
});
