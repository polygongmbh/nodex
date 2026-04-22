import { useMemo } from "react";
import { Search, Layers, Leaf, CircleDot, Workflow, Network, FolderOpen, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VersionHint } from "@/components/layout/VersionHint";
import { LegalDialog } from "@/components/legal/LegalDialog";
import { useTranslation } from "react-i18next";
import { buildComposerPlaceholder } from "@/lib/composer-placeholder";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { useFeedTaskViewModel } from "@/features/feed-page/views/feed-task-view-model-context";
import { useFeedViewState } from "@/features/feed-page/views/feed-view-state-context";
import { getCompactPersonLabel } from "@/types/person";

export type KanbanDepthMode = "1" | "2" | "3" | "all" | "leaves" | "projects";

export function DesktopSearchDock() {
  const { t, i18n } = useTranslation("filters");
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const { searchQuery, channels = [], people = [] } = useFeedSurfaceState();
  const { allTasks, focusedTaskId } = useFeedTaskViewModel();
  const { currentView, kanbanDepthMode } = useFeedViewState();
  const showKanbanLevels = currentView === "kanban" || currentView === "list";
  const contextTaskTitle = focusedTaskId
    ? allTasks.find((task) => task.id === focusedTaskId)?.content ?? ""
    : "";
  const searchPlaceholder = useMemo(() => {
    const translatePlaceholder = (key: string, values?: Record<string, unknown>) =>
      key.startsWith("composer.")
        ? t(`composer:${key}`, values)
        : t(key, values);
    const channelNames = channels
      .filter((channel) => channel.filterState === "included")
      .map((channel) => channel.name);
    const mentionLabels = people
      .filter((person) => person.isSelected)
      .map((person) => getCompactPersonLabel(person));
    return buildComposerPlaceholder({
      baseKey: "search.desktop.placeholder",
      contextTaskTitle,
      channelNames,
      mentionLabels,
      includeFallbackGuidance: false,
      locale: i18n.resolvedLanguage || i18n.language || "en",
      t: translatePlaceholder,
    });
  }, [channels, contextTaskTitle, i18n.language, i18n.resolvedLanguage, people, t]);
  return (
    <div className="relative flex-shrink-0 border-t border-border bg-background/80 backdrop-blur-md">
      <div className="absolute inset-x-0 -top-8 h-8 bg-gradient-to-t from-background to-transparent pointer-events-none" />
      <div className="px-3 py-3 flex items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            data-onboarding="search-bar"
            autoFocus
            type="text"
            value={searchQuery}
            onChange={(e) => {
              void dispatchFeedInteraction({ type: "ui.search.change", query: e.target.value });
            }}
            placeholder={searchPlaceholder}
            className="w-full bg-muted/60 border border-border/50 rounded-xl pl-9 pr-10 py-2 text-sm placeholder:text-muted-foreground/65 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/30 shadow-sm"
          />
          {searchQuery.length > 0 && (
            <button
              type="button"
              onClick={() => {
                void dispatchFeedInteraction({ type: "ui.search.change", query: "" });
              }}
              aria-label={t("search.desktop.clear")}
              title={t("search.desktop.clear")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {showKanbanLevels && (
          <div className="flex items-center gap-1.5 flex-shrink-0" data-onboarding="kanban-levels">
            <Layers className="w-4 h-4 text-muted-foreground" />
            <Select
              value={kanbanDepthMode}
              onValueChange={(v) => {
                void dispatchFeedInteraction({ type: "ui.kanbanDepth.change", mode: v as KanbanDepthMode });
              }}
            >
              <SelectTrigger
                className="w-[150px] h-8 rounded-md border-border/50 bg-transparent text-sm shadow-none focus:ring-1 focus:ring-primary/30"
                aria-label={t("search.kanban.depthHint")}
                title={t("search.kanban.depthHint")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1" title={t("search.kanban.topLevelHint")}>
                  <span className="flex items-center gap-1">
                    <CircleDot className="w-3 h-3" />
                    {t("search.kanban.topLevel")}
                  </span>
                </SelectItem>
                <SelectItem value="projects" title={t("search.kanban.projectsOnlyHint")}>
                  <span className="flex items-center gap-1">
                    <FolderOpen className="w-3 h-3" />
                    {t("search.kanban.projectsOnly")}
                  </span>
                </SelectItem>
                <SelectItem value="2" title={t("search.kanban.levelsHint", { count: 2 })}>
                  <span className="flex items-center gap-1">
                    <Workflow className="w-3 h-3" />
                    {t("search.kanban.levels", { count: 2 })}
                  </span>
                </SelectItem>
                <SelectItem value="3" title={t("search.kanban.levelsHint", { count: 3 })}>
                  <span className="flex items-center gap-1">
                    <Network className="w-3 h-3" />
                    {t("search.kanban.levels", { count: 3 })}
                  </span>
                </SelectItem>
                <SelectItem value="all" title={t("search.kanban.allLevelsHint")}>
                  <span className="flex items-center gap-1">
                    <Layers className="w-3 h-3" />
                    {t("search.kanban.allLevels")}
                  </span>
                </SelectItem>
                <SelectItem value="leaves" title={t("search.kanban.leavesOnlyHint")}>
                  <span className="flex items-center gap-1">
                    <Leaf className="w-3 h-3" />
                    {t("search.kanban.leavesOnly")}
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <LegalDialog
            triggerLabel={t("shell:legal.buttons.imprint")}
            triggerClassName="rounded bg-background/70 px-1.5 py-0.5 backdrop-blur-sm border border-border/60"
            showMailIcon
            mailIconClassName="rounded bg-background/70 backdrop-blur-sm border border-border/60"
          />
          <VersionHint className="rounded bg-background/70 px-1.5 py-0.5 backdrop-blur-sm border border-border/60" />
        </div>
      </div>
    </div>
  );
}
