import { ChevronDown, ChevronRight, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

export interface SidebarSectionProps {
  title: string;
  icon: LucideIcon;
  isExpanded: boolean;
  onToggle: () => void;
  onIconClick?: () => void;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}

export function SidebarSection({
  title,
  icon: Icon,
  isExpanded,
  onToggle,
  onIconClick,
  hint,
  action,
  children,
}: SidebarSectionProps) {
  const { t } = useTranslation();
  return (
    <div className="mb-3">
      <div className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-sidebar-accent/50 transition-colors group">
        <div className="flex items-center gap-2.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
            onIconClick?.();
          }}
          className="hover:ring-2 hover:ring-primary/50 rounded p-0.5 focus:outline-none focus:ring-2 focus:ring-primary/50"
          title={t("sidebar.actions.toggleAll")}
          aria-label={t("sidebar.actions.toggleAllFor", { title: title.toLowerCase() })}
        >
            <Icon className="w-4 h-4 text-muted-foreground hover:text-primary transition-colors" />
          </button>
          <button 
            onClick={onToggle} 
            className="flex items-center gap-2 focus:outline-none"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? t("tasks.actions.collapse") : t("tasks.actions.expandAll")}
            title={`${isExpanded ? t("tasks.actions.collapse") : t("tasks.actions.expandAll")} ${title}`}
          >
            <span className="text-sm font-medium text-sidebar-foreground">{title}</span>
            {hint && (
              <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                ({hint})
              </span>
            )}
          </button>
        </div>
        <div className="flex items-center gap-1">
          {action}
          <button 
            onClick={onToggle}
            aria-hidden="true"
            tabIndex={-1}
            title={`${isExpanded ? t("tasks.actions.collapse") : t("tasks.actions.expandAll")} ${title}`}
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
        </div>
      </div>
      <div
        className={cn(
          "overflow-hidden transition-all duration-200",
          isExpanded ? "max-h-[2000px]" : "max-h-0"
        )}
      >
        <div className="py-0">
          {children}
        </div>
      </div>
    </div>
  );
}
