import { useState, useCallback, useEffect, useRef } from "react";
import type { Task, TaskState, TaskStatus } from "@/types";
import { getLastEditedAt, getTaskStatus, normalizeTaskState } from "@/types";
import type { Person } from "@/types/person";
import { applyTaskStateUpdate, isTaskTerminal } from "@/domain/content/task-state";
import { canUserChangeTaskStatus } from "@/domain/content/task-permissions";
import {
  getDefaultStateForStatus,
  toTaskStateFromDefinition,
} from "@/domain/task-states/task-state-config";
import { notifyStatusRestricted } from "@/lib/notifications";
import { triggerTaskCompletionCheer } from "@/lib/completion-cheer";
import { playCompletionPopSound } from "@/lib/completion-feedback";
import { useTaskMutationStore } from "@/features/feed-page/stores/task-mutation-store";
import { usePreferencesStore } from "@/features/feed-page/stores/preferences-store";
import { useIsMobile } from "@/hooks/use-mobile";

const TASK_STATUS_REORDER_DELAY_MS = 260;

export interface UseTaskStatusControllerOptions {
  allTasks: Task[];
  currentUser: Person | undefined;
  guardInteraction: (mode: "post" | "modify") => boolean;
  publishTaskStateUpdate: (taskId: string, status: TaskState, relayUrls?: string[]) => Promise<unknown>;
}

export interface UseTaskStatusControllerResult {
  handleToggleComplete: (taskId: string) => void;
  handleStatusChange: (taskId: string, status: TaskState) => void;
  sortStatusHoldByTaskId: Record<string, TaskStatus>;
  sortModifiedAtHoldByTaskId: Record<string, string>;
}

