import type { MouseEvent } from "react";
import type { TaskState } from "@/types";
import { isTaskTerminalStatus } from "@/domain/content/task-state";

interface HandleTaskStatusToggleClickOptions {
  status?: TaskState;
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
  status?: TaskState;
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

  // Focus the task when quick-toggling from an open state (next stop on desktop is "active").
  // From "active" the next stop is "done" (not focus-worthy); terminal states open the chooser instead.
  // Disabled on mobile per UX: status changes there should never auto-navigate the user away.
  const isMobileViewport =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: 767px)").matches;
  if (focusOnQuickToggle && !event.altKey && !isMobileViewport) {
    if ((status?.type ?? "open") === "open") {
      focusTask?.();
    }
  }
}
