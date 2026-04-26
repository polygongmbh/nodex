import { beforeEach, describe, expect, it } from "vitest";
import { useTaskMutationStore } from "./task-mutation-store";
import { makeTask } from "@/test/fixtures";
import type { FailedPublishDraft } from "@/infrastructure/preferences/failed-publish-drafts-storage";

describe("taskMutationStore", () => {
  beforeEach(() => {
    useTaskMutationStore.setState({
      localTasks: [],
      postedTags: [],
      suppressedNostrEventIds: new Set(),
      failedPublishDrafts: [],
    });
  });

  it("has empty initial state", () => {
    const state = useTaskMutationStore.getState();
    expect(state.localTasks).toEqual([]);
    expect(state.postedTags).toEqual([]);
    expect(state.suppressedNostrEventIds).toEqual(new Set());
    expect(state.failedPublishDrafts).toEqual([]);
  });

  it("setLocalTasks replaces tasks with a direct value", () => {
    const task = makeTask({ id: "t1", content: "Test task" });
    useTaskMutationStore.getState().setLocalTasks([task]);
    expect(useTaskMutationStore.getState().localTasks).toEqual([task]);
  });

  it("setLocalTasks accepts a functional updater", () => {
    const task1 = makeTask({ id: "t1", content: "First" });
    const task2 = makeTask({ id: "t2", content: "Second" });
    useTaskMutationStore.getState().setLocalTasks([task1]);
    useTaskMutationStore.getState().setLocalTasks((prev) => [...prev, task2]);
    expect(useTaskMutationStore.getState().localTasks).toHaveLength(2);
    expect(useTaskMutationStore.getState().localTasks[1].id).toBe("t2");
  });

  it("setPostedTags appends via functional updater", () => {
    useTaskMutationStore.getState().setPostedTags([{ name: "bug", relayIds: ["r1"] }]);
    useTaskMutationStore.getState().setPostedTags((prev) => [
      ...prev,
      { name: "feature", relayIds: ["r2"] },
    ]);
    expect(useTaskMutationStore.getState().postedTags).toHaveLength(2);
    expect(useTaskMutationStore.getState().postedTags[1].name).toBe("feature");
  });

  it("setSuppressedNostrEventIds adds to set via functional updater", () => {
    useTaskMutationStore.getState().setSuppressedNostrEventIds(new Set(["id1"]));
    useTaskMutationStore.getState().setSuppressedNostrEventIds((prev) => {
      const next = new Set(prev);
      next.add("id2");
      return next;
    });
    const ids = useTaskMutationStore.getState().suppressedNostrEventIds;
    expect(ids.has("id1")).toBe(true);
    expect(ids.has("id2")).toBe(true);
    expect(ids.size).toBe(2);
  });

  it("setFailedPublishDrafts replaces drafts with a direct value", () => {
    const draft = { id: "d1" } as FailedPublishDraft;
    useTaskMutationStore.getState().setFailedPublishDrafts([draft]);
    expect(useTaskMutationStore.getState().failedPublishDrafts).toHaveLength(1);
    expect(useTaskMutationStore.getState().failedPublishDrafts[0].id).toBe("d1");
  });

  it("setFailedPublishDrafts accepts a functional updater", () => {
    const draft1 = { id: "d1" } as FailedPublishDraft;
    const draft2 = { id: "d2" } as FailedPublishDraft;
    useTaskMutationStore.getState().setFailedPublishDrafts([draft1]);
    useTaskMutationStore.getState().setFailedPublishDrafts((prev) => [...prev, draft2]);
    expect(useTaskMutationStore.getState().failedPublishDrafts).toHaveLength(2);
    expect(useTaskMutationStore.getState().failedPublishDrafts[1].id).toBe("d2");
  });
});
