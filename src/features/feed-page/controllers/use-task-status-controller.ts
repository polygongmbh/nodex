import { useState, useCallback, useEffect, useRef } from "react";
import type { Task, TaskStatus } from "@/types";
import { getLastEditedAt } from "@/types";
import type { Person } from "@/types/person";
import { applyTaskStatusUpdate, cycleTaskStatus } from "@/domain/content/task-status";
import { canUserChangeTaskStatus } from "@/domain/content/task-permissions";
import { notifyStatusRestricted } from "@/lib/notifications";
import { triggerTaskCompletionCheer } from "@/lib/completion-cheer";
import { playCompletionPopSound } from "@/lib/completion-feedback";
import {
  loadCompletionSoundEnabled,
  saveCompletionSoundEnabled,
} from "@/infrastructure/preferences/user-preferences-storage";
import { useFeedTaskMutationStore } from "@/features/feed-page/stores/feed-task-mutation-store";

const TASK_STATUS_REORDER_DELAY_MS = 260;

export interface UseTaskStatusControllerOptions {
  allTasks: Task[];
  currentUser: Person | undefined;
  guardInteraction: (mode: "post" | "modify") => boolean;
  publishTaskStateUpdate: (taskId: string, status: TaskStatus) => Promise<unknown>;
}

export interface UseTaskStatusControllerResult {
  completionSoundEnabled: boolean;
  handleToggleCompletionSound: () => void;
  handleToggleComplete: (taskId: string) => void;
  handleStatusChange: (taskId: string, newStatus: TaskStatus) => void;
  sortStatusHoldByTaskId: Record<string, TaskStatus>;
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
    (taskId: string, status: TaskStatus) => {
      clearPendingStatusUpdate(taskId);
      const existingTask = allTasks.find((task) => task.id === taskId);
      const currentStatus =
        pendingTaskStatusesRef.current.get(taskId) ?? existingTask?.status ?? "open";
      pendingTaskStatusesRef.current.set(taskId, status);
      setSortStatusHoldByTaskId((previous) => ({ ...previous, [taskId]: currentStatus }));
      if (existingTask) {
        const currentSortDate = getLastEditedAt(existingTask);
        setSortModifiedAtHoldByTaskId((previous) => ({
          ...previous,
          [taskId]: currentSortDate.toISOString(),
        }));
      }

      setLocalTasks((previous) =>
        applyTaskStatusUpdate(previous, allTasks, taskId, status, currentUser?.name)
      );

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
    [allTasks, clearPendingStatusUpdate, currentUser?.name, setLocalTasks]
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
        pendingTaskStatusesRef.current.get(taskId) ?? existingTask.status ?? "open";
      const nextStatus = cycleTaskStatus(currentStatus);
      scheduleTaskStatusReorderUpdate(taskId, nextStatus);
      triggerCompletionFeedback(taskId, nextStatus);
      void publishTaskStateUpdate(taskId, nextStatus);
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
    (taskId: string, newStatus: TaskStatus) => {
      if (guardInteraction("modify")) return;

      const existingTask = allTasks.find((task) => task.id === taskId);
      if (!existingTask) return;
      if (!canUserChangeTaskStatus(existingTask, currentUser)) {
        notifyStatusRestricted();
        return;
      }

      scheduleTaskStatusReorderUpdate(taskId, newStatus);
      triggerCompletionFeedback(taskId, newStatus);
      void publishTaskStateUpdate(taskId, newStatus);
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
