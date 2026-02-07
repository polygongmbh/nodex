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
    <div className="flex items-center gap-0.5 p-1 bg-muted/50 rounded-lg min-w-0">
      {views.map((view) => (
        <button
          key={view.id}
          onClick={() => onViewChange(view.id)}
          className={cn(
            "flex items-center gap-1 px-2 lg:px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex-shrink-0",
            currentView === view.id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-background/50"
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