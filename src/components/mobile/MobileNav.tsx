import { Filter, GitBranch, LayoutList, Calendar, List } from "lucide-react";
import { cn } from "@/lib/utils";
import { ViewType } from "@/components/tasks/ViewSwitcher";

export type MobileViewType = ViewType | "filters" | "upcoming";

interface MobileNavProps {
  currentView: MobileViewType;
  onViewChange: (view: MobileViewType) => void;
}

const navItems: { id: MobileViewType; label: string; icon: React.ReactNode }[] = [
  { id: "filters", label: "Manage", icon: <Filter className="w-5 h-5" /> },
  { id: "tree", label: "Tree", icon: <GitBranch className="w-5 h-5" /> },
  { id: "feed", label: "Feed", icon: <LayoutList className="w-5 h-5" /> },
  { id: "upcoming", label: "Upcoming", icon: <List className="w-5 h-5" /> },
  { id: "calendar", label: "Calendar", icon: <Calendar className="w-5 h-5" /> },
];

export function MobileNav({ currentView, onViewChange }: MobileNavProps) {
  return (
    <nav 
      className="flex items-center justify-around border-b border-border bg-background/95 backdrop-blur-sm px-2 py-2.5 safe-area-top"
      role="tablist"
      aria-label="Navigation views"
    >
      {navItems.map((item) => (
        <button
          key={item.id}
          onClick={() => onViewChange(item.id)}
          role="tab"
          aria-selected={currentView === item.id}
          aria-label={`Switch to ${item.label} view`}
          className={cn(
            "flex flex-col items-center gap-1.5 px-4 py-2.5 rounded-lg transition-colors flex-1 min-w-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            currentView === item.id
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:text-foreground active:bg-muted/50"
          )}
        >
          {item.icon}
          <span className="text-xs font-medium truncate">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
