import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

type SidebarSectionAnimationMode = "none" | "previewCollapse" | "fullCollapse";

export interface SidebarSectionProps {
  title: string;
  icon: LucideIcon;
  isExpanded: boolean;
  onToggle: () => void;
  onIconClick?: () => void;
  hint?: string;
  action?: React.ReactNode;
  collapsedMaxHeightClass?: string;
  animationMode?: SidebarSectionAnimationMode;
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
  collapsedMaxHeightClass = "max-h-0",
  animationMode = "previewCollapse",
  children,
}: SidebarSectionProps) {
  const { t } = useTranslation();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const toggleLabel = `${isExpanded ? t("tasks.actions.collapse") : t("tasks.actions.expandAll")} ${title}`;
  const stopHeaderToggle = (event: React.SyntheticEvent) => {
    event.stopPropagation();
  };

  useEffect(() => {
    if (animationMode !== "fullCollapse") return;
    const content = contentRef.current;
    if (!content) return;

    const measureHeight = () => {
      setContentHeight(content.scrollHeight);
    };

    measureHeight();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measureHeight());
    observer.observe(content);
    return () => observer.disconnect();
  }, [animationMode, children, isExpanded]);

  return (
    <div className="mb-3">
      <div className="w-full flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-sidebar-accent/50 transition-colors group">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onIconClick?.();
            }}
            onKeyDown={stopHeaderToggle}
            onPointerDown={stopHeaderToggle}
            onMouseDown={stopHeaderToggle}
            className="hover:ring-2 hover:ring-primary/50 rounded p-0.5 focus:outline-none focus:ring-2 focus:ring-primary/50"
            title={t("sidebar.actions.toggleAll")}
            aria-label={t("sidebar.actions.toggleAllFor", { title: title.toLowerCase() })}
          >
            <Icon className="w-4 h-4 text-muted-foreground hover:text-primary transition-colors" />
          </button>
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left focus:outline-none"
            onClick={onToggle}
            aria-expanded={isExpanded}
            aria-label={toggleLabel}
            title={toggleLabel}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="text-sm font-medium text-sidebar-foreground">{title}</span>
              {hint && (
                <span className="text-[0.625rem] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                  ({hint})
                </span>
              )}
            </span>
            <span aria-hidden="true" className="shrink-0">
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
            </span>
          </button>
        </div>
        {action && (
          <div
            data-sidebar-section-action="true"
            className="flex shrink-0 items-center self-center"
            onClick={stopHeaderToggle}
            onKeyDown={stopHeaderToggle}
            onPointerDown={stopHeaderToggle}
            onMouseDown={stopHeaderToggle}
          >
            {action}
          </div>
        )}
      </div>
      <div
        className={cn(
          animationMode === "none"
            ? (isExpanded ? "overflow-visible" : "hidden")
            : animationMode === "fullCollapse"
            ? cn(
                "origin-top overflow-hidden will-change-[height] transition-[height,opacity,transform] duration-300 ease-out",
                isExpanded
                  ? "opacity-100 translate-y-0 motion-sidebar-fold-open"
                  : "opacity-100 -translate-y-0.5 motion-sidebar-fold-close"
              )
            : cn(
                "origin-top overflow-hidden transition-[max-height,opacity,transform] duration-300 ease-out",
                isExpanded
                  ? "max-h-[2000px] opacity-100 translate-y-0 scale-y-100 motion-sidebar-fold-open"
                  : `${collapsedMaxHeightClass} opacity-100 -translate-y-1 scale-y-[0.98] motion-sidebar-fold-close`
              )
        )}
        style={animationMode === "fullCollapse" ? { height: isExpanded ? `${contentHeight}px` : "0px" } : undefined}
      >
        <div ref={contentRef} className="py-0">
          {children}
        </div>
      </div>
    </div>
  );
}
