import { useEffect, useCallback } from "react";
import { ViewType } from "@/components/tasks/ViewSwitcher";

interface UseKeyboardShortcutsOptions {
  onViewChange: (view: ViewType) => void;
  onToggleChannelMatchMode?: () => void;
  onToggleRecentFilter?: () => void;
  onTogglePriorityFilter?: () => void;
  onToggleCompactView?: () => void;
  enabled?: boolean;
}

const viewOrder: ViewType[] = ["feed", "tree", "kanban", "calendar", "list"];

export function useKeyboardShortcuts({
  onViewChange,
  onToggleChannelMatchMode,
  onToggleRecentFilter,
  onTogglePriorityFilter,
  onToggleCompactView,
  enabled = true,
}: UseKeyboardShortcutsOptions) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;

      // Don't trigger if user is typing in an input, textarea, or contenteditable
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      // Don't trigger if modifier keys are pressed (except shift for some)
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const normalizedKey = event.key.length === 1 ? event.key.toLowerCase() : event.key;

      // Number keys 1-5 to switch views
      if (event.key >= "1" && event.key <= "5") {
        const index = parseInt(event.key) - 1;
        if (index < viewOrder.length) {
          event.preventDefault();
          onViewChange(viewOrder[index]);
        }
        return;
      }

      if (normalizedKey === "m" && onToggleChannelMatchMode) {
        event.preventDefault();
        onToggleChannelMatchMode();
        return;
      }

      if (normalizedKey === "r" && onToggleRecentFilter) {
        event.preventDefault();
        onToggleRecentFilter();
        return;
      }

      if (normalizedKey === "p" && onTogglePriorityFilter) {
        event.preventDefault();
        onTogglePriorityFilter();
        return;
      }

      if (normalizedKey === "c" && onToggleCompactView) {
        event.preventDefault();
        onToggleCompactView();
        return;
      }

      // Left/Right arrows or H/L to navigate between views (only H/L, arrows reserved for task nav)
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        // Don't handle arrows here anymore - reserved for task navigation
        // View switching now only via number keys
        return;
      }
    },
    [
      onToggleChannelMatchMode,
      onToggleCompactView,
      onTogglePriorityFilter,
      onToggleRecentFilter,
      onViewChange,
    ]
  );

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, handleKeyDown]);
}
