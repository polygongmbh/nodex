import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { canUserChangeTaskStatus, getTaskStatusChangeBlockedReason } from "@/domain/content/task-permissions";
import { handleTaskStatusToggleClick, shouldOpenStatusMenuForDirectSelection } from "@/lib/task-status-toggle";
import { resolveTaskStateDefinition } from "@/domain/task-states/task-state-config";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { useTaskViewServices } from "@/components/tasks/use-task-view-services";
import { notifyTaskActionBlocked } from "@/lib/notifications";
import type { Post, TaskState } from "@/types";
import { getTaskState } from "@/types";
import type { Person } from "@/types/person";

interface UseTaskStatusMenuOptions {
  task: Post;
  currentUser?: Person;
  people: Person[];
  isInteractionBlocked?: boolean;
  /**
   * Called when a tap on the (soft-disabled) status control should surface
   * feedback because a global gate (sign-in, writable relay, disconnected
   * selected feeds) is active. When omitted, falls back to the per-task
   * permission reason via a toast.
   */
  onBlockedInteractionAttempt?: () => void;
  getStatusToggleHint: (status?: TaskState) => string;
  focusOnQuickToggle?: boolean;
}

export function useTaskStatusMenu({
  task,
  currentUser,
  people,
  isInteractionBlocked = false,
  onBlockedInteractionAttempt,
  getStatusToggleHint,
  focusOnQuickToggle = true,
}: UseTaskStatusMenuOptions) {
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const { focusTask } = useTaskViewServices();
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const statusTriggerPointerDownRef = useRef(false);
  const allowStatusMenuOpenRef = useRef(false);
  const statusMenuOpenedFromKeyboardRef = useRef(false);
  const statusMenuOpenedOnPointerDownRef = useRef(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);
  const currentItemRef = useRef<HTMLDivElement | null>(null);
  // Focus the current state on open so keyboard users land on a sensible
  // default. A stable ref (not an inline callback) is required — passing a
  // fresh arrow function each render makes React re-invoke the ref after
  // every parent render, which would steal focus back from any option the
  // user has navigated to with arrows or pointer.
  useEffect(() => {
    if (!statusMenuOpen) return;
    const handle = requestAnimationFrame(() => currentItemRef.current?.focus());
    return () => cancelAnimationFrame(handle);
  }, [statusMenuOpen]);
  const canCompleteTask = !isInteractionBlocked && canUserChangeTaskStatus(task, currentUser);
  const blockedReason = getTaskStatusChangeBlockedReason(task, currentUser, isInteractionBlocked, people);
  const statusButtonTitle = canCompleteTask
    ? getStatusToggleHint(getTaskState(task))
    : blockedReason || getStatusToggleHint(getTaskState(task));

  const surfaceBlockedFeedback = useCallback(() => {
    if (isInteractionBlocked && onBlockedInteractionAttempt) {
      onBlockedInteractionAttempt();
      return;
    }
    notifyTaskActionBlocked(blockedReason);
  }, [blockedReason, isInteractionBlocked, onBlockedInteractionAttempt]);


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
    statusMenuOpenedFromKeyboardRef.current = false;
    statusMenuOpenedOnPointerDownRef.current = false;
    setStatusMenuOpen(false);
  }, []);

  const dispatchStatusChange = useCallback(
    (stateId: string) => {
      const state = resolveTaskStateDefinition(stateId);
      void dispatchFeedInteraction({
        type: "task.changeStatus",
        taskId: task.id,
        state: state.id === state.status ? { status: state.status } : { status: state.status, description: state.label },
      });
    },
    [dispatchFeedInteraction, task.id]
  );

  const dispatchToggleComplete = useCallback(() => {
    void dispatchFeedInteraction({ type: "task.toggleComplete", taskId: task.id });
  }, [dispatchFeedInteraction, task.id]);

  const triggerProps = {
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (!canCompleteTask) return;
      if (event.key !== "Enter" && event.key !== " " && event.key !== "ArrowDown") return;
      event.preventDefault();
      event.stopPropagation();
      allowStatusMenuOpenRef.current = true;
      statusMenuOpenedFromKeyboardRef.current = true;
      setStatusMenuOpen(true);
    },
    onClick: (event: MouseEvent<HTMLElement>) => {
      if (!canCompleteTask) {
        event.stopPropagation();
        event.preventDefault();
        surfaceBlockedFeedback();
        return;
      }
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
      if (statusMenuOpenedFromKeyboardRef.current) {
        statusMenuOpenedFromKeyboardRef.current = false;
        event.stopPropagation();
        event.preventDefault();
        return;
      }
      // Keyboard-activated click (Space/Enter): event.detail === 0. Open the
      // status menu so keyboard users can pick a state, instead of running the
      // pointer toggle path which would close whatever Radix just opened.
      if (event.detail === 0) {
        event.stopPropagation();
        event.preventDefault();
        allowStatusMenuOpenRef.current = true;
        setStatusMenuOpen(true);
        return;
      }
      handleTaskStatusToggleClick(event, {
        status: getTaskState(task),
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
    onFocus: () => {
      // Tab focus must not auto-open the status menu — keyboard users open it
      // explicitly via Space/Enter/ArrowDown (handled by Radix on the trigger).
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
          status: getTaskState(task),
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
      statusMenuOpenedFromKeyboardRef.current = false;
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
    statusMenuOpenedFromKeyboardRef.current = false;
    statusMenuOpenedOnPointerDownRef.current = false;
  };

  return {
    canCompleteTask,
    statusMenuOpen,
    statusButtonTitle,
    triggerProps,
    handleOpenChange,
    dispatchStatusChange,
    currentItemRef,
    focusTask,
  };
}
