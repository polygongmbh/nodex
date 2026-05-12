import { describe, expect, it } from "vitest";
import { makeTask, makePerson } from "@/test/fixtures";
import {
  hasInProgressTopLevelProject,
  isTaskOwnedByAny,
  resolveStatusConcernsScope,
  resolveStatusPeopleScope,
  selectPeopleOwnedTasks,
  selectStatusInProgressTopLevelTasks,
  selectStatusTimelinePosts,
  taskConcernsAny,
} from "./status-filters";
import type { Task } from "@/types";

function buildChildrenMap(tasks: Task[]): Map<string | undefined, Task[]> {
  const map = new Map<string | undefined, Task[]>();
  for (const task of tasks) {
    const key = task.parentId;
    const bucket = map.get(key);
    if (bucket) bucket.push(task);
    else map.set(key, [task]);
  }
  return map;
}

describe("resolveStatusPeopleScope", () => {
  it("prefers sidebar-selected people over the signed-in user", () => {
    const scope = resolveStatusPeopleScope(["AAA", "bbb"], "ccc");
    expect(scope).toEqual(new Set(["aaa", "bbb"]));
  });

  it("falls back to the current user when no people are selected", () => {
    expect(resolveStatusPeopleScope([], "CCC")).toEqual(new Set(["ccc"]));
  });

  it("returns an empty set when nothing is selected and no user is signed in", () => {
    expect(resolveStatusPeopleScope([], undefined)).toEqual(new Set());
  });
});

describe("isTaskOwnedByAny", () => {
  const me = "me-pub";
  const meSet = new Set([me]);

  it("recognises explicit assignment", () => {
    const task = makeTask({ assigneePubkeys: [me], author: makePerson({ pubkey: "someone-else" }) });
    expect(isTaskOwnedByAny(task, meSet)).toBe(true);
  });

  it("treats authored-without-assignees as ownership", () => {
    const task = makeTask({ author: makePerson({ pubkey: me }) });
    expect(isTaskOwnedByAny(task, meSet)).toBe(true);
  });

  it("does NOT consider authored tasks owned when assigned to someone else", () => {
    const task = makeTask({
      author: makePerson({ pubkey: me }),
      assigneePubkeys: ["someone-else"],
    });
    expect(isTaskOwnedByAny(task, meSet)).toBe(false);
  });

  it("returns false when the scope set is empty", () => {
    const task = makeTask({ author: makePerson({ pubkey: me }) });
    expect(isTaskOwnedByAny(task, new Set())).toBe(false);
  });
});

describe("selectStatusInProgressTopLevelTasks / hasInProgressTopLevelProject", () => {
  const openChild = makeTask({ id: "c1", parentId: "p1", state: { type: "open" } });
  const activeRootWithOpenChild = makeTask({ id: "p1", state: { type: "active" } });
  const activeRootNoSubtasks = makeTask({ id: "p2", state: { type: "active" } });
  const openRootWithOpenChild = makeTask({ id: "p3", state: { type: "open" } });
  const openChildOfP3 = makeTask({ id: "c3", parentId: "p3", state: { type: "open" } });
  const doneRootWithOnlyDoneChildren = makeTask({ id: "p4", state: { type: "done" } });
  const doneChildOfP4 = makeTask({ id: "c4", parentId: "p4", state: { type: "done" } });
  const closedChildOfP4 = makeTask({ id: "c4b", parentId: "p4", state: { type: "closed" } });
  const nested = makeTask({ id: "n1", parentId: "p1", state: { type: "active" } });
  const nestedChild = makeTask({ id: "n2", parentId: "n1", state: { type: "open" } });
  const allTasks = [
    activeRootWithOpenChild,
    activeRootNoSubtasks,
    openRootWithOpenChild,
    openChild,
    openChildOfP3,
    doneRootWithOnlyDoneChildren,
    doneChildOfP4,
    closedChildOfP4,
    nested,
    nestedChild,
  ];

  it("returns root tasks with active status, regardless of whether they have subtasks", () => {
    const result = selectStatusInProgressTopLevelTasks({
      contextTasks: allTasks,
      focusedTaskId: null,
    });
    expect(result.map((task) => task.id).sort()).toEqual(["p1", "p2"]);
  });

  it("switches to direct active children of the focused task when context is narrowed", () => {
    const result = selectStatusInProgressTopLevelTasks({
      contextTasks: allTasks,
      focusedTaskId: "p1",
    });
    expect(result.map((task) => task.id)).toEqual(["n1"]);
  });

  it("ignores non-task entries", () => {
    const comment = makeTask({ id: "cm1", taskType: "comment", state: { type: "active" } });
    const result = selectStatusInProgressTopLevelTasks({
      contextTasks: [comment],
      focusedTaskId: null,
    });
    expect(result).toEqual([]);
  });

  it("flags presence of an in-progress top-level project", () => {
    expect(
      hasInProgressTopLevelProject({
        contextTasks: allTasks,
        childrenByParentId: buildChildrenMap(allTasks),
        focusedTaskId: null,
      })
    ).toBe(true);
  });

  it("returns false when the only in-progress root has no non-terminal subtasks", () => {
    const onlyLeaf = [activeRootNoSubtasks];
    expect(
      hasInProgressTopLevelProject({
        contextTasks: onlyLeaf,
        childrenByParentId: buildChildrenMap(onlyLeaf),
        focusedTaskId: null,
      })
    ).toBe(false);
  });
});

