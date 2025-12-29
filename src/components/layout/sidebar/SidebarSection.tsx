import { ChevronDown, ChevronRight, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarSectionProps {
  title: string;
  icon: LucideIcon;
  isExpanded: boolean;
  onToggle: () => void;
  hint?: string;
  children: React.ReactNode;
}

export function SidebarSection({
  title,
  icon: Icon,
  isExpanded,
  onToggle,
  hint,
  children,
}: SidebarSectionProps) {
  return (
    <div className="mb-1">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-sidebar-accent/50 transition-colors group"
      >
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-sidebar-foreground">{title}</span>
          {hint && (
            <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
              ({hint})
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
      </button>
      <div
        className={cn(
          "overflow-hidden transition-all duration-200",
          isExpanded ? "max-h-96" : "max-h-0"
        )}
      >
        {children}
      </div>
    </div>
  );
}
