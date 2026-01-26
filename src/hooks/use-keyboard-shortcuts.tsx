import { useEffect, useCallback } from "react";
import { ViewType } from "@/components/tasks/ViewSwitcher";

interface UseKeyboardShortcutsOptions {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  enabled?: boolean;
}

const viewOrder: ViewType[] = ["tree", "feed", "kanban", "calendar", "list"];

export function useKeyboardShortcuts({
  currentView,
  onViewChange,
  enabled = true,
}: UseKeyboardShortcutsOptions) {
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

      // Don't trigger if modifier keys are pressed (except shift for some)
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      // Number keys 1-5 to switch views
      if (event.key >= "1" && event.key <= "5") {
        const index = parseInt(event.key) - 1;
        if (index < viewOrder.length) {
          event.preventDefault();
          onViewChange(viewOrder[index]);
        }
        return;
      }

      // Left/Right arrows to navigate between views
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        const currentIndex = viewOrder.indexOf(currentView);
        if (currentIndex === -1) return;

        let newIndex: number;
        if (event.key === "ArrowLeft") {
          newIndex = currentIndex > 0 ? currentIndex - 1 : viewOrder.length - 1;
        } else {
          newIndex = currentIndex < viewOrder.length - 1 ? currentIndex + 1 : 0;
        }

        event.preventDefault();
        onViewChange(viewOrder[newIndex]);
      }
    },
    [currentView, onViewChange]
  );

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, handleKeyDown]);
}
