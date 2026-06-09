import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckSquare } from "lucide-react";
import { FeedView } from "@/components/tasks/FeedView";
import { StatusSectionHeader } from "@/components/tasks/status/StatusSectionHeader";
import { StatusHeaderComposer } from "@/components/tasks/status/StatusHeaderComposer";
import { HomeMyTasksPanel } from "./HomeMyTasksPanel";
import { HomeMiniCalendar } from "./HomeMiniCalendar";
import { useHomeViewState } from "@/features/feed-page/controllers/use-home-view-state";
import { useAuthActionPolicy } from "@/features/auth/controllers/use-auth-action-policy";
import type { Post } from "@/types";

/**
 * Desktop-only home view: the timeline on the left (home scope — top-level
 * activity plus the signed-in user's, unless sidebar filters widen it), the
 * my-tasks panel on the right, and a mini month calendar below it whose
 * selected day scopes both panels and pre-fills composer dates.
 */
export function HomeView({
  posts,
  focusedTaskId,
}: {
  posts: Post[];
  focusedTaskId: string | null;
}) {
  const { t } = useTranslation("tasks");
  const authPolicy = useAuthActionPolicy();
  const [isMyTasksComposerOpen, setIsMyTasksComposerOpen] = useState(false);
  const {
    myTasksContextTasks,
    myTasksPeopleScope,
    isMyTasksEmptyForSelectedDay,
    eventDayKeys,
    selectedDayKey,
    toggleSelectedDay,
    composerDefaultDates,
  } = useHomeViewState({ posts, focusedTaskId });

  return (
    <div className="flex h-full min-h-0 w-full divide-x divide-border">
      <div className="min-h-0 flex-1 flex flex-col overflow-hidden">
        <StatusSectionHeader label={t("status.timeline.label")} targetView="feed" />
        <div className="min-h-0 flex-1 overflow-hidden">
          <FeedView posts={posts} focusedTaskId={focusedTaskId} scope="home" />
        </div>
      </div>
      <div className="flex w-72 xl:w-96 min-h-0 flex-col overflow-hidden">
        <StatusSectionHeader
          label={t("status.myTasks.label")}
          targetView="tree"
          createIcon={<CheckSquare className="w-4 h-4" />}
          canCreate={authPolicy.canOpenCompose}
          onCreate={() => setIsMyTasksComposerOpen(true)}
        />
        {isMyTasksComposerOpen && (
          <StatusHeaderComposer
            label={t("status.myTasks.label")}
            focusedTaskId={focusedTaskId}
            allowedPostTypes={["task"]}
            onClose={() => setIsMyTasksComposerOpen(false)}
            defaultDates={composerDefaultDates}
          />
        )}
        <div className="min-h-0 flex-1 overflow-hidden">
          <HomeMyTasksPanel
            contextTasks={myTasksContextTasks}
            allTasks={posts}
            peopleScope={myTasksPeopleScope}
            focusedTaskId={focusedTaskId}
            showEmptyDayHint={isMyTasksEmptyForSelectedDay}
          />
        </div>
        <div className="flex justify-center border-t border-border py-1 flex-shrink-0">
          <HomeMiniCalendar
            eventDayKeys={eventDayKeys}
            selectedDayKey={selectedDayKey}
            onToggleDay={toggleSelectedDay}
          />
        </div>
      </div>
    </div>
  );
}
