import { describe, expect, it } from "vitest";
import { buildFocusChain, selectSidebarProjects } from "./sidebar-projects";
import { makeComment, makeTask } from "@/test/fixtures";

describe("selectSidebarProjects", () => {
  it("selects active top-level tasks with non-terminal subtasks, with active subprojects indented", () => {
    const project = makeTask({ id: "project", content: "Project", state: "active" });
    const subproject = makeTask({
      id: "subproject",
      parentId: "project",
      content: "Subproject",
      state: "active",
    });
    const subprojectLeaf = makeTask({ id: "leaf", parentId: "subproject", state: "active" });

    const result = selectSidebarProjects([project, subproject, subprojectLeaf]);

    expect(result).toHaveLength(1);
    expect(result[0].project.id).toBe("project");
    expect(result[0].subprojects.map((task) => task.id)).toEqual(["subproject"]);
  });

  it("excludes active leaf tasks, inactive parents, and tasks with only terminal children", () => {
    const activeLeaf = makeTask({ id: "active-leaf", state: "active" });
    const openParent = makeTask({ id: "open-parent", state: "open" });
    const openChild = makeTask({ id: "open-child", parentId: "open-parent", state: "open" });
    const doneOnlyParent = makeTask({ id: "done-parent", state: "active" });
    const doneChild = makeTask({ id: "done-child", parentId: "done-parent", state: "done" });

    const result = selectSidebarProjects([
      activeLeaf,
      openParent,
      openChild,
      doneOnlyParent,
      doneChild,
    ]);

    expect(result).toHaveLength(0);
  });

  it("excludes subprojects without an active subtask of their own", () => {
    const project = makeTask({ id: "project", state: "active" });
    const subproject = makeTask({ id: "subproject", parentId: "project", state: "active" });
    const openLeaf = makeTask({ id: "leaf", parentId: "subproject", state: "open" });

    const result = selectSidebarProjects([project, subproject, openLeaf]);

    expect(result).toHaveLength(1);
    // The subproject's only subtask is open, not active, so it does not qualify.
    expect(result[0].subprojects).toHaveLength(0);
  });

  it("does not count comments as subtasks and excludes active subtasks without further subtasks", () => {
    const project = makeTask({ id: "project", state: "active" });
    const child = makeTask({ id: "child", parentId: "project", state: "active" });
    const commentUnderChild = makeComment({ id: "comment", parentId: "child" });

    const result = selectSidebarProjects([project, child, commentUnderChild]);

    expect(result).toHaveLength(1);
    // The active child has no task-typed subtasks, so it is not a subproject.
    expect(result[0].subprojects).toHaveLength(0);
  });

  it("does not list nested projects as top-level entries", () => {
    const root = makeTask({ id: "root", state: "active" });
    const nestedProject = makeTask({ id: "nested", parentId: "root", state: "active" });
    const nestedChild = makeTask({ id: "nested-child", parentId: "nested", state: "open" });

    const result = selectSidebarProjects([root, nestedProject, nestedChild]);

    expect(result.map((row) => row.project.id)).toEqual(["root"]);
  });
});

describe("buildFocusChain", () => {
  const root = makeTask({ id: "root", state: "active" });
  const mid = makeTask({ id: "mid", parentId: "root", state: "open" });
  const leaf = makeTask({ id: "leaf", parentId: "mid", state: "open" });

  it("returns the ancestor chain topmost-first, ending at the focused task", () => {
    expect(buildFocusChain([root, mid, leaf], "leaf").map((task) => task.id)).toEqual([
      "root",
      "mid",
      "leaf",
    ]);
  });

  it("returns an empty chain without focus or for an unknown id", () => {
    expect(buildFocusChain([root, mid, leaf], null)).toEqual([]);
    expect(buildFocusChain([root, mid, leaf], "missing")).toEqual([]);
  });

  it("includes non-task posts like a breadcrumb and survives parent cycles", () => {
    const comment = makeComment({ id: "comment", parentId: "leaf" });
    expect(buildFocusChain([root, mid, leaf, comment], "comment").map((post) => post.id)).toEqual([
      "root",
      "mid",
      "leaf",
      "comment",
    ]);

    const cycleA = makeTask({ id: "a", parentId: "b" });
    const cycleB = makeTask({ id: "b", parentId: "a" });
    expect(buildFocusChain([cycleA, cycleB], "a").map((post) => post.id)).toEqual(["b", "a"]);
  });
});
