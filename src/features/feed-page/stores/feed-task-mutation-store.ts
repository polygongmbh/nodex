import type { SetStateAction } from "react";
import { create } from "zustand";
import type { PostedTag, Task } from "@/types";

interface FeedTaskMutationState {
  localTasks: Task[];
  postedTags: PostedTag[];
  suppressedNostrEventIds: Set<string>;

  setLocalTasks: (updater: SetStateAction<Task[]>) => void;
  setPostedTags: (updater: SetStateAction<PostedTag[]>) => void;
  setSuppressedNostrEventIds: (updater: SetStateAction<Set<string>>) => void;
}

function applyUpdater<T>(prev: T, updater: SetStateAction<T>): T {
  return typeof updater === "function"
    ? (updater as (prev: T) => T)(prev)
    : updater;
}

export const useFeedTaskMutationStore = create<FeedTaskMutationState>((set) => ({
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
