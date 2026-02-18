import { Search, Layers, Leaf } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "react-i18next";

export type KanbanDepthMode = "1" | "2" | "3" | "all" | "leaves";

interface DesktopSearchDockProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  showKanbanLevels?: boolean;
  kanbanDepthMode?: KanbanDepthMode;
  onKanbanDepthModeChange?: (mode: KanbanDepthMode) => void;
}

export function DesktopSearchDock({
  searchQuery,
  onSearchChange,
  showKanbanLevels = false,
  kanbanDepthMode = "leaves",
  onKanbanDepthModeChange,
}: DesktopSearchDockProps) {
  const { t } = useTranslation();
  return (
    <div className="relative flex-shrink-0 border-t border-border bg-background/80 backdrop-blur-md">
      <div className="absolute inset-x-0 -top-8 h-8 bg-gradient-to-t from-background to-transparent pointer-events-none" />
      <div className="px-4 py-3 flex items-center gap-3">
        <div className="relative mx-auto w-full flex-1 max-w-xl lg:max-w-[68vw] xl:max-w-[72vw] 2xl:max-w-[76vw]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            data-onboarding="search-bar"
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("search.desktop.placeholder")}
            className="w-full bg-muted/60 border border-border/50 rounded-xl pl-9 pr-4 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/30 shadow-sm"
          />
        </div>
        {showKanbanLevels && onKanbanDepthModeChange && (
          <div className="flex items-center gap-1.5 flex-shrink-0" data-onboarding="kanban-levels">
            <Layers className="w-4 h-4 text-muted-foreground" />
            <Select value={kanbanDepthMode} onValueChange={(v) => onKanbanDepthModeChange(v as KanbanDepthMode)}>
              <SelectTrigger className="w-[150px] h-8 text-sm bg-muted/60 border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">{t("search.kanban.topLevel")}</SelectItem>
                <SelectItem value="2">{t("search.kanban.levels", { count: 2 })}</SelectItem>
                <SelectItem value="3">{t("search.kanban.levels", { count: 3 })}</SelectItem>
                <SelectItem value="all">{t("search.kanban.allLevels")}</SelectItem>
                <SelectItem value="leaves">
                  <span className="flex items-center gap-1">
                    <Leaf className="w-3 h-3" />
                    {t("search.kanban.leavesOnly")}
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  );
}
