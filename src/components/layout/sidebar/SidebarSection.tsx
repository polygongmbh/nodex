import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { SidebarInset } from "./SidebarInset";

type SidebarSectionAnimationMode = "none" | "previewCollapse" | "fullCollapse";
type SidebarSectionIconIntent =
  | "sidebar.relay.toggleAll"
  | "sidebar.channel.toggleAll"
  | "sidebar.person.toggleAll";

export interface SidebarSectionProps {
  title: string;
  icon: LucideIcon;
  isExpanded: boolean;
  onToggle: () => void;
  toggleLabel?: string;
  onIconClick?: () => void;
  iconIntent?: SidebarSectionIconIntent;
  iconLabel?: string;
  hint?: string;
  action?: React.ReactNode;
  animationMode?: SidebarSectionAnimationMode;
  dataOnboarding?: string;
  children: React.ReactNode;
}

export function SidebarSection({
  title,
  icon: Icon,
  isExpanded,
  onToggle,
  toggleLabel,
  onIconClick,
  iconIntent,
  iconLabel,
  hint,
  action,
  animationMode = "previewCollapse",
  dataOnboarding,
  children,
}: SidebarSectionProps) {
  const { t } = useTranslation();
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const resolvedToggleLabel = toggleLabel ?? `${isExpanded ? t("tasks.actions.collapse") : t("tasks.actions.expand")} ${title}`;
  const resolvedIconLabel = iconLabel ?? title;

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
    <section data-onboarding={dataOnboarding}>
      <SidebarInset className="w-full flex items-center justify-between gap-2 py-2.5 hover:bg-sidebar-accent/50 transition-colors group">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              if (onIconClick) {
                onIconClick();
                return;
              }
              if (iconIntent) {
                void dispatchFeedInteraction({ type: iconIntent });
              }
            }}
            className="hover:ring-2 hover:ring-primary/50 rounded p-0.5 focus:outline-none focus:ring-2 focus:ring-primary/50"
            title={resolvedIconLabel}
            aria-label={resolvedIconLabel}
          >
            <Icon className="w-4 h-4 text-muted-foreground hover:text-primary transition-colors" />
          </button>
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left focus:outline-none"
            onClick={onToggle}
            aria-expanded={isExpanded}
            aria-label={resolvedToggleLabel}
            title={resolvedToggleLabel}
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
      </SidebarInset>
      <div
        className={cn(
          animationMode === "none"
            ? (isExpanded ? "overflow-visible" : "hidden")
            : animationMode === "fullCollapse"
            ? cn(
                "origin-top overflow-hidden will-change-[height,opacity,transform] transition-[height,opacity,transform] duration-300 ease-out",
                isExpanded
                  ? "opacity-100 translate-y-0 motion-sidebar-fold-open"
                  : "opacity-100 -translate-y-0.5 motion-sidebar-fold-close"
              )
            : cn(
                "origin-top overflow-hidden will-change-[height,opacity,transform] transition-[height,opacity,transform] duration-300 ease-out",
                isExpanded
                  ? "opacity-100 translate-y-0 scale-y-100 motion-sidebar-fold-open"
                  : "opacity-100 -translate-y-1 scale-y-[0.98] motion-sidebar-fold-close"
              )
        )}
        style={
          animationMode === "none"
            ? undefined
            : animationMode === "fullCollapse"
            ? { height: isExpanded ? `${contentHeight}px` : "0px" }
            : { height: `${contentHeight}px` }
        }
      >
        <div ref={contentRef} className="py-0">
          {children}
        </div>
      </div>
    </section>
  );
}
