import { useMemo } from "react";
import { StatusTimelineItem } from "./StatusTimelineItem";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { selectStatusTimelinePosts } from "./status-filters";
import type { Task } from "@/types";

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
  const { people } = useFeedSurfaceState();
  const posts = useMemo(
    () => selectStatusTimelinePosts({ contextTasks, focusedTaskId, concernsScope }),
    [contextTasks, focusedTaskId, concernsScope]
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
