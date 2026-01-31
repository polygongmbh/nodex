import { useEffect, useState, useRef } from "react";
import { Keyboard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ShortcutGroup {
  title: string;
  shortcuts: { key: string; description: string }[];
}

const shortcutGroups: ShortcutGroup[] = [
  {
    title: "Views",
    shortcuts: [
      { key: "1", description: "Tree view" },
      { key: "2", description: "Feed view" },
      { key: "3", description: "Kanban view" },
      { key: "4", description: "Calendar view" },
      { key: "5", description: "Table view" },
    ],
  },
  {
    title: "Task Navigation",
    shortcuts: [
      { key: "J / ↓", description: "Move focus down" },
      { key: "K / ↑", description: "Move focus up" },
      { key: "L / Enter", description: "Open/select task" },
      { key: "H", description: "Focus sidebar (at top) / go back" },
      { key: "G", description: "Jump to first task" },
      { key: "Shift + G", description: "Jump to last task" },
      { key: "Esc", description: "Clear focus" },
    ],
  },
  {
    title: "Sidebar Navigation",
    shortcuts: [
      { key: "J / K / ↑ / ↓", description: "Navigate filters" },
      { key: "Space", description: "Toggle selected filter" },
      { key: "L / → / Enter", description: "Return to task list" },
      { key: "G", description: "Jump to first filter" },
      { key: "Shift + G", description: "Jump to last filter" },
    ],
  },
  {
    title: "Kanban",
    shortcuts: [
      { key: "← / → / H / L", description: "Navigate between columns" },
      { key: "↑ / ↓ / J / K", description: "Navigate within column" },
      { key: "Shift + ← / →", description: "Move task between columns" },
      { key: "Shift + H / L", description: "Move task between columns" },
    ],
  },
  {
    title: "General",
    shortcuts: [
      { key: "?", description: "Show keyboard shortcuts" },
    ],
  },
];

interface KeyboardShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsHelp({ isOpen, onClose }: KeyboardShortcutsHelpProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>
        
        <div ref={scrollContainerRef} className="space-y-6 py-2 overflow-auto flex-1">
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
        </div>
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
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      className="h-8 w-8"
      title="Keyboard shortcuts (?)"
    >
      <Keyboard className="w-4 h-4" />
    </Button>
  );
}
