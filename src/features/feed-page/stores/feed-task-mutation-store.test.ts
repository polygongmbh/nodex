import { beforeEach, describe, expect, it } from "vitest";
import { useFeedTaskMutationStore } from "./feed-task-mutation-store";
import { makeTask } from "@/test/fixtures";

describe("feedTaskMutationStore", () => {
  beforeEach(() => {
    useFeedTaskMutationStore.setState({
      localTasks: [],
      postedTags: [],
      suppressedNostrEventIds: new Set(),
    });
  });

  it("has empty initial state", () => {
    const state = useFeedTaskMutationStore.getState();
    expect(state.localTasks).toEqual([]);
    expect(state.postedTags).toEqual([]);
    expect(state.suppressedNostrEventIds).toEqual(new Set());
  });

  it("setLocalTasks replaces tasks with a direct value", () => {
    const task = makeTask({ id: "t1", content: "Test task" });
    useFeedTaskMutationStore.getState().setLocalTasks([task]);
    expect(useFeedTaskMutationStore.getState().localTasks).toEqual([task]);
  });

  it("setLocalTasks accepts a functional updater", () => {
    const task1 = makeTask({ id: "t1", content: "First" });
    const task2 = makeTask({ id: "t2", content: "Second" });
    useFeedTaskMutationStore.getState().setLocalTasks([task1]);
    useFeedTaskMutationStore.getState().setLocalTasks((prev) => [...prev, task2]);
    expect(useFeedTaskMutationStore.getState().localTasks).toHaveLength(2);
    expect(useFeedTaskMutationStore.getState().localTasks[1].id).toBe("t2");
  });

  it("setPostedTags appends via functional updater", () => {
    useFeedTaskMutationStore.getState().setPostedTags([{ name: "bug", relayIds: ["r1"] }]);
    useFeedTaskMutationStore.getState().setPostedTags((prev) => [
      ...prev,
      { name: "feature", relayIds: ["r2"] },
    ]);
    expect(useFeedTaskMutationStore.getState().postedTags).toHaveLength(2);
    expect(useFeedTaskMutationStore.getState().postedTags[1].name).toBe("feature");
  });

  it("setSuppressedNostrEventIds adds to set via functional updater", () => {
    useFeedTaskMutationStore.getState().setSuppressedNostrEventIds(new Set(["id1"]));
    useFeedTaskMutationStore.getState().setSuppressedNostrEventIds((prev) => {
      const next = new Set(prev);
      next.add("id2");
      return next;
    });
    const ids = useFeedTaskMutationStore.getState().suppressedNostrEventIds;
    expect(ids.has("id1")).toBe(true);
    expect(ids.has("id2")).toBe(true);
    expect(ids.size).toBe(2);
  });
});
