import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckSquare, MessageSquare } from "lucide-react";
import { StatusProjectsRow } from "./StatusProjectsRow";
import { StatusMyTasksTree } from "./StatusMyTasksTree";
import { StatusTimeline } from "./StatusTimeline";
import { StatusSectionHeader } from "./StatusSectionHeader";
import { StatusHeaderComposer } from "./StatusHeaderComposer";
import { resolveStatusConcernsScope, resolveStatusPeopleScope } from "./status-filters";
import { getIncludedExcludedChannelNames } from "@/domain/content/channel-filtering";
import { buildTaskViewFilterIndex, filterTasksForView } from "@/domain/content/task-view-filtering";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { useFilterStore } from "@/features/feed-page/stores/filter-store";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCurrentUser } from "@/features/feed-page/stores/current-user-store";
import { useAuthActionPolicy } from "@/features/auth/controllers/use-auth-action-policy";
import type { Post } from "@/types";

type ComposerSlot = "myTasks" | "activity";

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
  // Pinned channels widen the timeline beyond the current context, but once a
  // channel is exclusively included (e.g. a mobile chip tap) the timeline must
  // show only that channel — so drop the pinned expansion while one is active.
  const pinnedChannelIds = useMemo(
    () =>
      included.length > 0
        ? new Set<string>()
        : new Set(
            channels
              .filter((channel) => channel.pinIndex !== undefined)
              .map((channel) => channel.id)
          ),
    [channels, included]
  );

  const authPolicy = useAuthActionPolicy();
  const [composerOpenFor, setComposerOpenFor] = useState<ComposerSlot | null>(null);
  const closeComposer = () => setComposerOpenFor(null);

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <StatusProjectsRow
        contextTasks={contextTasks}
        allTasks={posts}
        focusedTaskId={focusedTaskId}
      />
      <div className={isMobile ? "flex flex-1 min-h-0 flex-col divide-y divide-border" : "flex flex-1 min-h-0 divide-x divide-border"}>
        <div className="min-h-0 flex-1 flex flex-col overflow-hidden">
          <StatusSectionHeader
            label={t("status.myTasks.label")}
            targetView="tree"
            createIcon={<CheckSquare className="w-4 h-4" />}
            canCreate={authPolicy.canOpenCompose}
            onCreate={() => setComposerOpenFor("myTasks")}
          />
          {composerOpenFor === "myTasks" && (
            <StatusHeaderComposer
              label={t("status.myTasks.label")}
              focusedTaskId={focusedTaskId}
              allowedPostTypes={["task"]}
              onClose={closeComposer}
            />
          )}
          <div className="min-h-0 flex-1 overflow-hidden">
            <StatusMyTasksTree
              contextTasks={contextTasks}
              allTasks={posts}
              peopleScope={myTasksPeopleScope}
              focusedTaskId={focusedTaskId}
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 flex flex-col overflow-hidden">
          <StatusSectionHeader
            label={t("status.timeline.label")}
            targetView="feed"
            createIcon={<MessageSquare className="w-4 h-4" />}
            canCreate={authPolicy.canOpenCompose}
            onCreate={() => setComposerOpenFor("activity")}
          />
          {composerOpenFor === "activity" && (
            <StatusHeaderComposer
              label={t("status.timeline.label")}
              focusedTaskId={focusedTaskId}
              allowedPostTypes={["comment"]}
              onClose={closeComposer}
            />
          )}
          <div className="min-h-0 flex-1 overflow-hidden">
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

