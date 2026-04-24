import { useCallback, useRef, useState, type FocusEvent, type MouseEvent, type PointerEvent } from "react";
import { canUserChangeTaskStatus, getTaskStatusChangeBlockedReason } from "@/domain/content/task-permissions";
import { shouldAutoOpenStatusMenuOnFocus } from "@/lib/status-menu-focus";
import { handleTaskStatusToggleClick, shouldOpenStatusMenuForDirectSelection } from "@/lib/task-status-toggle";
import { resolveTaskStateDefinition } from "@/domain/task-states/task-state-config";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { useTaskViewServices } from "@/components/tasks/use-task-view-services";
import { useIsMobile } from "@/hooks/use-mobile";
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
  const isMobile = useIsMobile();
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const statusTriggerPointerDownRef = useRef(false);
  const allowStatusMenuOpenRef = useRef(false);
  const statusMenuOpenedOnPointerDownRef = useRef(false);
  const canCompleteTask = !isInteractionBlocked && canUserChangeTaskStatus(task, currentUser);
  const statusButtonTitle = canCompleteTask
    ? getStatusToggleHint(task.status)
    : getTaskStatusChangeBlockedReason(task, currentUser, isInteractionBlocked, people) || getStatusToggleHint(task.status);

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
        focusOnQuickToggle: focusOnQuickToggle && !isMobile,
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
    onPointerDown: () => {
      statusTriggerPointerDownRef.current = true;
      allowStatusMenuOpenRef.current = false;
      statusMenuOpenedOnPointerDownRef.current = false;
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
