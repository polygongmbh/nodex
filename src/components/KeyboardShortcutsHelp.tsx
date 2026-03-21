import { useEffect, useState, useRef } from "react";
import { Keyboard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogScrollBody,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import {
  getMetadataOnlyShortcutLabel,
  getSubmitCurrentKindShortcutLabel,
  getSubmitOppositeKindShortcutLabel,
} from "@/lib/keyboard-platform";

interface ShortcutGroup {
  title: string;
  shortcuts: { key: string; description: string }[];
}

interface KeyboardShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsHelp({ isOpen, onClose }: KeyboardShortcutsHelpProps) {
  const { t } = useTranslation();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const shortcutGroups: ShortcutGroup[] = [
    {
      title: t("shortcuts.groups.views"),
      shortcuts: [
        { key: "1", description: t("shortcuts.items.feedView") },
        { key: "2", description: t("shortcuts.items.treeView") },
        { key: "3", description: t("shortcuts.items.kanbanView") },
        { key: "4", description: t("shortcuts.items.calendarView") },
        { key: "5", description: t("shortcuts.items.tableView") },
      ],
    },
    {
      title: t("shortcuts.groups.taskNavigation"),
      shortcuts: [
        { key: "J / ↓", description: t("shortcuts.items.moveFocusDown") },
        { key: "K / ↑", description: t("shortcuts.items.moveFocusUp") },
        { key: "L / Enter", description: t("shortcuts.items.openSelectTask") },
        { key: "H", description: t("shortcuts.items.focusSidebarGoBack") },
        { key: "G", description: t("shortcuts.items.jumpFirstTask") },
        { key: "Shift + G", description: t("shortcuts.items.jumpLastTask") },
        { key: "Esc", description: t("shortcuts.items.clearFocus") },
      ],
    },
    {
      title: t("shortcuts.groups.sidebarNavigation"),
      shortcuts: [
        { key: "J / K / ↑ / ↓", description: t("shortcuts.items.navigateFilters") },
        { key: "Space", description: t("shortcuts.items.toggleSelectedFilter") },
        { key: "L / → / Enter", description: t("shortcuts.items.returnTaskList") },
        { key: "G", description: t("shortcuts.items.jumpFirstFilter") },
        { key: "Shift + G", description: t("shortcuts.items.jumpLastFilter") },
      ],
    },
    {
      title: t("shortcuts.groups.kanban"),
      shortcuts: [
        { key: "← / → / H / L", description: t("shortcuts.items.navigateColumns") },
        { key: "↑ / ↓ / J / K", description: t("shortcuts.items.navigateWithinColumn") },
        { key: "Shift + ← / →", description: t("shortcuts.items.moveTaskColumns") },
        { key: "Shift + H / L", description: t("shortcuts.items.moveTaskColumns") },
      ],
    },
    {
      title: t("shortcuts.groups.general"),
      shortcuts: [
        { key: "?", description: t("shortcuts.items.toggleKeyboardShortcuts") },
        { key: "Shift + Alt/Option + Click", description: t("shortcuts.items.openRawEventJson") },
      ],
    },
    {
      title: t("shortcuts.groups.compose"),
      shortcuts: [
        { key: getSubmitCurrentKindShortcutLabel(), description: t("shortcuts.items.submitCurrentKind") },
        { key: getSubmitOppositeKindShortcutLabel(), description: t("shortcuts.items.submitOppositeKind") },
        { key: "Enter / Tab", description: t("shortcuts.items.insertHighlightedSuggestion") },
        { key: getMetadataOnlyShortcutLabel(), description: t("shortcuts.items.addMetadataOnly") },
      ],
    },
  ];

  // Handle keyboard scrolling within the dialog - use capture phase to intercept before other handlers
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const container = scrollContainerRef.current;
      if (!container) return;

      const scrollAmount = 60;

      // Intercept navigation keys to prevent task list from scrolling
      if (
        event.key === "ArrowDown" || 
        event.key === "ArrowUp" || 
        event.key === "j" || 
        event.key === "k" ||
        event.key === "h" ||
        event.key === "l" ||
        event.key === "g" ||
        event.key === "G" ||
        event.key === "Enter" ||
        event.key === " "
      ) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }

      if (event.key === "ArrowDown" || event.key === "j") {
        container.scrollBy({ top: scrollAmount, behavior: "smooth" });
      } else if (event.key === "ArrowUp" || event.key === "k") {
        container.scrollBy({ top: -scrollAmount, behavior: "smooth" });
      } else if (event.key === "Escape") {
        onClose();
      }
    };

    // Use capture phase to intercept events before they reach other handlers
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isOpen, onClose]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="w-5 h-5" />
            {t("shortcuts.title")}
          </DialogTitle>
        </DialogHeader>
        
        <DialogScrollBody ref={scrollContainerRef} innerClassName="space-y-6 py-2">
          {shortcutGroups.map((group) => (
            <div key={group.title}>
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">
                {group.title}
              </h3>
              <div className="space-y-1">
                {group.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.key}
                    className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50"
                  >
                    <span className="text-sm">{shortcut.description}</span>
                    <kbd className="px-2 py-1 text-xs font-mono bg-muted border border-border rounded">
                      {shortcut.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </DialogScrollBody>
      </DialogContent>
    </Dialog>
  );
}

// Hook to trigger shortcuts help with ? key (toggle behavior)
export function useKeyboardShortcutsHelp() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      if (event.key === "?" || (event.shiftKey && event.key === "/")) {
        event.preventDefault();
        setIsOpen((prev) => !prev); // Toggle instead of just open
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
  };
}

// Small button component to show in the UI
export function KeyboardShortcutsButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      className="h-8 w-8"
      title={t("sidebar.actions.shortcutsTooltip")}
    >
      <Keyboard className="w-4 h-4" />
    </Button>
  );
}
