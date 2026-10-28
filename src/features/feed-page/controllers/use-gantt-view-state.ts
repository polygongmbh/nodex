import { useMemo } from "react";
import { buildGanttRows, type GanttRow } from "@/domain/content/gantt-rows";
import { useFilterStore } from "@/features/feed-page/stores/filter-store";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { isTaskPost, type Post, type TaskPost } from "@/types";
import { useTaskViewFiltering } from "./use-task-view-filtering";

/** Context-filtered tasks (sidebar filters + focused subtree) as Gantt rows. */
export function useGanttViewState({
  posts,
  focusedTaskId,
}: {
  posts: Post[];
  focusedTaskId: string | null;
}): GanttRow[] {
  const { channels, people, quickFilters } = useFeedSurfaceState();
  const searchQuery = useFilterStore((s) => s.searchQuery);
  const channelMatchMode = useFilterStore((s) => s.channelMatchMode);
  const selectedPubkeys = useFilterStore((s) => s.selectedPubkeys);
  const tasks = useTaskViewFiltering<TaskPost>({
    posts,
    focusedTaskId,
    searchQuery,
    people,
    selectedPubkeys,
    quickFilters,
    channels,
    channelMatchMode,
    taskPredicate: isTaskPost,
  });
  return useMemo(() => buildGanttRows(tasks), [tasks]);
}
