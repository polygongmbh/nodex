import { useState, useEffect, useCallback, useRef } from "react";

interface UseTaskNavigationOptions {
  taskIds: string[];
  onSelectTask: (taskId: string) => void;
  onGoBack?: () => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  enabled?: boolean;
  // For Kanban: arrow keys move tasks, HJKL navigates
  arrowsMoveTasks?: boolean;
}

export function useTaskNavigation({
  taskIds,
  onSelectTask,
  onGoBack,
  onMoveLeft,
  onMoveRight,
  enabled = true,
  arrowsMoveTasks = false,
}: UseTaskNavigationOptions) {
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const focusedTaskId = focusedIndex >= 0 && focusedIndex < taskIds.length 
    ? taskIds[focusedIndex] 
    : null;

  // Reset focus when task list changes significantly
  const prevTaskIdsRef = useRef<string[]>([]);
  useEffect(() => {
    const prevIds = prevTaskIdsRef.current;
    // If the focused task is no longer in the list, reset
    if (focusedIndex >= 0 && focusedIndex < taskIds.length) {
      const currentFocusedId = prevIds[focusedIndex];
      if (!taskIds.includes(currentFocusedId)) {
        setFocusedIndex(-1);
      }
    }
    prevTaskIdsRef.current = taskIds;
  }, [taskIds, focusedIndex]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Don't trigger if user is typing in an input, textarea, or contenteditable
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      // Don't trigger if modifier keys are pressed (except shift)
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (taskIds.length === 0) return;

      const key = event.key.toLowerCase();

      // Arrow keys - behavior depends on mode
      if (event.key === "ArrowDown") {
        if (arrowsMoveTasks) {
          // In Kanban, arrows move tasks - don't handle navigation
          return;
        }
        event.preventDefault();
        setFocusedIndex((prev) => {
          if (prev < 0) return 0;
          return Math.min(prev + 1, taskIds.length - 1);
        });
        return;
      }

      if (event.key === "ArrowUp") {
        if (arrowsMoveTasks) {
          return;
        }
        event.preventDefault();
        setFocusedIndex((prev) => {
          if (prev < 0) return taskIds.length - 1;
          return Math.max(prev - 1, 0);
        });
        return;
      }

      // Arrow left/right for moving tasks (Kanban) or column navigation
      if (event.key === "ArrowLeft") {
        if (arrowsMoveTasks && focusedTaskId && onMoveLeft) {
          event.preventDefault();
          onMoveLeft();
        }
        return;
      }

      if (event.key === "ArrowRight") {
        if (arrowsMoveTasks && focusedTaskId && onMoveRight) {
          event.preventDefault();
          onMoveRight();
        }
        return;
      }

      // J - move down (vim style)
      if (key === "j") {
        event.preventDefault();
        setFocusedIndex((prev) => {
          if (prev < 0) return 0;
          return Math.min(prev + 1, taskIds.length - 1);
        });
        return;
      }

      // K - move up (vim style)
      if (key === "k") {
        event.preventDefault();
        setFocusedIndex((prev) => {
          if (prev < 0) return taskIds.length - 1;
          return Math.max(prev - 1, 0);
        });
        return;
      }

      // L or Enter - open/select task
      if (key === "l" || event.key === "Enter") {
        if (focusedIndex >= 0 && focusedIndex < taskIds.length) {
          event.preventDefault();
          onSelectTask(taskIds[focusedIndex]);
        }
        return;
      }

      // H - go back / up level. If at top of list or no focus, trigger onGoBack
      if (key === "h") {
        event.preventDefault();
        if (focusedIndex <= 0 && onGoBack) {
          onGoBack();
        } else {
          setFocusedIndex(-1);
        }
        return;
      }

      // Escape - clear focus
      if (event.key === "Escape") {
        setFocusedIndex(-1);
        return;
      }

      // G - go to top
      if (key === "g" && !event.shiftKey) {
        event.preventDefault();
        setFocusedIndex(0);
        return;
      }

      // Shift+G - go to bottom
      if (event.shiftKey && event.key === "G") {
        event.preventDefault();
        setFocusedIndex(taskIds.length - 1);
        return;
      }
    },
    [taskIds, focusedIndex, focusedTaskId, onSelectTask, onGoBack, onMoveLeft, onMoveRight, arrowsMoveTasks]
  );

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, handleKeyDown]);

  return {
    focusedIndex,
    focusedTaskId,
    setFocusedIndex,
  };
}
