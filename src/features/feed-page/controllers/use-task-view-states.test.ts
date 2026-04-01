import { describe, expect, it } from "vitest";
import { getAncestorChainFromSource } from "./use-task-view-states";
import { makeTask } from "@/test/fixtures";

describe("getAncestorChainFromSource", () => {
  it("returns the full ancestor chain when no active item is set", () => {
    const root = makeTask({ id: "root", content: "Root task #general" });
    const middle = makeTask({ id: "middle", parentId: "root", content: "Middle task #general" });
    const leaf = makeTask({ id: "leaf", parentId: "middle", content: "Leaf task #general" });
    const taskById = new Map([root, middle, leaf].map((task) => [task.id, task] as const));

    expect(getAncestorChainFromSource({ taskById }, "leaf")).toEqual([
      { id: "root", text: "Root task general" },
      { id: "middle", text: "Middle task general" },
    ]);
  });

  it("trims ancestors above the active item and omits the active item itself", () => {
    const root = makeTask({ id: "root", content: "Root task #general" });
    const middle = makeTask({ id: "middle", parentId: "root", content: "Middle task #general" });
    const branch = makeTask({ id: "branch", parentId: "middle", content: "Branch task #general" });
    const leaf = makeTask({ id: "leaf", parentId: "branch", content: "Leaf task #general" });
    const taskById = new Map([root, middle, branch, leaf].map((task) => [task.id, task] as const));

    expect(getAncestorChainFromSource({ taskById }, "leaf", "middle")).toEqual([
      { id: "branch", text: "Branch task general" },
    ]);
  });

  it("returns an empty chain when the rendered item is the active item", () => {
    const root = makeTask({ id: "root", content: "Root task #general" });
    const child = makeTask({ id: "child", parentId: "root", content: "Child task #general" });
    const taskById = new Map([root, child].map((task) => [task.id, task] as const));

    expect(getAncestorChainFromSource({ taskById }, "child", "child")).toEqual([]);
  });

  it("returns an empty chain for a direct child of the active item", () => {
    const root = makeTask({ id: "root", content: "Root task #general" });
    const child = makeTask({ id: "child", parentId: "root", content: "Child task #general" });
    const grandchild = makeTask({ id: "grandchild", parentId: "child", content: "Grandchild task #general" });
    const taskById = new Map([root, child, grandchild].map((task) => [task.id, task] as const));

    expect(getAncestorChainFromSource({ taskById }, "grandchild", "child")).toEqual([]);
  });

  it("falls back to the full chain when the active item is not an ancestor", () => {
    const root = makeTask({ id: "root", content: "Root task #general" });
    const middle = makeTask({ id: "middle", parentId: "root", content: "Middle task #general" });
    const leaf = makeTask({ id: "leaf", parentId: "middle", content: "Leaf task #general" });
    const outsider = makeTask({ id: "outsider", content: "Outside task #general" });
    const taskById = new Map([root, middle, leaf, outsider].map((task) => [task.id, task] as const));

    expect(getAncestorChainFromSource({ taskById }, "leaf", "outsider")).toEqual([
      { id: "root", text: "Root task general" },
      { id: "middle", text: "Middle task general" },
    ]);
  });
});
