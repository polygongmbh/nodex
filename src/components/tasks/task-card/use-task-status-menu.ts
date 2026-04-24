import { useCallback, useRef, useState, type FocusEvent, type MouseEvent, type PointerEvent } from "react";
import { canUserChangeTaskStatus, getTaskStatusChangeBlockedReason } from "@/domain/content/task-permissions";
import { shouldAutoOpenStatusMenuOnFocus } from "@/lib/status-menu-focus";
import { handleTaskStatusToggleClick, shouldOpenStatusMenuForDirectSelection } from "@/lib/task-status-toggle";
import { resolveTaskStateDefinition } from "@/domain/task-states/task-state-config";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { useTaskViewServices } from "@/components/tasks/use-task-view-services";
import type { Task } from "@/types";
import type { Person } from "@/types/person";

interface UseTaskStatusMenuOptions {
  task: Task;
  currentUser?: Person;
  people: Person[];
  isInteractionBlocked?: boolean;
  getStatusToggleHint: (status?: Task["status"]) => string;
  focusOnQuickToggle?: boolean;
}

export function useTaskStatusMenu({
  task,
  currentUser,
  people,
  isInteractionBlocked = false,
  getStatusToggleHint,
  focusOnQuickToggle = true,
}: UseTaskStatusMenuOptions) {
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const { focusTask } = useTaskViewServices();
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const statusTriggerPointerDownRef = useRef(false);
  const allowStatusMenuOpenRef = useRef(false);
  const statusMenuOpenedOnPointerDownRef = useRef(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);
  const canCompleteTask = !isInteractionBlocked && canUserChangeTaskStatus(task, currentUser);
  const statusButtonTitle = canCompleteTask
    ? getStatusToggleHint(task.status)
    : getTaskStatusChangeBlockedReason(task, currentUser, isInteractionBlocked, people) || getStatusToggleHint(task.status);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const openStatusMenu = useCallback(() => {
    allowStatusMenuOpenRef.current = true;
    setStatusMenuOpen(true);
  }, []);

  const closeStatusMenu = useCallback(() => {
    allowStatusMenuOpenRef.current = false;
    statusMenuOpenedOnPointerDownRef.current = false;
    setStatusMenuOpen(false);
  }, []);

  const dispatchStatusChange = useCallback(
    (stateId: string) => {
      const state = resolveTaskStateDefinition(stateId);
      void dispatchFeedInteraction({
        type: "task.changeStatus",
        taskId: task.id,
        status: state.id === state.type ? { type: state.type } : { type: state.type, description: state.label },
      });
    },
    [dispatchFeedInteraction, task.id]
  );

  const dispatchToggleComplete = useCallback(() => {
    void dispatchFeedInteraction({ type: "task.toggleComplete", taskId: task.id });
  }, [dispatchFeedInteraction, task.id]);

  const triggerProps = {
    onClick: (event: MouseEvent<HTMLElement>) => {
      if (!canCompleteTask) return;
      if (longPressFiredRef.current) {
        longPressFiredRef.current = false;
        statusMenuOpenedOnPointerDownRef.current = false;
        event.stopPropagation();
        event.preventDefault();
        return;
      }
      if (statusMenuOpenedOnPointerDownRef.current) {
        statusMenuOpenedOnPointerDownRef.current = false;
        event.stopPropagation();
        return;
      }
      handleTaskStatusToggleClick(event, {
        status: task.status,
        hasStatusChangeHandler: canCompleteTask,
        isMenuOpen: statusMenuOpen,
        openMenu: () => {
          allowStatusMenuOpenRef.current = true;
          setStatusMenuOpen(true);
        },
        closeMenu: closeStatusMenu,
        allowMenuOpen: () => {
          allowStatusMenuOpenRef.current = true;
        },
        clearMenuOpenIntent: () => {
          allowStatusMenuOpenRef.current = false;
        },
        toggleStatus: dispatchToggleComplete,
        focusTask: () => focusTask(task.id),
        focusOnQuickToggle,
      });
    },
    onFocus: (event: FocusEvent<HTMLElement>) => {
      if (!canCompleteTask) return;
      if (shouldAutoOpenStatusMenuOnFocus(event.currentTarget, statusTriggerPointerDownRef.current)) {
        allowStatusMenuOpenRef.current = true;
        setStatusMenuOpen(true);
      }
      statusTriggerPointerDownRef.current = false;
    },
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      statusTriggerPointerDownRef.current = true;
      allowStatusMenuOpenRef.current = false;
      statusMenuOpenedOnPointerDownRef.current = false;
      longPressFiredRef.current = false;
      clearLongPressTimer();
      if (!canCompleteTask) return;
      if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        longPressFiredRef.current = true;
        statusMenuOpenedOnPointerDownRef.current = true;
        allowStatusMenuOpenRef.current = true;
        setStatusMenuOpen(true);
      }, 450);
    },
    onPointerMove: () => {
      if (longPressTimerRef.current !== null) {
        clearLongPressTimer();
      }
    },
    onPointerUp: () => {
      clearLongPressTimer();
    },
    onPointerCancel: () => {
      clearLongPressTimer();
      longPressFiredRef.current = false;
    },
    onPointerLeave: () => {
      clearLongPressTimer();
    },
    onContextMenu: (event: MouseEvent<HTMLElement>) => {
      if (longPressFiredRef.current) {
        event.preventDefault();
      }
    },
    onPointerDownCapture: (event: PointerEvent<HTMLElement>) => {
      if (!canCompleteTask) return;
      if (
        shouldOpenStatusMenuForDirectSelection({
          status: task.status,
          altKey: event.altKey,
          hasStatusChangeHandler: canCompleteTask,
        })
      ) {
        event.preventDefault();
        allowStatusMenuOpenRef.current = true;
        statusMenuOpenedOnPointerDownRef.current = true;
        setStatusMenuOpen(true);
      }
    },
    onBlur: () => {
      statusTriggerPointerDownRef.current = false;
      allowStatusMenuOpenRef.current = false;
      statusMenuOpenedOnPointerDownRef.current = false;
      clearLongPressTimer();
    },
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      closeStatusMenu();
      return;
    }
    if (allowStatusMenuOpenRef.current) {
      setStatusMenuOpen(true);
    } else {
      setStatusMenuOpen(false);
    }
    allowStatusMenuOpenRef.current = false;
    statusMenuOpenedOnPointerDownRef.current = false;
  };

  return {
    canCompleteTask,
    statusMenuOpen,
    statusButtonTitle,
    triggerProps,
    handleOpenChange,
    dispatchStatusChange,
    focusTask,
  };
}
