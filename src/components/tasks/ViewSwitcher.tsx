import { Home, LayoutList, Columns3, GitBranch, Calendar, List, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { CONFIGURED_VIEW_NAMES } from "@/lib/views-config";

export const VIEW_ORDER = ["home", "status", "feed", "tree", "kanban", "list", "calendar"] as const;
export type ViewType = (typeof VIEW_ORDER)[number];

function resolveEnabledViews(): readonly ViewType[] {
  if (!CONFIGURED_VIEW_NAMES) return VIEW_ORDER;
  const allowed = new Set(CONFIGURED_VIEW_NAMES);
  const filtered = VIEW_ORDER.filter((view) => allowed.has(view));
  // Ignore a config that matches nothing rather than leaving the app view-less.
  return filtered.length > 0 ? filtered : VIEW_ORDER;
}

/** Views this build exposes: VIEW_ORDER ∩ VITE_VIEWS, or all when unset. */
export const ENABLED_VIEWS: readonly ViewType[] = resolveEnabledViews();

/** With a single enabled view the nav bar is hidden (desktop and mobile). */
export const isSingleViewMode = ENABLED_VIEWS.length === 1;

/** Default landing view per platform, falling back to the first enabled view. */
export function resolveDefaultView(isMobile: boolean): ViewType {
  const preferred: ViewType = isMobile ? "status" : "home";
  if (ENABLED_VIEWS.includes(preferred)) return preferred;
  if (isMobile) {
    const mobileView = ENABLED_VIEWS.find((view) => view !== "home" && view !== "kanban");
    if (mobileView) return mobileView;
  }
  return ENABLED_VIEWS[0];
}

// Tree and list are reachable via direct URL but hidden from the desktop nav.
const DESKTOP_NAV_VIEWS = ENABLED_VIEWS.filter((v) => v !== "tree" && v !== "list");

interface ViewSwitcherProps {
  currentView: ViewType;
}

export function ViewSwitcher({ currentView }: ViewSwitcherProps) {
  const { t } = useTranslation("shell");
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const viewMeta: Record<ViewType, { labelKey: string; icon: React.ReactNode }> = {
    home: { labelKey: "navigation.views.home", icon: <Home className="w-4 h-4 xl:w-5 xl:h-5" /> },
    status: { labelKey: "navigation.views.status", icon: <LayoutDashboard className="w-4 h-4 xl:w-5 xl:h-5" /> },
    feed: { labelKey: "navigation.views.feed", icon: <LayoutList className="w-4 h-4 xl:w-5 xl:h-5" /> },
    tree: { labelKey: "navigation.views.tree", icon: <GitBranch className="w-4 h-4 xl:w-5 xl:h-5" /> },
    kanban: { labelKey: "navigation.views.kanban", icon: <Columns3 className="w-4 h-4 xl:w-5 xl:h-5" /> },
    list: { labelKey: "navigation.views.list", icon: <List className="w-4 h-4 xl:w-5 xl:h-5" /> },
    calendar: { labelKey: "navigation.views.calendar", icon: <Calendar className="w-4 h-4 xl:w-5 xl:h-5" /> },
  };
  const views = DESKTOP_NAV_VIEWS.map((id) => ({ id, label: t(viewMeta[id].labelKey), icon: viewMeta[id].icon }));

  return (
    <div
      className="h-full flex items-stretch justify-center gap-2 lg:gap-3 xl:gap-4 2xl:gap-5 min-w-0 overflow-hidden"
      data-onboarding="view-switcher"
    >
      {views.map((view) => (
        <button
          key={view.id}
          onClick={() => {
            void dispatchFeedInteraction({ type: "ui.view.change", view: view.id });
          }}
          className={cn(
            "h-full min-w-0 flex items-center gap-1 xl:gap-2 px-1 lg:px-2 xl:px-4 2xl:px-5 text-sm font-medium transition-colors border-b-2 xl:text-base",
            currentView === view.id
              ? "text-foreground border-primary"
              : "text-muted-foreground border-transparent hover:text-foreground hover:border-foreground/30"
          )}
          title={t("navigation.views.switchTo", { view: view.label })}
        >
          {view.icon}
          <span className="inline truncate max-w-24 lg:max-w-none">{view.label}</span>
        </button>
      ))}
    </div>
  );
}
