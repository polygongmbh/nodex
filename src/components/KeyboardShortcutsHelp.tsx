import { useEffect, useState } from "react";
import { X, Keyboard } from "lucide-react";
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
      { key: "H", description: "Go back / up level" },
      { key: "G", description: "Jump to first task" },
      { key: "Shift + G", description: "Jump to last task" },
      { key: "Esc", description: "Clear focus" },
    ],
  },
  {
    title: "Kanban",
    shortcuts: [
      { key: "← / →", description: "Move task between columns" },
      { key: "H / J / K / L", description: "Navigate tasks" },
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
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="w-5 h-5" />
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-2">
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

// Hook to trigger shortcuts help with ? key
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
        setIsOpen(true);
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
