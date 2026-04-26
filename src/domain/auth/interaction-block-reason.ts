import { canUserUpdateTask, getTaskStatusChangeBlockedReason } from "@/domain/content/task-permissions";
import {
  notifyDisconnectedSelectedFeeds,
  notifyNeedSigninModify,
  notifyNeedWritableRelay,
  notifyTaskActionBlocked,
} from "@/lib/notifications";
import type { Task } from "@/types";
import type { Person } from "@/types/person";

export type InteractionBlockKind =
  | "needsSignin"
  | "needsWritableRelay"
  | "disconnectedSelectedFeeds"
  | "needsPermission";

export interface InteractionBlockFeedback {
  kind: InteractionBlockKind;
  /** Surfaces a user-visible toast describing the block. */
  notify: () => void;
}

export interface ResolveInteractionBlockInput {
  isSignedIn: boolean;
  hasWritableRelayConnection: boolean;
  hasDisconnectedSelectedFeeds: boolean;
}

/**
 * Resolves the appropriate user feedback when a global interaction gate
 * (sign-in, writable relay, disconnected selected feeds) is blocking an
 * action. Returns null when no global gate applies — caller should then
 * check task-specific permissions via `resolveTaskInteractionBlock`.
 */
export function resolveInteractionBlock(
  input: ResolveInteractionBlockInput,
): InteractionBlockFeedback | null {
  if (!input.isSignedIn) {
    return { kind: "needsSignin", notify: notifyNeedSigninModify };
  }
  if (!input.hasWritableRelayConnection) {
    return { kind: "needsWritableRelay", notify: notifyNeedWritableRelay };
  }
  if (input.hasDisconnectedSelectedFeeds) {
    return { kind: "disconnectedSelectedFeeds", notify: notifyDisconnectedSelectedFeeds };
  }
  return null;
}

export interface ResolveTaskInteractionBlockInput extends ResolveInteractionBlockInput {
  task: Task;
  currentUser?: Person;
  knownPeople?: Person[];
}

/**
 * Resolves feedback for a task-scoped interaction (e.g. status toggle,
 * priority change). Falls through to the per-task permission reason when
 * global gates pass but the user can't update this specific task.
 */
export function resolveTaskInteractionBlock(
  input: ResolveTaskInteractionBlockInput,
): InteractionBlockFeedback | null {
  const global = resolveInteractionBlock(input);
  if (global) return global;
  if (canUserUpdateTask(input.task, input.currentUser)) return null;
  const reason = getTaskStatusChangeBlockedReason(
    input.task,
    input.currentUser,
    false,
    input.knownPeople ?? [],
  );
  return {
    kind: "needsPermission",
    notify: () => notifyTaskActionBlocked(reason),
  };
}