export function useTaskStatusController({
  allTasks,
  currentUser,
  guardInteraction,
  publishTaskStateUpdate,
}: UseTaskStatusControllerOptions): UseTaskStatusControllerResult {
  const setLocalTasks = useTaskMutationStore((s) => s.setLocalTasks);
  const completionSoundEnabled = usePreferencesStore((s) => s.completionSoundEnabled);
  const isMobile = useIsMobile();
  const [sortStatusHoldByTaskId, setSortStatusHoldByTaskId] = useState<
    Record<string, TaskStatus>
  >({});
  const [sortModifiedAtHoldByTaskId, setSortModifiedAtHoldByTaskId] = useState<
    Record<string, string>
  >({});

  const pendingStatusUpdateTimeoutsRef = useRef<Map<string, number>>(new Map());
  const pendingTaskStatusesRef = useRef<Map<string, TaskStatus>>(new Map());
  const completionConfettiLastAtRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const pendingTimeouts = pendingStatusUpdateTimeoutsRef.current;
    const pendingStatuses = pendingTaskStatusesRef.current;
    return () => {
      for (const timeoutId of pendingTimeouts.values()) {
        window.clearTimeout(timeoutId);
      }
      pendingTimeouts.clear();
      pendingStatuses.clear();
      setSortStatusHoldByTaskId({});
      setSortModifiedAtHoldByTaskId({});
    };
  }, []);

  const clearPendingStatusUpdate = useCallback((taskId: string) => {
    const timeoutId = pendingStatusUpdateTimeoutsRef.current.get(taskId);
    if (timeoutId === undefined) return;
    window.clearTimeout(timeoutId);
    pendingStatusUpdateTimeoutsRef.current.delete(taskId);
  }, []);

  const scheduleTaskStatusReorderUpdate = useCallback(
    (taskId: string, status: TaskState) => {
      clearPendingStatusUpdate(taskId);
      const existingTask = allTasks.find((task) => task.id === taskId);
      const currentStatus =
        pendingTaskStatusesRef.current.get(taskId) ?? getTaskStatus(existingTask?.state) ?? "open";
      pendingTaskStatusesRef.current.set(taskId, status.status);
      setSortStatusHoldByTaskId((previous) => ({ ...previous, [taskId]: currentStatus }));
      if (existingTask) {
        const currentSortDate = getLastEditedAt(existingTask);
        setSortModifiedAtHoldByTaskId((previous) => ({
          ...previous,
          [taskId]: currentSortDate.toISOString(),
        }));
      }

      setLocalTasks((previous) => applyTaskStateUpdate(previous, allTasks, taskId, status));

      const timeoutId = window.setTimeout(() => {
        pendingTaskStatusesRef.current.delete(taskId);
        pendingStatusUpdateTimeoutsRef.current.delete(taskId);
        setSortStatusHoldByTaskId((previous) => {
          const next = { ...previous };
          delete next[taskId];
          return next;
        });
        setSortModifiedAtHoldByTaskId((previous) => {
          const next = { ...previous };
          delete next[taskId];
          return next;
        });
      }, TASK_STATUS_REORDER_DELAY_MS);

      pendingStatusUpdateTimeoutsRef.current.set(taskId, timeoutId);
    },
    [allTasks, clearPendingStatusUpdate, setLocalTasks]
  );

  const triggerCompletionCheer = useCallback((taskId: string) => {
    triggerTaskCompletionCheer(taskId, completionConfettiLastAtRef.current);
  }, []);

  const triggerCompletionFeedback = useCallback(
    (taskId: string, status: TaskStatus) => {
      if (status !== "done") return;
      triggerCompletionCheer(taskId);
      playCompletionPopSound(completionSoundEnabled);
    },
    [completionSoundEnabled, triggerCompletionCheer]
  );

  const cascadeActiveToOpenAncestors = useCallback(
    (childTaskId: string, status: TaskState) => {
      if (status.status !== "active") return;
      const visited = new Set<string>([childTaskId]);
      let cursorId: string | undefined = childTaskId;
      while (cursorId) {
        const cursor = allTasks.find((task) => task.id === cursorId);
        const parentId = cursor?.parentId;
        if (!parentId || visited.has(parentId)) break;
        visited.add(parentId);
        cursorId = parentId;

        const parentTask = allTasks.find((task) => task.id === parentId);
        if (!parentTask) continue;
        const parentCurrentType =
          pendingTaskStatusesRef.current.get(parentId) ??
          getTaskStatus(parentTask.state) ??
          "open";
        if (parentCurrentType !== "open") continue;
        if (!canUserChangeTaskStatus(parentTask, currentUser)) continue;

        scheduleTaskStatusReorderUpdate(parentId, status);
        void publishTaskStateUpdate(parentId, status);
      }
    },
    [allTasks, currentUser, publishTaskStateUpdate, scheduleTaskStatusReorderUpdate]
  );

  const resolveAuthorizedTask = useCallback(
    (taskId: string): Task | undefined => {
      if (guardInteraction("modify")) return undefined;
      const existingTask = allTasks.find((task) => task.id === taskId);
      if (!existingTask) return undefined;
      if (!canUserChangeTaskStatus(existingTask, currentUser)) {
        notifyStatusRestricted();
        return undefined;
      }
      return existingTask;
    },
    [allTasks, currentUser, guardInteraction]
  );

  const commitTaskStatus = useCallback(
    (taskId: string, status: TaskState) => {
      scheduleTaskStatusReorderUpdate(taskId, status);
      triggerCompletionFeedback(taskId, status.status as TaskStatus);
      void publishTaskStateUpdate(taskId, status);
      cascadeActiveToOpenAncestors(taskId, status);
    },
    [
      cascadeActiveToOpenAncestors,
      publishTaskStateUpdate,
      scheduleTaskStatusReorderUpdate,
      triggerCompletionFeedback,
    ]
  );

  const handleToggleComplete = useCallback(
    (taskId: string) => {
      const existingTask = resolveAuthorizedTask(taskId);
      if (!existingTask) return;
      const currentType =
        pendingTaskStatusesRef.current.get(taskId) ?? getTaskStatus(existingTask.state) ?? "open";
      if (currentType === "done" || currentType === "closed") return;
      const nextType: TaskStatus =
        currentType === "open" && !isMobile ? "active" : "done";
      // Resolve to a configured state definition so custom done states (e.g. "Review")
      // publish as { status: "done", description: "Review" } rather than a synthetic id.
      const nextStateDef = getDefaultStateForStatus(nextType);
      const nextStatus: TaskState = nextStateDef
        ? toTaskStateFromDefinition(nextStateDef)
        : { status: nextType };
      commitTaskStatus(taskId, nextStatus);
    },
    [commitTaskStatus, isMobile, resolveAuthorizedTask]
  );

  const handleStatusChange = useCallback(
    (taskId: string, status: TaskState) => {
      const existingTask = resolveAuthorizedTask(taskId);
      if (!existingTask) return;

      const normalizedStatus = normalizeTaskState(status);
      const currentStatus = normalizeTaskState(existingTask.state);
      if (
        normalizedStatus.status === currentStatus.status &&
        normalizedStatus.description === currentStatus.description
      ) {
        return;
      }

      commitTaskStatus(taskId, normalizedStatus);
    },
    [commitTaskStatus, resolveAuthorizedTask]
  );

  return {
    handleToggleComplete,
    handleStatusChange,
    sortStatusHoldByTaskId,
    sortModifiedAtHoldByTaskId,
  };
}