describe("selectPeopleOwnedTasks", () => {
  const me = "me-pub";
  const peer = "peer-pub";

  const assignedToMe = makeTask({ id: "a", assigneePubkeys: [me] });
  const authoredByMeUnassigned = makeTask({ id: "b", author: makePerson({ pubkey: me }) });
  const authoredByMeAssignedToPeer = makeTask({
    id: "c",
    author: makePerson({ pubkey: me }),
    assigneePubkeys: [peer],
  });
  const unrelated = makeTask({ id: "d", author: makePerson({ pubkey: peer }) });

  it("returns tasks assigned to me OR authored by me without assignees", () => {
    const result = selectPeopleOwnedTasks({
      contextTasks: [assignedToMe, authoredByMeUnassigned, authoredByMeAssignedToPeer, unrelated],
      peopleScope: new Set([me]),
      focusedTaskId: null,
    });
    expect(result.map((task) => task.id).sort()).toEqual(["a", "b"]);
  });

  it("returns an empty list when the people scope is empty", () => {
    const result = selectPeopleOwnedTasks({
      contextTasks: [assignedToMe, authoredByMeUnassigned],
      peopleScope: new Set(),
      focusedTaskId: null,
    });
    expect(result).toEqual([]);
  });

  it("excludes comments when no task is focused", () => {
    const myComment = makeTask({
      id: "cmt",
      taskType: "comment",
      author: makePerson({ pubkey: me }),
    });
    const result = selectPeopleOwnedTasks({
      contextTasks: [assignedToMe, myComment],
      peopleScope: new Set([me]),
      focusedTaskId: null,
    });
    expect(result.map((task) => task.id)).toEqual(["a"]);
  });

  it("keeps comments when a task is focused", () => {
    const myComment = makeTask({
      id: "cmt",
      taskType: "comment",
      author: makePerson({ pubkey: me }),
    });
    const result = selectPeopleOwnedTasks({
      contextTasks: [assignedToMe, myComment],
      peopleScope: new Set([me]),
      focusedTaskId: "some-task",
    });
    expect(result.map((task) => task.id).sort()).toEqual(["a", "cmt"]);
  });
});

describe("resolveStatusConcernsScope", () => {
  it("unions sidebar-selected people with the signed-in user", () => {
    expect(resolveStatusConcernsScope(["AAA", "bbb"], "ccc")).toEqual(
      new Set(["aaa", "bbb", "ccc"])
    );
  });

  it("returns just the signed-in user when nobody is selected", () => {
    expect(resolveStatusConcernsScope([], "CCC")).toEqual(new Set(["ccc"]));
  });

  it("returns just the selected people when nobody is signed in", () => {
    expect(resolveStatusConcernsScope(["AAA"], undefined)).toEqual(new Set(["aaa"]));
  });

  it("returns an empty set when nothing is selected and no user is signed in", () => {
    expect(resolveStatusConcernsScope([], undefined)).toEqual(new Set());
  });
});

