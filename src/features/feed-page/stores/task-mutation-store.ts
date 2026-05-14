import type { SetStateAction } from "react";
import { create } from "zustand";
import type { PostedTag, Post } from "@/types";

interface TaskMutationState {
  localTasks: Post[];
  postedTags: PostedTag[];
  suppressedNostrEventIds: Set<string>;

  setLocalTasks: (updater: SetStateAction<Post[]>) => void;
  setPostedTags: (updater: SetStateAction<PostedTag[]>) => void;
  setSuppressedNostrEventIds: (updater: SetStateAction<Set<string>>) => void;
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

  setLocalTasks: (updater) =>
    set((state) => ({ localTasks: applyUpdater(state.localTasks, updater) })),

  setPostedTags: (updater) =>
    set((state) => ({ postedTags: applyUpdater(state.postedTags, updater) })),

  setSuppressedNostrEventIds: (updater) =>
    set((state) => ({
      suppressedNostrEventIds: applyUpdater(state.suppressedNostrEventIds, updater),
    })),
}));
