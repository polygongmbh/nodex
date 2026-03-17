import { useState, useCallback, useEffect, useRef } from "react";
import type { TFunction } from "i18next";
import type { Task, TaskStatus } from "@/types";
import type { Person } from "@/types";
import { applyTaskStatusUpdate, cycleTaskStatus } from "@/domain/content/task-status";
import { canUserChangeTaskStatus } from "@/domain/content/task-permissions";
import { notifyStatusRestricted } from "@/lib/notifications";
import { triggerTaskCompletionCheer } from "@/lib/completion-cheer";
import { playCompletionPopSound } from "@/lib/completion-feedback";
import {
  loadCompletionSoundEnabled,
  saveCompletionSoundEnabled,
} from "@/infrastructure/preferences/user-preferences-storage";

const TASK_STATUS_REORDER_DELAY_MS = 260;

export interface UseTaskStatusControllerOptions {
  allTasks: Task[];
  currentUser: Person | undefined;
  guardInteraction: (mode: "post" | "modify") => boolean;
  publishTaskStateUpdate: (taskId: string, status: TaskStatus) => Promise<unknown>;
  setLocalTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  t: TFunction;
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
  setLocalTasks,
  t,
}: UseTaskStatusControllerOptions): UseTaskStatusControllerResult {
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
        pendingTaskStatusesRef.current.get(taskId) ?? existingTask?.status ?? "todo";
      pendingTaskStatusesRef.current.set(taskId, status);
      setSortStatusHoldByTaskId((previous) => ({ ...previous, [taskId]: currentStatus }));
      if (existingTask) {
        const currentSortDate = existingTask.lastEditedAt || existingTask.timestamp;
        setSortModifiedAtHoldByTaskId((previous) => ({
          ...previous,
          [taskId]: currentSortDate.toISOString(),
        }));
      }

      const timeoutId = window.setTimeout(() => {
        setLocalTasks((previous) =>
          applyTaskStatusUpdate(previous, allTasks, taskId, status, currentUser?.name)
        );
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
        notifyStatusRestricted(t);
        return;
      }
      const currentStatus =
        pendingTaskStatusesRef.current.get(taskId) ?? existingTask.status ?? "todo";
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
      t,
      triggerCompletionFeedback,
    ]
  );

  const handleStatusChange = useCallback(
    (taskId: string, newStatus: TaskStatus) => {
      if (guardInteraction("modify")) return;

      const existingTask = allTasks.find((task) => task.id === taskId);
      if (!existingTask) return;
      if (!canUserChangeTaskStatus(existingTask, currentUser)) {
        notifyStatusRestricted(t);
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
      t,
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
