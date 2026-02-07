import { LayoutList, Columns3, GitBranch, Calendar, List } from "lucide-react";
import { cn } from "@/lib/utils";

export type ViewType = "tree" | "feed" | "kanban" | "calendar" | "list";

interface ViewSwitcherProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
}

const views: { id: ViewType; label: string; icon: React.ReactNode }[] = [
  { id: "tree", label: "Tree", icon: <GitBranch className="w-4 h-4" /> },
  { id: "feed", label: "Feed", icon: <LayoutList className="w-4 h-4" /> },
  { id: "kanban", label: "Kanban", icon: <Columns3 className="w-4 h-4" /> },
  { id: "calendar", label: "Calendar", icon: <Calendar className="w-4 h-4" /> },
  { id: "list", label: "Table", icon: <List className="w-4 h-4" /> },
];

export function ViewSwitcher({ currentView, onViewChange }: ViewSwitcherProps) {
  return (
    <div className="flex items-center gap-4 min-w-0 overflow-x-auto">
      {views.map((view) => (
        <button
          key={view.id}
          onClick={() => onViewChange(view.id)}
          className={cn(
            "flex items-center gap-1 px-0 lg:px-1 pb-2 text-sm font-medium transition-colors flex-shrink-0 border-b-2 -mb-px",
            currentView === view.id
              ? "text-foreground border-primary"
              : "text-muted-foreground border-transparent hover:text-foreground hover:border-foreground/30"
          )}
          title={view.label}
        >
          {view.icon}
          <span className="hidden lg:inline">{view.label}</span>
        </button>
      ))}
    </div>
  );
}
