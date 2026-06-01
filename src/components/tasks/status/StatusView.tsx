import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { GitBranch, LayoutList, Plus, X } from "lucide-react";
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
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { useAuthActionPolicy } from "@/features/auth/controllers/use-auth-action-policy";
import { TaskCreateComposer } from "@/components/tasks/TaskCreateComposer";
import { useComposerSubmitHandler } from "@/components/tasks/use-composer-submit-handler";
import type { ViewType } from "@/components/tasks/ViewSwitcher";
import type { Post, PostType } from "@/types";

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
  const pinnedChannelIds = useMemo(
    () =>
      new Set(
        channels
          .filter((channel) => channel.pinIndex !== undefined)
          .map((channel) => channel.id)
      ),
    [channels]
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
          <SectionHeader
            label={t("status.myTasks.label")}
            targetView="tree"
            viewIcon={<GitBranch className="w-4 h-4" />}
            canCreate={authPolicy.canOpenCompose}
            onCreate={() => setComposerOpenFor("myTasks")}
          />
          {composerOpenFor === "myTasks" && (
            <HeaderComposer
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
          <SectionHeader
            label={t("status.timeline.label")}
            targetView="feed"
            viewIcon={<LayoutList className="w-4 h-4" />}
            canCreate={authPolicy.canOpenCompose}
            onCreate={() => setComposerOpenFor("activity")}
          />
          {composerOpenFor === "activity" && (
            <HeaderComposer
              label={t("status.timeline.label")}
              focusedTaskId={focusedTaskId}
              allowedPostTypes={["task", "comment"]}
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

function SectionHeader({
  label,
  targetView,
  viewIcon,
  canCreate,
  onCreate,
}: {
  label: string;
  targetView: ViewType;
  viewIcon: React.ReactNode;
  canCreate: boolean;
  onCreate: () => void;
}) {
  const { t } = useTranslation("tasks");
  const dispatch = useFeedInteractionDispatch();
  return (
    <div className="flex h-8 items-center border-b border-border bg-muted/30 pl-3 pr-1 text-xs font-medium uppercase tracking-wide text-muted-foreground flex-shrink-0">
      <button
        type="button"
        onClick={() => void dispatch({ type: "ui.view.change", view: targetView })}
        className="flex-1 text-left hover:text-foreground transition-colors"
        title={t("status.showView", { view: label })}
      >
        {label}
      </button>
      {canCreate && (
        <button
          type="button"
          onClick={onCreate}
          className="relative p-1 rounded hover:bg-muted hover:text-foreground transition-colors"
          title={t("status.headerCreate")}
        >
          {viewIcon}
          <Plus
            className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-muted/80"
            strokeWidth={3}
          />
        </button>
      )}
    </div>
  );
}

function HeaderComposer({
  label,
  focusedTaskId,
  allowedPostTypes,
  onClose,
}: {
  label: string;
  focusedTaskId: string | null;
  allowedPostTypes: readonly PostType[];
  onClose: () => void;
}) {
  const handleSubmit = useComposerSubmitHandler({
    focusedTaskId,
    closeOnSuccess: true,
    onCancel: onClose,
  });
  return (
    <div className="p-3 border-b border-border bg-card/50 flex-shrink-0">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <button
          type="button"
          onClick={onClose}
          className="p-0.5 rounded hover:bg-muted"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
      <TaskCreateComposer
        onCancel={onClose}
        onSubmit={handleSubmit}
        compact
        focusedTaskId={focusedTaskId}
        allowedPostTypes={allowedPostTypes}
      />
    </div>
  );
}