describe("taskConcernsAny", () => {
  const me = "me-pub";
  const meSet = new Set([me]);

  it("matches when the task is assigned to the pubkey", () => {
    const task = makeTask({ assigneePubkeys: [me], author: makePerson({ pubkey: "other" }) });
    expect(taskConcernsAny(task, meSet)).toBe(true);
  });

  it("matches when the task was authored by the pubkey even if assigned elsewhere", () => {
    const task = makeTask({
      author: makePerson({ pubkey: me }),
      assigneePubkeys: ["someone-else"],
    });
    expect(taskConcernsAny(task, meSet)).toBe(true);
  });

  it("returns false when neither author nor assignees include the pubkey", () => {
    const task = makeTask({ author: makePerson({ pubkey: "other" }), assigneePubkeys: ["nobody"] });
    expect(taskConcernsAny(task, meSet)).toBe(false);
  });

  it("returns false when the scope is empty", () => {
    const task = makeTask({ author: makePerson({ pubkey: me }) });
    expect(taskConcernsAny(task, new Set())).toBe(false);
  });
});

describe("selectStatusTimelinePosts", () => {
  const root1 = makeTask({ id: "r1", timestamp: new Date("2026-02-01") });
  const root2 = makeTask({ id: "r2", timestamp: new Date("2026-03-01") });
  const child = makeTask({ id: "c1", parentId: "r1", timestamp: new Date("2026-04-01") });
  const peerRoot = makeTask({
    id: "peer",
    author: makePerson({ pubkey: "peer-pub" }),
    timestamp: new Date("2026-02-15"),
  });

  it("returns root posts newest first when no concerns scope is active", () => {
    const result = selectStatusTimelinePosts({
      contextTasks: [root1, root2, child, peerRoot],
      focusedTaskId: null,
      concernsScope: new Set(),
    });
    expect(result.map((task) => task.id)).toEqual(["r2", "peer", "r1"]);
  });

  it("keeps all top-level posts even when a concerns scope is set", () => {
    const result = selectStatusTimelinePosts({
      contextTasks: [root1, root2, peerRoot],
      focusedTaskId: null,
      concernsScope: new Set(["someone-unrelated"]),
    });
    expect(result.map((task) => task.id)).toEqual(["r2", "peer", "r1"]);
  });

  it("adds non-top-level items authored by someone in the concerns scope", () => {
    const me = "me-pub";
    const myChild = makeTask({
      id: "mine",
      parentId: "r1",
      author: makePerson({ pubkey: me }),
      timestamp: new Date("2026-05-01"),
    });
    const otherChild = makeTask({
      id: "other",
      parentId: "r1",
      author: makePerson({ pubkey: "other-pub" }),
      timestamp: new Date("2026-05-02"),
    });
    const result = selectStatusTimelinePosts({
      contextTasks: [root1, root2, myChild, otherChild],
      focusedTaskId: null,
      concernsScope: new Set([me]),
    });
    expect(result.map((task) => task.id)).toEqual(["mine", "r2", "r1"]);
  });

  it("adds non-top-level items assigned to someone in the concerns scope", () => {
    const me = "me-pub";
    const assignedToMe = makeTask({
      id: "assigned",
      parentId: "r1",
      author: makePerson({ pubkey: "other-pub" }),
      assigneePubkeys: [me],
      timestamp: new Date("2026-05-01"),
    });
    const result = selectStatusTimelinePosts({
      contextTasks: [root1, assignedToMe],
      focusedTaskId: null,
      concernsScope: new Set([me]),
    });
    expect(result.map((task) => task.id)).toEqual(["assigned", "r1"]);
  });

  it("uses direct children of the focused task as roots when a context is focused", () => {
    const focused = "r1";
    const sibling = makeTask({ id: "sibling-of-r1", parentId: "r1", timestamp: new Date("2026-05-01") });
    const result = selectStatusTimelinePosts({
      contextTasks: [root1, root2, child, sibling],
      focusedTaskId: focused,
      concernsScope: new Set(),
    });
    expect(result.map((task) => task.id)).toEqual(["sibling-of-r1", "c1"]);
  });

  it("includes comments anywhere in the scope alongside top-level posts", () => {
    const comment = makeTask({
      id: "cmt",
      parentId: "r1",
      taskType: "comment",
      timestamp: new Date("2026-06-01"),
    });
    const result = selectStatusTimelinePosts({
      contextTasks: [root1, root2, comment],
      focusedTaskId: null,
      concernsScope: new Set(),
    });
    expect(result.map((task) => task.id)).toEqual(["cmt", "r2", "r1"]);
  });
});
