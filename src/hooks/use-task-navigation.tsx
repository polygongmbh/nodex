import { useState, useEffect, useCallback, useRef } from "react";

interface UseTaskNavigationOptions {
  taskIds: string[];
  onSelectTask: (taskId: string) => void;
  enabled?: boolean;
}

export function useTaskNavigation({
  taskIds,
  onSelectTask,
  enabled = true,
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

      // Don't trigger if modifier keys are pressed
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (taskIds.length === 0) return;

      const key = event.key.toLowerCase();

      // Down arrow or J - move down
      if (event.key === "ArrowDown" || key === "j") {
        event.preventDefault();
        setFocusedIndex((prev) => {
          if (prev < 0) return 0;
          return Math.min(prev + 1, taskIds.length - 1);
        });
        return;
      }

      // Up arrow or K - move up
      if (event.key === "ArrowUp" || key === "k") {
        event.preventDefault();
        setFocusedIndex((prev) => {
          if (prev < 0) return taskIds.length - 1;
          return Math.max(prev - 1, 0);
        });
        return;
      }

      // Enter or L - open/select task
      if (event.key === "Enter" || key === "l") {
        if (focusedIndex >= 0 && focusedIndex < taskIds.length) {
          event.preventDefault();
          onSelectTask(taskIds[focusedIndex]);
        }
        return;
      }

      // H - go back / deselect (reset focus)
      if (key === "h") {
        event.preventDefault();
        setFocusedIndex(-1);
        return;
      }

      // Escape - clear focus
      if (event.key === "Escape") {
        setFocusedIndex(-1);
        return;
      }

      // G - go to top
      if (key === "g") {
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
    [taskIds, focusedIndex, onSelectTask]
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
