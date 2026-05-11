import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { StatusProjectsRow } from "./StatusProjectsRow";
import { StatusMyTasksTree } from "./StatusMyTasksTree";
import { StatusTimeline } from "./StatusTimeline";
import { resolveStatusPeopleScope } from "./status-filters";
import { getIncludedExcludedChannelNames } from "@/domain/content/channel-filtering";
import { filterTasksForView } from "@/domain/content/task-view-filtering";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { useFeedTaskViewModel } from "@/features/feed-page/views/feed-task-view-model-context";
import { useTaskViewSource } from "@/features/feed-page/controllers/use-task-view-states";
import { useIsMobile } from "@/hooks/use-mobile";

export function StatusView() {
  const { t } = useTranslation("tasks");
  const isMobile = useIsMobile();
  const viewModel = useFeedTaskViewModel();
  const surface = useFeedSurfaceState();
  const taskSource = useTaskViewSource({
    tasks: viewModel.tasks,
    allTasks: viewModel.allTasks,
    focusedTaskId: viewModel.focusedTaskId,
  });
  const { included, excluded } = useMemo(
    () => getIncludedExcludedChannelNames(taskSource.channels),
    [taskSource.channels]
  );
  const contextTasks = useMemo(
    () =>
      filterTasksForView({
        source: {
          allTasks: taskSource.allTasks,
          filterIndex: taskSource.filterIndex,
          prefilteredTaskIds: taskSource.prefilteredTaskIds,
          people: taskSource.people,
        },
        scope: {
          focusedTaskId: taskSource.focusedTaskId,
          hideClosedTasks: false,
        },
        criteria: {
          searchQuery: taskSource.searchQuery,
          quickFilters: taskSource.quickFilters,
          channels: { included, excluded, matchMode: taskSource.channelMatchMode },
        },
      }),
    [
      excluded,
      included,
      taskSource.allTasks,
      taskSource.channelMatchMode,
      taskSource.filterIndex,
      taskSource.focusedTaskId,
      taskSource.people,
      taskSource.prefilteredTaskIds,
      taskSource.quickFilters,
      taskSource.searchQuery,
    ]
  );

  const peopleScope = useMemo(() => {
    const selectedPubkeys = surface.people.filter((p) => p.isSelected).map((p) => p.pubkey);
    return resolveStatusPeopleScope(selectedPubkeys, viewModel.currentUser?.pubkey);
  }, [surface.people, viewModel.currentUser?.pubkey]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <StatusProjectsRow
        contextTasks={contextTasks}
        allTasks={taskSource.allTasks}
        focusedTaskId={taskSource.focusedTaskId}
      />
      <div className={isMobile ? "flex flex-1 min-h-0 flex-col divide-y divide-border" : "flex flex-1 min-h-0 divide-x divide-border"}>
        <div className={isMobile ? "min-h-0 flex-1 overflow-hidden" : "min-h-0 flex-1 overflow-hidden"}>
          <SectionHeader label={t("status.myTasks.label", { defaultValue: "My tasks" })} />
          <div className="h-[calc(100%-2rem)]">
            <StatusMyTasksTree
              contextTasks={contextTasks}
              allTasks={taskSource.allTasks}
              peopleScope={peopleScope}
            />
          </div>
        </div>
        <div className={isMobile ? "min-h-0 flex-1 overflow-hidden" : "min-h-0 flex-1 overflow-hidden"}>
          <SectionHeader label={t("status.timeline.label", { defaultValue: "Recent" })} />
          <div className="h-[calc(100%-2rem)]">
            <StatusTimeline
              contextTasks={contextTasks}
              focusedTaskId={taskSource.focusedTaskId}
              peopleScope={peopleScope}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex h-8 items-center border-b border-border bg-muted/30 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {label}
    </div>
  );
}
