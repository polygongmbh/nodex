import type { MouseEvent } from "react";
import type { TaskStatus } from "@/types";
import { isTaskTerminalStatus } from "@/domain/content/task-status";
import { getQuickToggleNextState, getTaskStateUiType } from "@/domain/task-states/task-state-config";

interface HandleTaskStatusToggleClickOptions {
  status?: TaskStatus;
  hasStatusChangeHandler: boolean;
  isMenuOpen: boolean;
  openMenu: () => void;
  closeMenu: () => void;
  allowMenuOpen: () => void;
  clearMenuOpenIntent: () => void;
  toggleStatus: () => void;
  focusTask?: () => void;
  focusOnQuickToggle?: boolean;
}

interface StatusMenuIntentOptions {
  status?: TaskStatus;
  altKey: boolean;
  hasStatusChangeHandler: boolean;
}

export function shouldOpenStatusMenuForDirectSelection({
  status,
  altKey,
  hasStatusChangeHandler,
}: StatusMenuIntentOptions): boolean {
  return hasStatusChangeHandler && (isTaskTerminalStatus(status) || altKey);
}

export function handleTaskStatusToggleClick(
  event: MouseEvent<HTMLElement>,
  {
    status,
    hasStatusChangeHandler,
    isMenuOpen,
    openMenu,
    closeMenu,
    allowMenuOpen,
    clearMenuOpenIntent,
    toggleStatus,
    focusTask,
    focusOnQuickToggle = true,
  }: HandleTaskStatusToggleClickOptions
): void {
  event.stopPropagation();

  if (
    shouldOpenStatusMenuForDirectSelection({
      status,
      altKey: event.altKey,
      hasStatusChangeHandler,
    })
  ) {
    if (isMenuOpen) {
      closeMenu();
      clearMenuOpenIntent();
    } else {
      allowMenuOpen();
      openMenu();
    }
    return;
  }

  closeMenu();
  clearMenuOpenIntent();
  toggleStatus();

  // Focus the task when quick-toggling to an active state
  if (focusOnQuickToggle && !event.altKey) {
    const nextState = getQuickToggleNextState(status);
    if (nextState !== null && getTaskStateUiType(nextState) === "active") {
      focusTask?.();
    }
  }
}
