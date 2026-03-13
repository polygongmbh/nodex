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
  animationMode = "fullCollapse",
  children,
}: SidebarSectionProps) {
  const { t } = useTranslation();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const toggleLabel = `${isExpanded ? t("tasks.actions.collapse") : t("tasks.actions.expandAll")} ${title}`;

  useEffect(() => {
    if (animationMode === "none") return;
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
            onClick={() => onIconClick?.()}
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
          <div className="flex shrink-0 items-center self-center">
            {action}
          </div>
        )}
      </div>
      <div
        className={cn(
          animationMode === "none"
            ? (isExpanded ? "overflow-visible" : "hidden")
            : cn(
                "origin-top overflow-hidden will-change-[height,opacity,transform] transition-[height,opacity,transform] duration-300 ease-out",
                isExpanded
                  ? "opacity-100 translate-y-0 motion-sidebar-fold-open"
                  : "opacity-100 -translate-y-0.5 motion-sidebar-fold-close"
              )
        )}
        style={animationMode === "none" ? undefined : { height: isExpanded ? `${contentHeight}px` : "0px" }}
      >
        <div ref={contentRef} className="py-0">
          {children}
        </div>
      </div>
    </div>
  );
}
