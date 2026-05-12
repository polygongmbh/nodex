import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { StatusTimelineItem } from "./StatusTimelineItem";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { selectStatusTimelinePosts } from "./status-filters";
import type { Task } from "@/types";

const TIMELINE_LIMIT = 40;

interface StatusTimelineProps {
  contextTasks: Task[];
  focusedTaskId: string | null;
  concernsScope: Set<string>;
}

/**
 * Simplified, read-only timeline for the status view: top-level posts of the
 * current context plus comments and any items concerning the scope (no
 * status-update entries, no composer).
 */
export function StatusTimeline({ contextTasks, focusedTaskId, concernsScope }: StatusTimelineProps) {
  const { t } = useTranslation("tasks");
  const { people } = useFeedSurfaceState();
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const posts = useMemo(
    () => selectStatusTimelinePosts({ contextTasks, focusedTaskId, concernsScope }),
    [contextTasks, focusedTaskId, concernsScope]
  );

  if (posts.length === 0) return null;

  const visiblePosts = posts.slice(0, TIMELINE_LIMIT);
  const hiddenCount = posts.length - visiblePosts.length;

  return (
    <div className="scrollbar-main-view h-full overflow-y-auto">
      {visiblePosts.map((task) => (
        <StatusTimelineItem key={task.id} task={task} people={people} />
      ))}
      {hiddenCount > 0 && (
        <div className="px-3 py-3">
          <button
            type="button"
            onClick={() => {
              void dispatchFeedInteraction({ type: "ui.view.change", view: "feed" });
            }}
            className="w-full rounded-md px-3 py-2 text-center text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {t("status.timeline.viewMore", {
              count: hiddenCount,
              defaultValue: "View {{count}} more in feed",
            })}
          </button>
        </div>
      )}
    </div>
  );
}
