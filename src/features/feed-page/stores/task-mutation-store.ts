import type { SetStateAction } from "react";
import { create } from "zustand";
import type { PostedTag, Task } from "@/types";
import {
  loadFailedPublishDrafts,
  saveFailedPublishDrafts,
  type FailedPublishDraft,
} from "@/infrastructure/preferences/failed-publish-drafts-storage";

interface TaskMutationState {
  localTasks: Task[];
  postedTags: PostedTag[];
  suppressedNostrEventIds: Set<string>;
  failedPublishDrafts: FailedPublishDraft[];

  setLocalTasks: (updater: SetStateAction<Task[]>) => void;
  setPostedTags: (updater: SetStateAction<PostedTag[]>) => void;
  setSuppressedNostrEventIds: (updater: SetStateAction<Set<string>>) => void;
  setFailedPublishDrafts: (updater: SetStateAction<FailedPublishDraft[]>) => void;
}

function applyUpdater<T>(prev: T, updater: SetStateAction<T>): T {
  return typeof updater === "function"
    ? (updater as (prev: T) => T)(prev)
    : updater;
}

export const useTaskMutationStore = create<TaskMutationState>((set) => ({
  localTasks: [],
  postedTags: [],
  suppressedNostrEventIds: new Set(),
  failedPublishDrafts: loadFailedPublishDrafts(),

  setLocalTasks: (updater) =>
    set((state) => ({ localTasks: applyUpdater(state.localTasks, updater) })),

  setPostedTags: (updater) =>
    set((state) => ({ postedTags: applyUpdater(state.postedTags, updater) })),

  setSuppressedNostrEventIds: (updater) =>
    set((state) => ({
      suppressedNostrEventIds: applyUpdater(state.suppressedNostrEventIds, updater),
    })),

  setFailedPublishDrafts: (updater) =>
    set((state) => ({
      failedPublishDrafts: applyUpdater(state.failedPublishDrafts, updater),
    })),
}));

useTaskMutationStore.subscribe((state, prevState) => {
  if (state.failedPublishDrafts !== prevState.failedPublishDrafts) {
    saveFailedPublishDrafts(state.failedPublishDrafts);
  }
});
