import { Filter, GitBranch, LayoutList, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { ViewType } from "@/components/tasks/ViewSwitcher";

export type MobileViewType = ViewType | "filters";

interface MobileNavProps {
  currentView: MobileViewType;
  onViewChange: (view: MobileViewType) => void;
}

const navItems: { id: MobileViewType; label: string; icon: React.ReactNode }[] = [
  { id: "filters", label: "Filters", icon: <Filter className="w-5 h-5" /> },
  { id: "tree", label: "Tree", icon: <GitBranch className="w-5 h-5" /> },
  { id: "feed", label: "Feed", icon: <LayoutList className="w-5 h-5" /> },
  { id: "calendar", label: "Calendar", icon: <Calendar className="w-5 h-5" /> },
];

export function MobileNav({ currentView, onViewChange }: MobileNavProps) {
  return (
    <nav className="flex items-center justify-around border-b border-border bg-background/95 backdrop-blur-sm px-2 py-2 safe-area-top">
      {navItems.map((item) => (
        <button
          key={item.id}
          onClick={() => onViewChange(item.id)}
          className={cn(
            "flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-colors flex-1",
            currentView === item.id
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {item.icon}
          <span className="text-xs font-medium">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
