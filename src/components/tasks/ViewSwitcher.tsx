import { Home, LayoutList, Columns3, GitBranch, Calendar, List, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";

export const VIEW_ORDER = ["home", "status", "feed", "tree", "kanban", "list", "calendar"] as const;
export type ViewType = (typeof VIEW_ORDER)[number];

// Tree and list are reachable via direct URL but hidden from the desktop nav.
const DESKTOP_NAV_VIEWS = VIEW_ORDER.filter((v) => v !== "tree" && v !== "list");

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
