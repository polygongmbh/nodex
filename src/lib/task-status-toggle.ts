import type { MouseEvent } from "react";
import type { TaskStatus } from "@/types";
import { cycleTaskStatus, isTaskTerminalStatus } from "@/lib/task-status";

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

  if (focusOnQuickToggle && !event.altKey && cycleTaskStatus(status) === "in-progress") {
    focusTask?.();
  }
}
