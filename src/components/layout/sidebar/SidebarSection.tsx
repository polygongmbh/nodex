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
    <div className="mb-2">
      <div className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-sidebar-accent/50 transition-colors group">
        <div className="flex items-center gap-2.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onIconClick?.();
            }}
            className="hover:ring-2 hover:ring-primary/50 rounded p-0.5 focus:outline-none focus:ring-2 focus:ring-primary/50"
            title="Toggle all on/off"
            aria-label={`Toggle all ${title.toLowerCase()}`}
          >
            <Icon className="w-4 h-4 text-muted-foreground hover:text-primary transition-colors" />
          </button>
          <button 
            onClick={onToggle} 
            className="flex items-center gap-2 focus:outline-none"
            aria-expanded={isExpanded}
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${title}`}
          >
            <span className="text-sm font-medium text-sidebar-foreground">{title}</span>
            {hint && (
              <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                ({hint})
              </span>
            )}
          </button>
        </div>
        <button 
          onClick={onToggle}
          aria-hidden="true"
          tabIndex={-1}
        >
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
        <div className="py-0.5">
          {children}
        </div>
      </div>
    </div>
  );
}
