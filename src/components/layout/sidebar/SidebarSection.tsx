import { ChevronDown, ChevronRight, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarSectionProps {
  title: string;
  icon: LucideIcon;
  isExpanded: boolean;
  onToggle: () => void;
  onIconClick?: () => void;
  hint?: string;
  children: React.ReactNode;
}

export function SidebarSection({
  title,
  icon: Icon,
  isExpanded,
  onToggle,
  onIconClick,
  hint,
  children,
}: SidebarSectionProps) {
  return (
    <div className="mb-1">
      <div className="w-full flex items-center justify-between px-3 py-2 hover:bg-sidebar-accent/50 transition-colors group">
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onIconClick?.();
            }}
            className="hover:ring-2 hover:ring-primary/50 rounded p-0.5"
            title="Toggle all on/off"
          >
            <Icon className="w-4 h-4 text-muted-foreground hover:text-primary transition-colors" />
          </button>
          <button onClick={onToggle} className="flex items-center gap-2">
            <span className="text-sm font-medium text-sidebar-foreground">{title}</span>
            {hint && (
              <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                ({hint})
              </span>
            )}
          </button>
        </div>
        <button onClick={onToggle}>
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
      </div>
      <div
        className={cn(
          "overflow-hidden transition-all duration-200",
          isExpanded ? "max-h-[500px]" : "max-h-0"
        )}
      >
        {children}
      </div>
    </div>
  );
}
