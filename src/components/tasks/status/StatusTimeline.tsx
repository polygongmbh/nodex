import { useMemo } from "react";
import { StatusTimelineItem } from "./StatusTimelineItem";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { selectStatusTimelinePosts } from "./status-filters";
import type { Task } from "@/types";

interface StatusTimelineProps {
  contextTasks: Task[];
  focusedTaskId: string | null;
  peopleScope: Set<string>;
}

/**
 * Simplified, read-only timeline for the status view: only root posts of the
 * current context, no status-update entries, no composer.
 */
export function StatusTimeline({ contextTasks, focusedTaskId, peopleScope }: StatusTimelineProps) {
  const { people } = useFeedSurfaceState();
  const posts = useMemo(
    () => selectStatusTimelinePosts({ contextTasks, focusedTaskId, peopleScope }),
    [contextTasks, focusedTaskId, peopleScope]
  );

  if (posts.length === 0) return null;

  return (
    <div className="scrollbar-main-view h-full overflow-y-auto">
      {posts.map((task) => (
        <StatusTimelineItem key={task.id} task={task} people={people} />
      ))}
    </div>
  );
}
