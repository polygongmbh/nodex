import { useState, useCallback, useEffect, useRef } from "react";
import type { Task, TaskStatus, TaskStatusType } from "@/types";
import { getLastEditedAt, getTaskStatusType, normalizeTaskStatus } from "@/types";
import type { Person } from "@/types/person";
import { applyTaskStatusUpdate, isTaskTerminalStatus } from "@/domain/content/task-status";
import { canUserChangeTaskStatus } from "@/domain/content/task-permissions";
import { getQuickToggleNextState } from "@/domain/task-states/task-state-config";
import { notifyStatusRestricted } from "@/lib/notifications";
import { triggerTaskCompletionCheer } from "@/lib/completion-cheer";
import { playCompletionPopSound } from "@/lib/completion-feedback";
import {
  loadCompletionSoundEnabled,
  saveCompletionSoundEnabled,
} from "@/infrastructure/preferences/user-preferences-storage";
import { useFeedTaskMutationStore } from "@/features/feed-page/stores/feed-task-mutation-store";
import { useIsMobile } from "@/hooks/use-mobile";

const TASK_STATUS_REORDER_DELAY_MS = 260;

export interface UseTaskStatusControllerOptions {
  allTasks: Task[];
  currentUser: Person | undefined;
  guardInteraction: (mode: "post" | "modify") => boolean;
  publishTaskStateUpdate: (taskId: string, status: TaskStatus, relayUrls?: string[]) => Promise<unknown>;
}

export interface UseTaskStatusControllerResult {
  completionSoundEnabled: boolean;
  handleToggleCompletionSound: () => void;
  handleToggleComplete: (taskId: string) => void;
  handleStatusChange: (taskId: string, status: TaskStatus) => void;
  sortStatusHoldByTaskId: Record<string, TaskStatusType>;
  sortModifiedAtHoldByTaskId: Record<string, string>;
}

export function useTaskStatusController({
  allTasks,
  currentUser,
  guardInteraction,
  publishTaskStateUpdate,
}: UseTaskStatusControllerOptions): UseTaskStatusControllerResult {
  const setLocalTasks = useFeedTaskMutationStore((s) => s.setLocalTasks);
  const [completionSoundEnabled, setCompletionSoundEnabled] = useState(() =>
    loadCompletionSoundEnabled()
  );
  const [sortStatusHoldByTaskId, setSortStatusHoldByTaskId] = useState<
    Record<string, TaskStatusType>
  >({});
  const [sortModifiedAtHoldByTaskId, setSortModifiedAtHoldByTaskId] = useState<
    Record<string, string>
  >({});

  const pendingStatusUpdateTimeoutsRef = useRef<Map<string, number>>(new Map());
  const pendingTaskStatusesRef = useRef<Map<string, TaskStatusType>>(new Map());
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

  const handleToggleCompletionSound = useCallback(() => {
    setCompletionSoundEnabled((previous) => {
      const next = !previous;
      saveCompletionSoundEnabled(next);
      return next;
    });
  }, []);

  const clearPendingStatusUpdate = useCallback((taskId: string) => {
    const timeoutId = pendingStatusUpdateTimeoutsRef.current.get(taskId);
    if (timeoutId === undefined) return;
    window.clearTimeout(timeoutId);
    pendingStatusUpdateTimeoutsRef.current.delete(taskId);
  }, []);

  const scheduleTaskStatusReorderUpdate = useCallback(
    (taskId: string, status: TaskStatusType) => {
      clearPendingStatusUpdate(taskId);
      const existingTask = allTasks.find((task) => task.id === taskId);
      const currentStatus =
        pendingTaskStatusesRef.current.get(taskId) ?? getTaskStatusType(existingTask?.status) ?? "open";
      pendingTaskStatusesRef.current.set(taskId, status);
      setSortStatusHoldByTaskId((previous) => ({ ...previous, [taskId]: currentStatus }));
      if (existingTask) {
        const currentSortDate = getLastEditedAt(existingTask);
        setSortModifiedAtHoldByTaskId((previous) => ({
          ...previous,
          [taskId]: currentSortDate.toISOString(),
        }));
      }

      setLocalTasks((previous) => applyTaskStatusUpdate(previous, allTasks, taskId, status));

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
    (taskId: string, status: TaskStatusType) => {
      if (status !== "done") return;
      triggerCompletionCheer(taskId);
      playCompletionPopSound(completionSoundEnabled);
    },
    [completionSoundEnabled, triggerCompletionCheer]
  );

  const handleToggleComplete = useCallback(
    (taskId: string) => {
      if (guardInteraction("modify")) return;

      const existingTask = allTasks.find((task) => task.id === taskId);
      if (!existingTask) return;
      if (!canUserChangeTaskStatus(existingTask, currentUser)) {
        notifyStatusRestricted();
        return;
      }
      const currentStatus =
        pendingTaskStatusesRef.current.get(taskId) ?? getTaskStatusType(existingTask.status) ?? "open";
      if (isTaskTerminalStatus(currentStatus)) return;
      const nextStatus = getQuickToggleNextState(currentStatus);
      if (nextStatus === null) return;
      scheduleTaskStatusReorderUpdate(taskId, nextStatus);
      triggerCompletionFeedback(taskId, nextStatus);
      void publishTaskStateUpdate(taskId, { type: nextStatus });
    },
    [
      allTasks,
      currentUser,
      guardInteraction,
      publishTaskStateUpdate,
      scheduleTaskStatusReorderUpdate,
      triggerCompletionFeedback,
    ]
  );

  const handleStatusChange = useCallback(
    (taskId: string, status: TaskStatus) => {
      if (guardInteraction("modify")) return;

      const existingTask = allTasks.find((task) => task.id === taskId);
      if (!existingTask) return;
      if (!canUserChangeTaskStatus(existingTask, currentUser)) {
        notifyStatusRestricted();
        return;
      }

      const normalizedStatus = normalizeTaskStatus(status);
      const resolvedType = normalizedStatus.type as TaskStatusType;

      scheduleTaskStatusReorderUpdate(taskId, resolvedType);
      triggerCompletionFeedback(taskId, resolvedType);
      void publishTaskStateUpdate(taskId, normalizedStatus);
    },
    [
      allTasks,
      currentUser,
      guardInteraction,
      publishTaskStateUpdate,
      scheduleTaskStatusReorderUpdate,
      triggerCompletionFeedback,
    ]
  );

  return {
    completionSoundEnabled,
    handleToggleCompletionSound,
    handleToggleComplete,
    handleStatusChange,
    sortStatusHoldByTaskId,
    sortModifiedAtHoldByTaskId,
  };
}
