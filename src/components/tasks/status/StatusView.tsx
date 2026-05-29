import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { StatusProjectsRow } from "./StatusProjectsRow";
import { StatusMyTasksTree } from "./StatusMyTasksTree";
import { StatusTimeline } from "./StatusTimeline";
import { resolveStatusConcernsScope, resolveStatusPeopleScope } from "./status-filters";
import { getIncludedExcludedChannelNames } from "@/domain/content/channel-filtering";
import { buildTaskViewFilterIndex, filterTasksForView } from "@/domain/content/task-view-filtering";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { useFilterStore } from "@/features/feed-page/stores/filter-store";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCurrentUser } from "@/features/feed-page/stores/current-user-store";
import type { Post } from "@/types";

export function StatusView({
  posts,
  focusedTaskId,
}: {
  posts: Post[];
  focusedTaskId: string | null;
}) {
  const { t } = useTranslation("tasks");
  const isMobile = useIsMobile();
  const currentUser = useCurrentUser();
  const { channels, people, quickFilters } = useFeedSurfaceState();
  const searchQuery = useFilterStore((s) => s.searchQuery);
  const channelMatchMode = useFilterStore((s) => s.channelMatchMode);
  const filterIndex = useMemo(() => buildTaskViewFilterIndex(posts, people), [posts, people]);
  const prefilteredTaskIds = useMemo(() => new Set(posts.map((task) => task.id)), [posts]);
  const { included, excluded } = useMemo(
    () => getIncludedExcludedChannelNames(channels),
    [channels]
  );
  const contextTasks = useMemo(
    () =>
      filterTasksForView({
        source: {
          allTasks: posts,
          filterIndex,
          prefilteredTaskIds,
          people,
        },
        scope: {
          focusedTaskId,
          hideClosedTasks: false,
        },
        criteria: {
          searchQuery,
          quickFilters,
          channels: { included, excluded, matchMode: channelMatchMode },
        },
      }),
    [
      excluded,
      included,
      posts,
      channelMatchMode,
      filterIndex,
      focusedTaskId,
      people,
      prefilteredTaskIds,
      quickFilters,
      searchQuery,
    ]
  );

  const selectedPeoplePubkeys = useMemo(
    () => people.filter((p) => p.isSelected).map((p) => p.pubkey),
    [people]
  );
  // "My tasks" falls back to the signed-in user when nobody is selected — it's
  // the personal column. The timeline's concerns scope is additive: it pulls
  // in items that involve the current user OR any sidebar-selected people, in
  // addition to the top-level items everyone sees.
  const myTasksPeopleScope = useMemo(
    () => resolveStatusPeopleScope(selectedPeoplePubkeys, currentUser?.pubkey),
    [selectedPeoplePubkeys, currentUser?.pubkey]
  );
  const timelineConcernsScope = useMemo(
    () => resolveStatusConcernsScope(selectedPeoplePubkeys, currentUser?.pubkey),
    [selectedPeoplePubkeys, currentUser?.pubkey]
  );
  const pinnedChannelIds = useMemo(
    () =>
      new Set(
        channels
          .filter((channel) => channel.pinIndex !== undefined)
          .map((channel) => channel.id)
      ),
    [channels]
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <StatusProjectsRow
        contextTasks={contextTasks}
        allTasks={posts}
        focusedTaskId={focusedTaskId}
      />
      <div className={isMobile ? "flex flex-1 min-h-0 flex-col divide-y divide-border" : "flex flex-1 min-h-0 divide-x divide-border"}>
        <div className={isMobile ? "min-h-0 flex-1 overflow-hidden" : "min-h-0 flex-1 overflow-hidden"}>
          <SectionHeader label={t("status.myTasks.label")} />
          <div className="h-[calc(100%-2rem)]">
            <StatusMyTasksTree
              contextTasks={contextTasks}
              allTasks={posts}
              peopleScope={myTasksPeopleScope}
              focusedTaskId={focusedTaskId}
            />
          </div>
        </div>
        <div className={isMobile ? "min-h-0 flex-1 overflow-hidden" : "min-h-0 flex-1 overflow-hidden"}>
          <SectionHeader label={t("status.timeline.label")} />
          <div className="h-[calc(100%-2rem)]">
            <StatusTimeline
              contextTasks={contextTasks}
              allTasks={posts}
              focusedTaskId={focusedTaskId}
              concernsScope={timelineConcernsScope}
              pinnedChannelIds={pinnedChannelIds}
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
