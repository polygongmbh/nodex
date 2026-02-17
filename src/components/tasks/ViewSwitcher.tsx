import { LayoutList, Columns3, GitBranch, Calendar, List } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

export type ViewType = "tree" | "feed" | "kanban" | "calendar" | "list";

interface ViewSwitcherProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
}

export function ViewSwitcher({ currentView, onViewChange }: ViewSwitcherProps) {
  const { t } = useTranslation();
  const views: { id: ViewType; label: string; icon: React.ReactNode }[] = [
    { id: "tree", label: t("navigation.views.tree"), icon: <GitBranch className="w-4 h-4 xl:w-5 xl:h-5" /> },
    { id: "feed", label: t("navigation.views.feed"), icon: <LayoutList className="w-4 h-4 xl:w-5 xl:h-5" /> },
    { id: "kanban", label: t("navigation.views.kanban"), icon: <Columns3 className="w-4 h-4 xl:w-5 xl:h-5" /> },
    { id: "calendar", label: t("navigation.views.calendar"), icon: <Calendar className="w-4 h-4 xl:w-5 xl:h-5" /> },
    { id: "list", label: t("navigation.views.list"), icon: <List className="w-4 h-4 xl:w-5 xl:h-5" /> },
  ];

  return (
    <div
      className="h-full flex items-stretch justify-center gap-3 sm:gap-4 lg:gap-5 min-w-0 overflow-x-auto"
      data-onboarding="view-switcher"
      aria-label={t("navigation.aria.viewSwitcher")}
    >
      {views.map((view) => (
        <button
          key={view.id}
          onClick={() => onViewChange(view.id)}
          className={cn(
            "h-full flex items-center gap-1 px-1 lg:px-2 text-sm font-medium transition-colors flex-shrink-0 border-b-2 xl:text-base",
            currentView === view.id
              ? "text-foreground border-primary"
              : "text-muted-foreground border-transparent hover:text-foreground hover:border-foreground/30"
          )}
          title={t("navigation.views.switchTo", { view: view.label })}
          aria-label={t("navigation.views.switchTo", { view: view.label })}
          aria-current={currentView === view.id ? "page" : undefined}
        >
          {view.icon}
          <span className="hidden sm:inline">{view.label}</span>
        </button>
      ))}
    </div>
  );
}
