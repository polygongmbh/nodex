import { create } from "zustand";

interface InteractionBlockState {
  isInteractionBlocked: boolean;
  onBlockedInteractionAttempt: () => void;
  setInteractionBlock: (value: {
    isInteractionBlocked: boolean;
    onBlockedInteractionAttempt: () => void;
  }) => void;
}

const noop = () => {};

/**
 * Whether the current user can mutate content + the toast/auth-modal
 * callback that fires when a soft-disabled control is tapped.
 *
 * Owner: `useTaskPublishControls` (at Index) pushes; leaves
 * (`KanbanTaskCard`, `TaskStatusToggle`, `StatusMyTasksTree`) read.
 */
export const useInteractionBlockStore = create<InteractionBlockState>((set) => ({
  isInteractionBlocked: false,
  onBlockedInteractionAttempt: noop,
  setInteractionBlock: ({ isInteractionBlocked, onBlockedInteractionAttempt }) =>
    set({ isInteractionBlocked, onBlockedInteractionAttempt }),
}));

export const useIsInteractionBlocked = () =>
  useInteractionBlockStore((s) => s.isInteractionBlocked);

export const useBlockedInteractionAttemptHandler = () =>
  useInteractionBlockStore((s) => s.onBlockedInteractionAttempt);
