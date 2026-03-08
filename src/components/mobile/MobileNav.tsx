import { Filter, GitBranch, LayoutList, Calendar, List } from "lucide-react";
import { cn } from "@/lib/utils";
import { ViewType } from "@/components/tasks/ViewSwitcher";
import { useTranslation } from "react-i18next";

export type MobileViewType = ViewType | "filters";

interface MobileNavProps {
  currentView: MobileViewType;
  onViewChange: (view: MobileViewType) => void;
}

export function MobileNav({ currentView, onViewChange }: MobileNavProps) {
  const { t } = useTranslation();
  const navItems: { id: MobileViewType; label: string; icon: React.ReactNode }[] = [
    { id: "filters", label: t("navigation.views.manage"), icon: <Filter className="w-5 h-5" /> },
    { id: "feed", label: t("navigation.views.feed"), icon: <LayoutList className="w-5 h-5" /> },
    { id: "tree", label: t("navigation.views.tree"), icon: <GitBranch className="w-5 h-5" /> },
    { id: "list", label: t("navigation.views.upcoming"), icon: <List className="w-5 h-5" /> },
    { id: "calendar", label: t("navigation.views.calendar"), icon: <Calendar className="w-5 h-5" /> },
  ];
  return (
    <nav 
      className="flex items-center justify-around border-b border-border bg-background/95 backdrop-blur-sm px-1 py-1 safe-area-top"
      role="tablist"
      aria-label={t("navigation.aria.views")}
      data-onboarding="mobile-nav"
    >
      {navItems.map((item) => (
        <button
          key={item.id}
          onClick={() => onViewChange(item.id)}
          data-onboarding={item.id === "filters" ? "mobile-nav-manage" : undefined}
          role="tab"
          aria-selected={currentView === item.id}
          aria-label={t("navigation.views.switchTo", { view: item.label })}
          title={t("navigation.views.switchTo", { view: item.label })}
          className={cn(
            "flex flex-col items-center justify-center gap-1 rounded-lg transition-colors flex-1 min-w-0 touch-target focus:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-95",
            currentView === item.id
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:text-foreground active:bg-muted/50"
          )}
        >
          {item.icon}
          <span className="text-[0.65rem] font-medium truncate leading-none">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
