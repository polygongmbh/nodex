import { create } from "zustand";

interface PendingPublishState {
  isPendingPublishTask: (taskId: string) => boolean;
  setPendingPublishPredicate: (predicate: (taskId: string) => boolean) => void;
}

const never = () => false;

/**
 * A predicate over task ids: is this task currently in the publish queue
 * (optimistic UI hint). Owner: `useTaskPublishFlow` (at Index) pushes the
 * predicate every time the flow's local state changes; leaves
 * (TreeTaskItem, KanbanTaskCard, FeedTaskCard, …) read via
 * `useIsPendingPublishTask()`.
 */
export const usePendingPublishStore = create<PendingPublishState>((set) => ({
  isPendingPublishTask: never,
  setPendingPublishPredicate: (predicate) => set({ isPendingPublishTask: predicate }),
}));

export const useIsPendingPublishTask = () =>
  usePendingPublishStore((s) => s.isPendingPublishTask);
