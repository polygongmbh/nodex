import { useState, useEffect, useCallback, useRef } from "react";

interface UseTaskNavigationOptions {
  taskIds: string[];
  onSelectTask: (taskId: string) => void;
  onGoBack?: () => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onFocusSidebar?: () => void;
  enabled?: boolean;
  // For Kanban: Shift+arrows/HJKL move tasks, plain arrows/HJKL navigate
  kanbanMode?: boolean;
  // Column-aware navigation for Kanban
  columnTaskIds?: string[][]; // Array of task IDs per Kanban column, left to right
}

export function useTaskNavigation({
  taskIds,
  onSelectTask,
  onGoBack,
  onMoveLeft,
  onMoveRight,
  onMoveUp,
  onMoveDown,
  onFocusSidebar,
  enabled = true,
  kanbanMode = false,
  columnTaskIds,
}: UseTaskNavigationOptions) {
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [focusedColumn, setFocusedColumn] = useState<number>(0); // For Kanban column navigation
  
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

  // Get current position in Kanban grid
  const getKanbanPosition = useCallback(() => {
    if (!columnTaskIds || !focusedTaskId) return null;
    for (let col = 0; col < columnTaskIds.length; col++) {
      const rowIndex = columnTaskIds[col].indexOf(focusedTaskId);
      if (rowIndex !== -1) {
        return { column: col, row: rowIndex };
      }
    }
    return null;
  }, [columnTaskIds, focusedTaskId]);

  // Set focus by column/row position
  const setFocusByPosition = useCallback((col: number, row: number) => {
    if (!columnTaskIds) return;
    const clampedCol = Math.max(0, Math.min(col, columnTaskIds.length - 1));
    const columnTasks = columnTaskIds[clampedCol];
    if (columnTasks.length === 0) {
      // Try adjacent columns if empty
      for (let offset = 1; offset < columnTaskIds.length; offset++) {
        const leftCol = clampedCol - offset;
        const rightCol = clampedCol + offset;
        if (leftCol >= 0 && columnTaskIds[leftCol].length > 0) {
          const clampedRow = Math.min(row, columnTaskIds[leftCol].length - 1);
          const taskId = columnTaskIds[leftCol][clampedRow];
          const globalIndex = taskIds.indexOf(taskId);
          if (globalIndex !== -1) {
            setFocusedIndex(globalIndex);
            setFocusedColumn(leftCol);
          }
          return;
        }
        if (rightCol < columnTaskIds.length && columnTaskIds[rightCol].length > 0) {
          const clampedRow = Math.min(row, columnTaskIds[rightCol].length - 1);
          const taskId = columnTaskIds[rightCol][clampedRow];
          const globalIndex = taskIds.indexOf(taskId);
          if (globalIndex !== -1) {
            setFocusedIndex(globalIndex);
            setFocusedColumn(rightCol);
          }
          return;
        }
      }
      return;
    }
    const clampedRow = Math.max(0, Math.min(row, columnTasks.length - 1));
    const taskId = columnTasks[clampedRow];
    const globalIndex = taskIds.indexOf(taskId);
    if (globalIndex !== -1) {
      setFocusedIndex(globalIndex);
      setFocusedColumn(clampedCol);
    }
  }, [columnTaskIds, taskIds]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Don't trigger if user is typing in an input, textarea, or contenteditable
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "SELECT" ||
        target.tagName === "OPTION" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      // Don't trigger if meta/ctrl/alt are pressed (except shift which we use)
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      // Pause task-list navigation while any open overlay owns keyboard focus
      // (modals, dropdown menus, listboxes, comboboxes). Without this, arrow
      // keys would both navigate the open menu AND move the feed selection.
      if (
        document.querySelector(
          '[role="dialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"][data-state="open"], [role="combobox"][aria-expanded="true"]'
        )
      ) {
        return;
      }

      if (taskIds.length === 0) return;

      const key = event.key.toLowerCase();
      const isShift = event.shiftKey;

      // KANBAN MODE: arrows navigate columns, Shift+arrows/HJKL move tasks
      if (kanbanMode && columnTaskIds) {
        const pos = getKanbanPosition();
        
        // Shift + movement keys = move task
        if (isShift) {
          if (event.key === "ArrowLeft" || key === "h") {
            if (focusedTaskId && onMoveLeft) {
              event.preventDefault();
              onMoveLeft();
            }
            return;
          }
          if (event.key === "ArrowRight" || key === "l") {
            if (focusedTaskId && onMoveRight) {
              event.preventDefault();
              onMoveRight();
            }
            return;
          }
          if (event.key === "ArrowUp" || key === "k") {
            if (focusedTaskId && onMoveUp) {
              event.preventDefault();
              onMoveUp();
            }
            return;
          }
          if (event.key === "ArrowDown" || key === "j") {
            if (focusedTaskId && onMoveDown) {
              event.preventDefault();
              onMoveDown();
            }
            return;
          }
          // Shift+G for bottom still works
          if (event.key === "G") {
            event.preventDefault();
            setFocusByPosition(focusedColumn, 999);
            return;
          }
        }

        // Arrow keys navigate across columns (prevent default FIRST to stop scrolling)
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          event.stopPropagation();
          if (pos) {
            if (pos.column === 0 && onFocusSidebar) {
              setFocusedIndex(-1);
              onFocusSidebar();
            } else if (pos.column > 0) {
              setFocusByPosition(pos.column - 1, pos.row);
            }
          } else if (onFocusSidebar) {
            setFocusedIndex(-1);
            onFocusSidebar();
          }
          return;
        }

        if (event.key === "ArrowRight") {
          event.preventDefault();
          event.stopPropagation();
          if (pos) {
            if (pos.column < columnTaskIds.length - 1) {
              setFocusByPosition(pos.column + 1, pos.row);
            }
          } else {
            // Start at first column
            setFocusByPosition(0, 0);
          }
          return;
        }

        // Up/Down arrows navigate within column
        if (event.key === "ArrowDown") {
          event.preventDefault();
          event.stopPropagation();
          if (pos) {
            setFocusByPosition(pos.column, pos.row + 1);
          } else {
            setFocusByPosition(0, 0);
          }
          return;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          event.stopPropagation();
          if (pos) {
            setFocusByPosition(pos.column, pos.row - 1);
          } else {
            setFocusByPosition(0, 0);
          }
          return;
        }

        // HJKL navigation (non-shifted) - same as arrows
        if (key === "h" && !isShift) {
          event.preventDefault();
          if (pos) {
            if (pos.column === 0 && onFocusSidebar) {
              setFocusedIndex(-1);
              onFocusSidebar();
            } else {
              setFocusByPosition(pos.column - 1, pos.row);
            }
          } else if (onFocusSidebar) {
            onFocusSidebar();
          }
          return;
        }

        if (key === "l" && !isShift) {
          event.preventDefault();
          if (pos) {
            setFocusByPosition(pos.column + 1, pos.row);
          } else {
            setFocusByPosition(0, 0);
          }
          return;
        }

        if (key === "j" && !isShift) {
          event.preventDefault();
          if (pos) {
            setFocusByPosition(pos.column, pos.row + 1);
          } else {
            setFocusByPosition(0, 0);
          }
          return;
        }

        if (key === "k" && !isShift) {
          event.preventDefault();
          if (pos) {
            setFocusByPosition(pos.column, pos.row - 1);
          } else {
            setFocusByPosition(0, 0);
          }
          return;
        }

        // Enter - open/select task
        if (event.key === "Enter") {
          if (focusedIndex >= 0 && focusedIndex < taskIds.length) {
            event.preventDefault();
            onSelectTask(taskIds[focusedIndex]);
          }
          return;
        }

        // G - go to top of column
        if (key === "g" && !isShift) {
          event.preventDefault();
          setFocusByPosition(focusedColumn, 0);
          return;
        }

        // Escape - clear focus
        if (event.key === "Escape") {
          setFocusedIndex(-1);
          return;
        }

        return;
      }

      // STANDARD MODE: Arrow keys for navigation
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setFocusedIndex((prev) => {
          if (prev < 0) return 0;
          return Math.min(prev + 1, taskIds.length - 1);
        });
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setFocusedIndex((prev) => {
          if (prev < 0) return taskIds.length - 1;
          return Math.max(prev - 1, 0);
        });
        return;
      }

      // J - move down (vim style)
      if (key === "j" && !isShift) {
        event.preventDefault();
        setFocusedIndex((prev) => {
          if (prev < 0) return 0;
          return Math.min(prev + 1, taskIds.length - 1);
        });
        return;
      }

      // K - move up (vim style)
      if (key === "k" && !isShift) {
        event.preventDefault();
        setFocusedIndex((prev) => {
          if (prev < 0) return taskIds.length - 1;
          return Math.max(prev - 1, 0);
        });
        return;
      }

      // L or Enter - open/select task
      if ((key === "l" && !isShift) || event.key === "Enter") {
        if (focusedIndex >= 0 && focusedIndex < taskIds.length) {
          event.preventDefault();
          onSelectTask(taskIds[focusedIndex]);
        }
        return;
      }

      // H - go back / up level. If at top of list or no focus, trigger sidebar focus
      if (key === "h" && !isShift) {
        event.preventDefault();
        if (focusedIndex <= 0) {
          if (onFocusSidebar) {
            setFocusedIndex(-1);
            onFocusSidebar();
          } else if (onGoBack) {
            onGoBack();
          }
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
      if (key === "g" && !isShift) {
        event.preventDefault();
        setFocusedIndex(0);
        return;
      }

      // Shift+G - go to bottom
      if (isShift && event.key === "G") {
        event.preventDefault();
        setFocusedIndex(taskIds.length - 1);
        return;
      }
    },
    [taskIds, focusedIndex, focusedTaskId, focusedColumn, onSelectTask, onGoBack, onMoveLeft, onMoveRight, onMoveUp, onMoveDown, onFocusSidebar, kanbanMode, columnTaskIds, getKanbanPosition, setFocusByPosition]
  );

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, handleKeyDown]);

  // Expose method to set focus by task ID (for maintaining selection after move)
  const setFocusByTaskId = useCallback((taskId: string) => {
    const index = taskIds.indexOf(taskId);
    if (index !== -1) {
      setFocusedIndex(index);
      // Update column too if in kanban mode
      if (columnTaskIds) {
        for (let col = 0; col < columnTaskIds.length; col++) {
          if (columnTaskIds[col].includes(taskId)) {
            setFocusedColumn(col);
            break;
          }
        }
      }
    }
  }, [taskIds, columnTaskIds]);

  return {
    focusedIndex,
    focusedTaskId,
    setFocusedIndex,
    setFocusByTaskId,
    focusedColumn,
  };
}
